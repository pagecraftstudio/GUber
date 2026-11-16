-- 0033: every route has a return route (a linked pair).
--
-- MODEL (decided with the product owner, 16 Nov 2026)
--   * routes.return_route_id points at the route used for the way back. The link is MUTUAL: if A.return = B then B.return = A.
--     Each side stays an ordinary route, so trips, seats, search and the 0029 round-trip model work unchanged.
--   * A route is created WITH its return route in one atomic call (create_route_pair). The return side is either a reversed copy of the go
--     side (stops in reverse order, offsets measured from the other end, pickup and dropoff swapped) or its own list of stops.
--   * Clients can no longer insert into routes directly (the insert policy is dropped), so no route can exist without a return route, and a
--     client cannot change return_route_id by a direct update (trigger). Only the security-definer functions here do.
--   * EXISTING routes: backfill_route_returns() first pairs routes that are already each other's reverse (same company, origin and destination
--     swapped, both unpaired), then creates a reversed copy for every route still without a return. The plan limit trigger is OFF during the
--     backfill so a company at its limit does not abort the migration; those companies are simply at or over the limit afterwards.
--   * A pair counts ONCE against max_routes (trigger + my_plan_usage). Archiving or restoring one side does the same to the other.
-- NOT IN THIS MIGRATION: the dashboard form and revoking create_route_with_stops (phase B).
-- ROLLBACK:
--   drop trigger "170_archive_pair" on public.routes; drop function app_private.routes_archive_pair();
--   drop trigger enforce_limit on public.routes; create trigger enforce_limit before insert on public.routes for each row execute function app_private.enforce_limit('max_routes', 'deleted_at is null'); drop function app_private.enforce_route_limit(); and re-create my_plan_usage from 0024.
--   drop function public.create_route_pair(text, text, text, text, text, jsonb, jsonb);
--   drop function app_private.backfill_route_returns(); drop function app_private.reversed_stops(uuid, uuid);
--   drop trigger "160_return_pair_mutual" on public.routes; drop trigger "155_return_client_guard" on public.routes;
--   drop function app_private.routes_return_mutual(); drop function app_private.routes_return_client_guard();
--   create policy tenant_insert on public.routes for insert to authenticated with check (app_private.has_permission(company_id, 'routes.write'));
--   alter table public.routes drop column return_route_id;   (the reversed routes created by the backfill stay; delete them by hand if wanted)
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh (staging first). Immutable once applied.
set search_path = public, extensions;

alter table routes
  add column return_route_id uuid,
  add constraint routes_return_fk foreign key (company_id, return_route_id) references routes(company_id, id) on delete restrict,
  add constraint routes_return_not_self check (return_route_id is null or return_route_id <> id);
create unique index routes_return_uq on routes(company_id, return_route_id) where return_route_id is not null;

-- the link must be mutual by the end of the transaction (the pair is written in two steps)
create or replace function app_private.routes_return_mutual() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.return_route_id is null then return null; end if;
  if not exists (select 1 from public.routes r where r.id = new.return_route_id and r.company_id = new.company_id and r.return_route_id = new.id) then
    raise exception 'return route link must be mutual' using errcode = '23514'; end if;
  return null;
end $$;
create constraint trigger "160_return_pair_mutual" after insert or update of return_route_id on routes
  deferrable initially deferred for each row execute function app_private.routes_return_mutual();

-- a signed-in client (role authenticated) cannot set or change the link with a plain update; the definer functions below run as their owner
create or replace function app_private.routes_return_client_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.return_route_id is distinct from old.return_route_id then
    raise exception 'return route cannot be changed directly' using errcode = '42501'; end if;
  return new;
end $$;
create trigger "155_return_client_guard" before update of return_route_id on routes
  for each row execute function app_private.routes_return_client_guard();

-- routes now come only from create_route_pair
drop policy if exists tenant_insert on routes;

-- ======================= reversed copy of a route's stops =======================
-- Same stops, opposite direction: order reversed, offset = (last offset) - (old offset), pickup and dropoff swapped. Shape = save_route_stops input.
create or replace function app_private.reversed_stops(p_route uuid, p_company uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', s.name, 'address', s.address, 'latitude', s.latitude, 'longitude', s.longitude,
           'stopType', case s.stop_type when 'pickup' then 'dropoff' when 'dropoff' then 'pickup' else 'both' end,
           'offsetMinutes', t.total - s.offset_minutes, 'isActive', s.is_active) order by s.stop_order desc), '[]'::jsonb)
    from public.route_stops s
    cross join (select coalesce(max(x.offset_minutes), 0) as total from public.route_stops x where x.route_id = p_route and x.company_id = p_company) t
   where s.route_id = p_route and s.company_id = p_company;
$$;
revoke all on function app_private.reversed_stops(uuid, uuid) from public, anon, authenticated;

