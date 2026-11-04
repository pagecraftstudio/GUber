-- 0024: M2 remaining work - (1) atomic route-stop management, (2) read-only plan usage for form messages.
--
-- WHY
--   (1) Stops could only be created one by one (stopService.create) and never reordered or removed: stop_order is
--       deliberately not updatable through PostgREST ("needs an atomic multi-row operation", stops/schema.ts).
--       save_route_stops() takes the WHOLE ordered list for one route and applies it in one transaction:
--       insert new, update existing (including order), delete the ones that were left out.
--       route_stops_order_uq is DEFERRABLE INITIALLY DEFERRED (0003), so re-numbering inside one transaction is legal.
--   (2) Forms must say "3 of 5 buses used" and refuse a submit that cannot succeed. The numbers must be counted exactly
--       the way the enforce_limit triggers (0004, 0011) count them, so the count lives next to those triggers' rules, in
--       the database, and the UI never re-implements "which rows count".
--
-- SECURITY
--   * SECURITY DEFINER, search_path = ''. EXECUTE: authenticated only (PUBLIC and anon revoked).
--   * save_route_stops: the company is READ FROM THE ROUTE ROW, never from a parameter. Caller needs routes.write in that
--     company (app_private.has_permission also requires an active profile, active membership and an active company, so a
--     suspended company is locked out). "Not yours" and "does not exist" give the same answer (P0002).
--   * my_plan_usage(p_company): p_company is a TARGET. It must be one of the caller's own active companies
--     (app_private.current_company_ids()), otherwise P0002 (same as unknown). It returns counts and limits only: no plan
--     name, price or billing data (those stay behind billing.read).
--   * Nothing here widens a table grant. Enforcement of limits stays in the BEFORE INSERT triggers; this is display only.
--
-- BUSINESS RULES DECIDED HERE (flagged in MILESTONE-M2-REMAINING-REPORT.md)
--   * A saved stop list has 2..200 stops, at least two ACTIVE stops, at least one active stop that allows pickup and one
--     (a different one) that allows drop-off, names 2..120 chars and unique within the route (case-insensitive), offsets
--     (minutes after departure) never decreasing along the order, coordinates both-or-neither and in range.
--   * A stop referenced by a booking cannot be removed (bookings_pickup_fk/bookings_dropoff_fk are RESTRICT); it must be
--     marked inactive instead. Raised as a business rule (23514 'route stop has bookings'), not as a raw FK error.
--   * Concurrent saves of the same route are serialised by locking the route row.
--
-- ROLLBACK
--   drop function if exists public.save_route_stops(uuid, jsonb);
--   drop function if exists public.my_plan_usage(uuid);

