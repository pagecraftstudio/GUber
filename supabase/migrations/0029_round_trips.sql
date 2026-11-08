-- 0029: go-and-return trips (PHASE A: data model + company side. Student booking of a round trip is PHASE B, migration 0030).
--
-- MODEL (decided with the product owner)
--   * An OUTBOUND trip has price (= go only) and round_trip_price (= go + return).
--   * Each RETURN OPTION is a normal, separate trip (own route, date/time, bus, driver, seats, price = return only) with
--     trips.outbound_trip_id pointing at the outbound trip. One outbound can have several return options (several return times).
--   * Seats are counted per trip, so go-only, return-only and both all use the existing seat counter and conflict checks.
--   * round_trip_price lives ONLY on the outbound trip. A return trip cannot itself have returns (no chains).
-- REGULAR TRIPS: a template may carry return times + prices; generate_template_trips() then also creates the return options
--   (same day + return_day_offset) for every outbound it creates.
-- WRITES go through security-definer functions (create_trip_with_returns, generate_template_trips); the two new trips columns are
--   NOT granted to clients, so a client cannot attach a trip to another outbound or set a round-trip price directly.
-- NOT YET: booking both legs together (0030), exposing return options in public search (0030).
-- ROLLBACK:
--   drop function public.create_trip_with_returns(uuid, uuid, uuid, timestamptz, timestamptz, numeric, integer, text, numeric, jsonb);
--   (re-run generate_template_trips and delete_draft_trip from 0028 / 0011)
--   drop trigger "150_return_link" on public.trips; drop function app_private.trips_return_link();
--   alter table public.trips drop column outbound_trip_id, drop column round_trip_price;
--   alter table public.trip_templates drop column return_route_id, drop column return_price, drop column round_trip_price,
--     drop column return_times, drop column return_day_offset;
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh (staging first). Immutable once applied.
set search_path = public, extensions;

alter table trips
  add column outbound_trip_id uuid,
  add column round_trip_price numeric(12,2) check (round_trip_price is null or round_trip_price >= 0),
  add constraint trips_outbound_fk foreign key (company_id, outbound_trip_id) references trips(company_id, id) on delete restrict,
  add constraint trips_outbound_not_self check (outbound_trip_id is null or outbound_trip_id <> id),
  add constraint trips_round_price_on_outbound_only check (outbound_trip_id is null or round_trip_price is null);
create index trips_outbound_idx on trips(company_id, outbound_trip_id) where outbound_trip_id is not null;

alter table trip_templates
  add column return_route_id uuid,
  add column return_price numeric(12,2) check (return_price is null or return_price >= 0),
  add column round_trip_price numeric(12,2) check (round_trip_price is null or round_trip_price >= 0),
  add column return_times time[] not null default '{}',
  add column return_day_offset smallint not null default 0 check (return_day_offset between 0 and 7),
  add constraint trip_templates_return_route_fk foreign key (company_id, return_route_id) references routes(company_id, id) on delete restrict,
  add constraint trip_templates_return_complete check (
    cardinality(return_times) = 0 or (return_route_id is not null and return_price is not null and round_trip_price is not null));

-- a return option departs after its outbound trip arrives; no chains (a return cannot have returns, an outbound cannot become a return)
create or replace function app_private.trips_return_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.trips%rowtype;
begin
  if new.outbound_trip_id is null then return new; end if;
  select * into o from public.trips t where t.id = new.outbound_trip_id and t.company_id = new.company_id;
  if not found then raise exception 'outbound trip not found' using errcode = '23514'; end if;
  if o.outbound_trip_id is not null then raise exception 'a return trip cannot have return trips' using errcode = '23514'; end if;
  if exists (select 1 from public.trips r where r.outbound_trip_id = new.id) then
    raise exception 'a trip with return trips cannot itself be a return trip' using errcode = '23514'; end if;
  if new.departure_at < o.arrival_at then
    raise exception 'return trip must depart after the outbound trip arrives' using errcode = '23514'; end if;
  return new;
end $$;
create trigger "150_return_link" before insert or update of outbound_trip_id, departure_at on trips
  for each row execute function app_private.trips_return_link();