-- ======================= create a route together with its return route (atomic) =======================
-- p_return: {"sameAsReverse": true|false, "name"?, "code"?, "description"?, "origin"?, "destination"?, "stops"? (required when sameAsReverse is false)}
create or replace function public.create_route_pair(
  p_name text, p_code text, p_origin text, p_destination text, p_description text, p_stops jsonb, p_return jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_go uuid;
  v_ret uuid;
  v_same boolean;
  v_ret_stops jsonb;
  v_ret_name text;
  v_ret_origin text;
  v_ret_dest text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.user_id = v_uid and cu.status = 'active' limit 1;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if p_return is null or jsonb_typeof(p_return) <> 'object' or jsonb_typeof(p_return -> 'sameAsReverse') is distinct from 'boolean' then
    raise exception 'return route required: sameAsReverse must be true or false' using errcode = '22023'; end if;
  v_same := (p_return ->> 'sameAsReverse')::boolean;
  if not v_same and (jsonb_typeof(p_return -> 'stops') is distinct from 'array') then
    raise exception 'return route required: stops needed when the return is not the reverse of the go' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_origin, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_destination, ''))) not between 1 and 120
     or char_length(coalesce(p_code, '')) > 20 or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'invalid route' using errcode = '22023'; end if;

  insert into public.routes (company_id, name, code, origin_name, destination_name, description)
  values (v_company, btrim(p_name), nullif(btrim(coalesce(p_code, '')), ''), btrim(p_origin), btrim(p_destination),
          nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_go;
  perform public.save_route_stops(v_go, p_stops);

  v_ret_stops := case when v_same then app_private.reversed_stops(v_go, v_company) else p_return -> 'stops' end;
  v_ret_name := coalesce(nullif(btrim(coalesce(p_return ->> 'name', '')), ''), left(btrim(p_name), 108) || ' (return)');
  v_ret_origin := coalesce(nullif(btrim(coalesce(p_return ->> 'origin', '')), ''), btrim(p_destination));
  v_ret_dest := coalesce(nullif(btrim(coalesce(p_return ->> 'destination', '')), ''), btrim(p_origin));
  if char_length(v_ret_name) not between 2 and 120 or char_length(v_ret_origin) > 120 or char_length(v_ret_dest) > 120
     or char_length(coalesce(p_return ->> 'code', '')) > 20 or char_length(coalesce(p_return ->> 'description', '')) > 1000 then
    raise exception 'invalid return route' using errcode = '22023'; end if;

  insert into public.routes (company_id, name, code, origin_name, destination_name, description, return_route_id)
  values (v_company, v_ret_name, nullif(btrim(coalesce(p_return ->> 'code', '')), ''), v_ret_origin, v_ret_dest,
          nullif(btrim(coalesce(p_return ->> 'description', '')), ''), v_go)
  returning id into v_ret;
  perform public.save_route_stops(v_ret, v_ret_stops);   -- same rules as any route; a failure rolls the whole pair back
  update public.routes set return_route_id = v_ret where id = v_go and company_id = v_company;

  perform app_private.write_audit('company_user', v_company, 'route.pair_created', 'route', v_go,
    jsonb_build_object('return_route_id', v_ret, 'same_as_reverse', v_same));
  return jsonb_build_object('route_id', v_go, 'return_route_id', v_ret, 'same_as_reverse', v_same);
end $$;
revoke all on function public.create_route_pair(text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_route_pair(text, text, text, text, text, jsonb, jsonb) to authenticated;

-- ======================= backfill for existing routes =======================
create or replace function app_private.backfill_route_returns() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.routes%rowtype; q uuid; n uuid; v_paired int := 0; v_created int := 0; v_total int;
begin
  alter table public.routes disable trigger enforce_limit;    -- companies at their route limit must not abort this
  -- 1. routes that are already each other's reverse become a pair
  for r in select * from public.routes x where x.deleted_at is null and x.return_route_id is null order by x.created_at, x.id loop
    if (select y.return_route_id from public.routes y where y.id = r.id) is not null then continue; end if;
    select y.id into q from public.routes y
     where y.company_id = r.company_id and y.deleted_at is null and y.return_route_id is null and y.id <> r.id
       and lower(btrim(y.origin_name)) = lower(btrim(r.destination_name)) and lower(btrim(y.destination_name)) = lower(btrim(r.origin_name))
     order by y.created_at, y.id limit 1;
    if q is not null then
      update public.routes set return_route_id = q where id = r.id;
      update public.routes set return_route_id = r.id where id = q;
      v_paired := v_paired + 1;
    end if;
  end loop;
  -- 2. everything still unpaired gets a reversed copy
  for r in select * from public.routes x where x.deleted_at is null and x.return_route_id is null order by x.created_at, x.id loop
    insert into public.routes (company_id, name, origin_name, destination_name, description, is_active, return_route_id)
    values (r.company_id, left(r.name, 108) || ' (return)', r.destination_name, r.origin_name, r.description, r.is_active, r.id)
    returning id into n;
    insert into public.route_stops (company_id, route_id, name, address, latitude, longitude, stop_order, stop_type, offset_minutes, is_active)
    select s.company_id, n, s.name, s.address, s.latitude, s.longitude,
           row_number() over (order by s.stop_order desc),
           case s.stop_type when 'pickup' then 'dropoff' when 'dropoff' then 'pickup' else 'both' end,
           t.total - s.offset_minutes, s.is_active
      from public.route_stops s
      cross join (select coalesce(max(x.offset_minutes), 0) as total from public.route_stops x where x.route_id = r.id) t
     where s.route_id = r.id;
    update public.routes set return_route_id = n where id = r.id;
    v_created := v_created + 1;
  end loop;
  set constraints all immediate;                              -- settle the deferred pair checks before ALTER TABLE (pending trigger events block it)
  alter table public.routes enable trigger enforce_limit;
  v_total := v_paired + v_created;
  return jsonb_build_object('paired_existing', v_paired, 'created_reversed', v_created, 'pairs', v_total);
end $$;
revoke all on function app_private.backfill_route_returns() from public, anon, authenticated;


-- ======================= a pair counts ONCE against max_routes =======================
-- Decided with the product owner. A complete pair is counted through whichever side has the smaller id; a route without a return counts as one.
-- The return side is inserted already carrying the link (return_route_id set), so its insert is exempt: the limit was checked when the go side was inserted.
create or replace function app_private.enforce_route_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_count bigint;
begin
  if new.return_route_id is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || 'max_routes', 0));
  v_limit := app_private.entitlement_limit(new.company_id, 'max_routes');
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.routes x
   where x.company_id = new.company_id and x.deleted_at is null and (x.return_route_id is null or x.id < x.return_route_id);
  if v_count >= v_limit then
    raise exception 'plan limit reached: max_routes (%)', v_limit using errcode = '53400'; end if;
  return new;