create or replace function public.save_route_stops(p_route_id uuid, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_n int;
  i int;
  it jsonb;
  v_id uuid;
  v_name text;
  v_lat numeric;
  v_lng numeric;
  v_type text;
  v_off int;
  v_active boolean;
  v_prev_off int := 0;
  v_seen_ids uuid[] := '{}';
  v_seen_names text[] := '{}';
  v_active_cnt int := 0;
  v_pickup_cnt int := 0;
  v_drop_cnt int := 0;
  v_both_cnt int := 0;
  v_added int := 0;
  v_updated int := 0;
  v_removed int := 0;
  s public.route_stops%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'route stops invalid: stops_not_a_list' using errcode = '22023'; end if;

  select r.company_id into v_company from public.routes r where r.id = p_route_id and r.deleted_at is null;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'route not found' using errcode = 'P0002'; end if;
  perform 1 from public.routes r where r.id = p_route_id and r.company_id = v_company for update;   -- serialise saves

  v_n := jsonb_array_length(p_stops);
  if v_n < 2 then raise exception 'route stops invalid: stops_min_two' using errcode = '22023'; end if;
  if v_n > 200 then raise exception 'route stops invalid: stops_too_many' using errcode = '22023'; end if;

  -- ---- validate the whole list first (nothing is written until every item is good) ----
  for i in 0 .. v_n - 1 loop
    it := p_stops -> i;
    if jsonb_typeof(it) <> 'object' then raise exception 'route stops invalid: stop_invalid' using errcode = '22023'; end if;
    if jsonb_typeof(it -> 'name') is distinct from 'string' then
      raise exception 'route stops invalid: stop_name_invalid' using errcode = '22023'; end if;
    v_name := btrim(it ->> 'name');
    if char_length(v_name) < 2 or char_length(v_name) > 120 then
      raise exception 'route stops invalid: stop_name_invalid' using errcode = '22023'; end if;
    if lower(v_name) = any (v_seen_names) then
      raise exception 'route stops invalid: stop_name_duplicate' using errcode = '22023'; end if;
    v_seen_names := v_seen_names || lower(v_name);

    if it ? 'address' and jsonb_typeof(it -> 'address') not in ('string', 'null') then
      raise exception 'route stops invalid: stop_address_invalid' using errcode = '22023'; end if;
    if char_length(coalesce(it ->> 'address', '')) > 300 then
      raise exception 'route stops invalid: stop_address_invalid' using errcode = '22023'; end if;

    v_lat := null; v_lng := null;
    if jsonb_typeof(it -> 'latitude') = 'number' then v_lat := (it ->> 'latitude')::numeric;
    elsif jsonb_typeof(it -> 'latitude') not in ('null') and it ? 'latitude' then
      raise exception 'route stops invalid: stop_coords_invalid' using errcode = '22023'; end if;
    if jsonb_typeof(it -> 'longitude') = 'number' then v_lng := (it ->> 'longitude')::numeric;
    elsif jsonb_typeof(it -> 'longitude') not in ('null') and it ? 'longitude' then
      raise exception 'route stops invalid: stop_coords_invalid' using errcode = '22023'; end if;
    if (v_lat is null) <> (v_lng is null)
       or (v_lat is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180)) then
      raise exception 'route stops invalid: stop_coords_invalid' using errcode = '22023'; end if;

    v_type := coalesce(it ->> 'stopType', 'both');
    if v_type not in ('pickup', 'dropoff', 'both') then
      raise exception 'route stops invalid: stop_type_invalid' using errcode = '22023'; end if;

    if jsonb_typeof(it -> 'offsetMinutes') is distinct from 'number'
       or (it ->> 'offsetMinutes') !~ '^\d{1,5}$' or (it ->> 'offsetMinutes')::int > 32767 then
      raise exception 'route stops invalid: stop_offset_invalid' using errcode = '22023'; end if;
    v_off := (it ->> 'offsetMinutes')::int;
    if v_off < v_prev_off then
      raise exception 'route stops invalid: stop_offset_order' using errcode = '22023'; end if;
    v_prev_off := v_off;

    if it ? 'isActive' and jsonb_typeof(it -> 'isActive') <> 'boolean' then
      raise exception 'route stops invalid: stop_invalid' using errcode = '22023'; end if;
    v_active := coalesce((it ->> 'isActive')::boolean, true);

    v_id := null;
    if it ? 'id' and jsonb_typeof(it -> 'id') <> 'null' then
      if jsonb_typeof(it -> 'id') <> 'string' or (it ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'route stops invalid: stop_unknown_id' using errcode = '22023'; end if;
      v_id := (it ->> 'id')::uuid;
      if v_id = any (v_seen_ids) then raise exception 'route stops invalid: stop_unknown_id' using errcode = '22023'; end if;
      if not exists (select 1 from public.route_stops x where x.id = v_id and x.route_id = p_route_id and x.company_id = v_company) then
        raise exception 'route stops invalid: stop_unknown_id' using errcode = '22023'; end if;
      v_seen_ids := v_seen_ids || v_id;
    end if;

    if v_active then
      v_active_cnt := v_active_cnt + 1;
      if v_type = 'pickup' then v_pickup_cnt := v_pickup_cnt + 1;
      elsif v_type = 'dropoff' then v_drop_cnt := v_drop_cnt + 1;
      else v_both_cnt := v_both_cnt + 1; end if;
    end if;
  end loop;

  if v_active_cnt < 2 then raise exception 'route stops invalid: stops_min_two_active' using errcode = '22023'; end if;
  -- needs a boarding stop and a different alighting stop among the active ones
  if not (v_pickup_cnt + v_both_cnt >= 1 and v_drop_cnt + v_both_cnt >= 1 and v_active_cnt >= 2) then
    raise exception 'route stops invalid: stops_need_pickup_and_dropoff' using errcode = '22023'; end if;

  -- ---- remove the stops that were left out (refuse if a booking still points at one) ----
  for s in select * from public.route_stops x
            where x.route_id = p_route_id and x.company_id = v_company and not (x.id = any (v_seen_ids)) loop
    if exists (select 1 from public.bookings b where b.company_id = v_company and (b.pickup_stop_id = s.id or b.dropoff_stop_id = s.id)) then
      raise exception 'route stop has bookings' using errcode = '23514'; end if;
    delete from public.route_stops where id = s.id and company_id = v_company;
    v_removed := v_removed + 1;
  end loop;

  -- ---- apply: update existing (incl. new order), insert new ----
  for i in 0 .. v_n - 1 loop
    it := p_stops -> i;
    v_name := btrim(it ->> 'name');
    v_lat := case when jsonb_typeof(it -> 'latitude') = 'number' then (it ->> 'latitude')::numeric end;
    v_lng := case when jsonb_typeof(it -> 'longitude') = 'number' then (it ->> 'longitude')::numeric end;
    v_type := coalesce(it ->> 'stopType', 'both');
    v_off := (it ->> 'offsetMinutes')::int;
    v_active := coalesce((it ->> 'isActive')::boolean, true);
    v_id := case when it ? 'id' and jsonb_typeof(it -> 'id') = 'string' then (it ->> 'id')::uuid end;
    if v_id is not null then
      update public.route_stops set name = v_name, address = nullif(btrim(coalesce(it ->> 'address', '')), ''),
             latitude = v_lat, longitude = v_lng, stop_type = v_type, offset_minutes = v_off, is_active = v_active,
             stop_order = i + 1
       where id = v_id and route_id = p_route_id and company_id = v_company;
      v_updated := v_updated + 1;
    else
      insert into public.route_stops (company_id, route_id, name, address, latitude, longitude, stop_order, stop_type, offset_minutes, is_active)
      values (v_company, p_route_id, v_name, nullif(btrim(coalesce(it ->> 'address', '')), ''), v_lat, v_lng, i + 1, v_type, v_off, v_active);
      v_added := v_added + 1;
    end if;
  end loop;

  perform app_private.write_audit('company_user', v_company, 'route.stops_saved', 'route', p_route_id,
    jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed, 'count', v_n));
  return jsonb_build_object('route_id', p_route_id, 'count', v_n, 'added', v_added, 'updated', v_updated, 'removed', v_removed);
end $$;
revoke all on function public.save_route_stops(uuid, jsonb) from public, anon;
grant execute on function public.save_route_stops(uuid, jsonb) to authenticated;

-- =====================================================================================================
-- my_plan_usage: limit + current usage for the resources the dashboard forms can create.
--   status 'ok'               -> `limits` has one entry per key: {limit: <int>|null(unlimited), used: <int>}
--   status 'no_subscription'  -> no live subscription (none, ended, cancelled, expired): creating anything is refused by
--                                the triggers with 'no active subscription', so the UI must not show plan numbers.
--   A key the plan does not mention is NOT granted: limit 0 (same rule as app_private.entitlement_limit).
--   max_trips_per_month is counted per calendar month of DEPARTURE in the company time zone, cancelled trips excluded
--   (same rule as app_private.trips_month_limit, 0011). `trip_months` holds this month and the next 3 as 'YYYY-MM'.
-- =====================================================================================================
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
      when 'max_routes'  then (select count(*) from public.routes x where x.company_id = p_company and x.deleted_at is null)
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