-- ======================= create a trip together with its return options (atomic) =======================
-- p_returns: [{ "route_id": uuid, "departure_at": ts, "arrival_at": ts, "price": n, "bus_id"?: uuid, "driver_id"?: uuid, "capacity"?: n }, ...]
-- A return option without bus/driver inherits the outbound's. Everything is created as DRAFT (same as a normal draft).
create or replace function public.create_trip_with_returns(
  p_route_id uuid, p_bus_id uuid, p_driver_id uuid, p_departure_at timestamptz, p_arrival_at timestamptz,
  p_price numeric, p_capacity integer, p_notes text, p_round_trip_price numeric, p_returns jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; v_out uuid; r jsonb; v_ids uuid[] := '{}'; v_id uuid; v_n int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select rt.company_id into v_company from public.routes rt where rt.id = p_route_id and rt.deleted_at is null;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'route not found' using errcode = 'P0002'; end if;
  v_n := case when jsonb_typeof(coalesce(p_returns, '[]'::jsonb)) = 'array' then jsonb_array_length(coalesce(p_returns, '[]'::jsonb)) else -1 end;
  if v_n < 1 or v_n > 10 then raise exception 'between 1 and 10 return options are required' using errcode = '22023'; end if;
  if p_round_trip_price is null or p_round_trip_price < 0 then raise exception 'round trip price is required' using errcode = '22023'; end if;
  if p_price is null or p_price < 0 then raise exception 'price is required' using errcode = '22023'; end if;

  insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, notes, round_trip_price)
  values (v_company, p_route_id, p_bus_id, p_driver_id, p_departure_at, p_arrival_at, p_price, p_capacity, nullif(trim(coalesce(p_notes, '')), ''), p_round_trip_price)
  returning id into v_out;

  for r in select * from jsonb_array_elements(p_returns) loop
    if (r->>'price') is null or (r->>'price')::numeric < 0 then raise exception 'return price is required' using errcode = '22023'; end if;
    insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, outbound_trip_id)
    values (v_company, (r->>'route_id')::uuid, coalesce((r->>'bus_id')::uuid, p_bus_id), coalesce((r->>'driver_id')::uuid, p_driver_id),
            (r->>'departure_at')::timestamptz, (r->>'arrival_at')::timestamptz, (r->>'price')::numeric,
            coalesce((r->>'capacity')::int, p_capacity), v_out)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  perform app_private.write_audit('company_user', v_company, 'trip.created_with_returns', 'trip', v_out,
    jsonb_build_object('returns', v_ids));
  return jsonb_build_object('id', v_out, 'return_ids', to_jsonb(v_ids));
end $$;
revoke all on function public.create_trip_with_returns(uuid, uuid, uuid, timestamptz, timestamptz, numeric, integer, text, numeric, jsonb) from public, anon;
grant execute on function public.create_trip_with_returns(uuid, uuid, uuid, timestamptz, timestamptz, numeric, integer, text, numeric, jsonb) to authenticated;