end $$;
drop trigger enforce_limit on routes;
create trigger enforce_limit before insert on routes for each row execute function app_private.enforce_route_limit();

-- the dashboard usage numbers use the same rule
create or replace function public.my_plan_usage(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_plan uuid;
  v_tz text;
  v_limits jsonb := '{}'::jsonb;
  v_months jsonb := '{}'::jsonb;
  v_key text;
  v_lim integer;
  v_found boolean;
  v_used bigint;
  v_m0 timestamp;
  k int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_company is null or not exists (select 1 from app_private.current_company_ids() c where c = p_company) then
    raise exception 'company not found' using errcode = 'P0002'; end if;

  select ls.plan_id into v_plan from app_private.live_subscription(p_company) ls;
  if v_plan is null then return jsonb_build_object('status', 'no_subscription'); end if;

  foreach v_key in array array['max_users', 'max_buses', 'max_drivers', 'max_routes', 'max_trips_per_month'] loop
    v_found := null;
    select true, pe.int_value into v_found, v_lim from public.plan_entitlements pe where pe.plan_id = v_plan and pe.key = v_key;
    if v_found is null then v_lim := 0; end if;
    v_used := case v_key
      when 'max_users'   then (select count(*) from public.company_users x where x.company_id = p_company)
      when 'max_buses'   then (select count(*) from public.buses x where x.company_id = p_company)
      when 'max_drivers' then (select count(*) from public.drivers x where x.company_id = p_company)
      when 'max_routes'  then (select count(*) from public.routes x where x.company_id = p_company and x.deleted_at is null and (x.return_route_id is null or x.id < x.return_route_id))   -- a pair counts once (0033)
      else null end;
    v_limits := v_limits || jsonb_build_object(v_key, jsonb_build_object('limit', v_lim, 'used', v_used));
  end loop;

  select coalesce(cs.timezone, 'UTC') into v_tz from public.company_settings cs where cs.company_id = p_company;
  v_tz := coalesce(v_tz, 'UTC');
  v_m0 := date_trunc('month', now() at time zone v_tz);
  for k in 0 .. 3 loop
    select count(*) into v_used from public.trips t
     where t.company_id = p_company and t.status <> 'cancelled'
       and date_trunc('month', t.departure_at at time zone v_tz) = v_m0 + make_interval(months => k);
    v_months := v_months || jsonb_build_object(to_char(v_m0 + make_interval(months => k), 'YYYY-MM'), v_used);
  end loop;
  -- the per-month entry carries the limit; `used` for the current month is repeated for simple callers
  v_limits := jsonb_set(v_limits, '{max_trips_per_month,used}', to_jsonb((v_months -> to_char(v_m0, 'YYYY-MM'))::bigint));

  return jsonb_build_object('status', 'ok', 'limits', v_limits, 'trip_months', v_months);
end $$;
revoke all on function public.my_plan_usage(uuid) from public, anon;
grant execute on function public.my_plan_usage(uuid) to authenticated;

-- ======================= archive and restore a pair together =======================
create or replace function app_private.routes_archive_pair() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.return_route_id is not null then
    update public.routes p set deleted_at = new.deleted_at
     where p.id = new.return_route_id and p.company_id = new.company_id and p.deleted_at is distinct from new.deleted_at;
  end if;
  return null;
end $$;
create trigger "170_archive_pair" after update of deleted_at on routes
  for each row when (old.deleted_at is distinct from new.deleted_at) execute function app_private.routes_archive_pair();

select app_private.backfill_route_returns();