-- ======================= deleting a draft outbound also deletes its (draft, never-booked) return options =======================
create or replace function public.delete_draft_trip(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; t public.trips%rowtype; v_returns int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select tr.company_id into v_company from public.trips tr where tr.id = p_trip_id;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  select * into t from public.trips tr where tr.id = p_trip_id and tr.company_id = v_company for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'draft' then raise exception 'trip is not a draft' using errcode = '23514'; end if;
  if exists (select 1 from public.bookings b where b.trip_id = t.id) then
    raise exception 'trip has booking history' using errcode = '23514'; end if;
  if exists (select 1 from public.trips r where r.outbound_trip_id = t.id and r.company_id = v_company
              and (r.status <> 'draft' or exists (select 1 from public.bookings b where b.trip_id = r.id))) then
    raise exception 'a return trip is no longer a draft or has bookings' using errcode = '23514'; end if;
  delete from public.trips r where r.outbound_trip_id = t.id and r.company_id = v_company;
  get diagnostics v_returns = row_count;
  delete from public.trips where id = t.id;
  perform app_private.write_audit('company_user', v_company, 'trip.deleted', 'trip', t.id, jsonb_build_object('returns_deleted', v_returns));
  return jsonb_build_object('id', t.id, 'deleted', true);
end $$;
revoke all on function public.delete_draft_trip(uuid) from public, anon;
grant execute on function public.delete_draft_trip(uuid) to authenticated;

-- ======================= regular trips: generate the return options too =======================
create or replace function public.generate_template_trips(p_template_id uuid, p_days integer default 28)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; tpl public.trip_templates%rowtype;
  v_tz text; v_today date; v_from date; v_through date; v_day date; v_rt time;
  v_dep timestamptz; v_status text; v_created int := 0; v_existing int := 0; v_conflicts int := 0; v_returns int := 0;
  v_limit_reached boolean := false; v_inserted int; v_out uuid; v_rdep timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select t.company_id into v_company from public.trip_templates t where t.id = p_template_id;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'template not found' using errcode = 'P0002'; end if;
  select * into tpl from public.trip_templates t where t.id = p_template_id and t.company_id = v_company for update;
  if not tpl.is_active then raise exception 'template is not active' using errcode = '23514'; end if;

  select coalesce(s.timezone, 'UTC') into v_tz from public.company_settings s where s.company_id = v_company;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;
  v_from := greatest(tpl.start_date, v_today);
  v_through := v_today + least(greatest(coalesce(p_days, 28), 1), 60);
  if tpl.end_date is not null then v_through := least(v_through, tpl.end_date); end if;
  v_status := case when tpl.bus_id is not null and tpl.driver_id is not null then 'scheduled' else 'draft' end;

  v_day := v_from;
  while v_day <= v_through loop
    if extract(isodow from v_day)::smallint = any (tpl.days_of_week) then
      v_dep := (v_day + tpl.departure_time) at time zone v_tz;
      if v_dep > now() then
        begin
          insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, template_id, price, capacity, status, round_trip_price)
          values (v_company, tpl.route_id, tpl.bus_id, tpl.driver_id, v_dep, v_dep + make_interval(mins => tpl.duration_minutes),
                  tpl.id, tpl.price, tpl.capacity, v_status, tpl.round_trip_price)
          on conflict (template_id, departure_at) where template_id is not null do nothing
          returning id into v_out;
          get diagnostics v_inserted = row_count;
          if v_inserted = 1 then v_created := v_created + 1; else v_existing := v_existing + 1;
            select t.id into v_out from public.trips t where t.template_id = tpl.id and t.departure_at = v_dep; end if;
        exception
          when exclusion_violation then v_conflicts := v_conflicts + 1; v_out := null;
          when sqlstate '53400' then v_limit_reached := true; exit;
        end;

        -- return options of this outbound (idempotent: unique (template_id, departure_at) skips existing ones)
        if v_out is not null and cardinality(tpl.return_times) > 0 then
          foreach v_rt in array tpl.return_times loop
            v_rdep := ((v_day + tpl.return_day_offset) + v_rt) at time zone v_tz;
            if v_rdep > now() and v_rdep >= v_dep + make_interval(mins => tpl.duration_minutes) then
              begin
                insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, template_id, price, capacity, status, outbound_trip_id)
                values (v_company, tpl.return_route_id, tpl.bus_id, tpl.driver_id, v_rdep, v_rdep + make_interval(mins => tpl.duration_minutes),
                        tpl.id, tpl.return_price, tpl.capacity, v_status, v_out)
                on conflict (template_id, departure_at) where template_id is not null do nothing;
                get diagnostics v_inserted = row_count;
                if v_inserted = 1 then v_returns := v_returns + 1; end if;
              exception
                when exclusion_violation then v_conflicts := v_conflicts + 1;
                when sqlstate '53400' then v_limit_reached := true; exit;
              end;
            end if;
          end loop;
          exit when v_limit_reached;
        end if;
      end if;
    end if;
    v_day := v_day + 1;
  end loop;

  if not v_limit_reached then
    update public.trip_templates set generated_through = greatest(coalesce(generated_through, v_through), v_through) where id = tpl.id;
  end if;
  perform app_private.write_audit('company_user', v_company, 'trip.template_generated', 'trip_template', tpl.id,
    jsonb_build_object('created', v_created, 'return_trips_created', v_returns, 'already_existed', v_existing, 'conflicts', v_conflicts, 'limit_reached', v_limit_reached, 'through', v_through));
  return jsonb_build_object('created', v_created, 'return_trips_created', v_returns, 'already_existed', v_existing, 'conflicts', v_conflicts,
                            'limit_reached', v_limit_reached, 'through', v_through);
end $$;
revoke all on function public.generate_template_trips(uuid, integer) from public, anon;
grant execute on function public.generate_template_trips(uuid, integer) to authenticated;
