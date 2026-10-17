-- 0011: trip status machine, draft deletion, monthly trip limit.
--
-- The transition graph and its side effects live in TRIGGERS, so no write path can skip them (RPC, SQL job,
-- platform admin). The RPCs add authorization, row locking and friendly errors on top.
--
--   draft ------> scheduled ------> boarding ------> in_progress ------> completed (terminal)
--     |              |  ^              |  ^                 
--     |              |  '-- (back) ----'  |                 scheduled -> in_progress is allowed (staff may skip boarding)
--     |              '--> draft (only with zero bookings)
--     '--> cancelled <---- scheduled / boarding               cancelled (terminal)
--
--   cancel : every pending/confirmed booking is cancelled in the same transaction, seats released by the counter trigger
--   complete: confirmed -> completed, pending -> no_show (nobody confirmed them). Only after departure time.
--   conflicts: the GiST exclusion constraints (buffer included) judge draft->scheduled and any later re-assignment;
--              they are race-free, two concurrent requests cannot both win the same bus or driver.
set search_path = public, extensions;

-- ---------- clients can no longer set status or delete trips: transitions and draft deletion are RPCs ----------
revoke insert, update, delete on trips from authenticated;
grant insert (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, template_id, price, capacity, notes) on trips to authenticated;
grant update (route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, notes) on trips to authenticated;

-- ---------- bug fix found by the 0011 tests: the Phase 2 CHECK demanded a bus and driver for EVERY non-draft status, so a
-- draft without them could never be cancelled. Only live statuses need them; a cancelled trip may have none. ----------
alter table trips drop constraint trips_assigned_when_live;
alter table trips add constraint trips_assigned_when_live
  check (status in ('draft', 'cancelled') or (bus_id is not null and driver_id is not null));

-- ---------- transition graph (applies to everybody, including the table owner) ----------
create or replace function app_private.trips_status_machine() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bus_status text; v_bus_cap smallint; v_driver_status text;
begin
  if not ( (old.status = 'draft'     and new.status in ('scheduled', 'cancelled'))
        or (old.status = 'scheduled' and new.status in ('draft', 'boarding', 'in_progress', 'cancelled'))
        or (old.status = 'boarding'  and new.status in ('scheduled', 'in_progress', 'cancelled'))
        or (old.status = 'in_progress' and new.status = 'completed') ) then
    raise exception 'invalid trip status transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  if new.status = 'scheduled' and old.status = 'draft' then
    if new.departure_at <= now() then raise exception 'trip already departed' using errcode = '23514'; end if;
    -- bus/driver may have been deactivated, or the bus swapped for a smaller one, since the draft was saved
    if new.bus_id is not null then
      select status, capacity into v_bus_status, v_bus_cap from public.buses where id = new.bus_id and company_id = new.company_id;
      if v_bus_status is distinct from 'active' then raise exception 'bus is not active' using errcode = '23514'; end if;
      if new.capacity > v_bus_cap then raise exception 'trip capacity (%) exceeds bus capacity (%)', new.capacity, v_bus_cap using errcode = '23514'; end if;
    end if;
    if new.driver_id is not null then
      select status into v_driver_status from public.drivers where id = new.driver_id and company_id = new.company_id;
      if v_driver_status is distinct from 'active' then raise exception 'driver is not active' using errcode = '23514'; end if;
    end if;
  end if;

  if new.status = 'draft' and (old.seats_booked > 0 or exists (
        select 1 from public.bookings b where b.trip_id = old.id and b.company_id = old.company_id and b.status <> 'cancelled')) then
    raise exception 'trip has bookings' using errcode = '23514';
  end if;

  if new.status = 'completed' and now() < new.departure_at then
    raise exception 'trip has not started' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger "100_trip_status" before update of status on trips
  for each row when (old.status is distinct from new.status)
  execute function app_private.trips_status_machine();

-- ---------- side effects, same transaction ----------
create or replace function app_private.trips_status_effects() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' then
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancellation_reason = 'trip cancelled'
     where trip_id = new.id and company_id = new.company_id and status in ('pending', 'confirmed');   -- counter trigger releases the seats
  elsif new.status = 'completed' then
    update public.bookings set status = case status when 'confirmed' then 'completed' else 'no_show' end
     where trip_id = new.id and company_id = new.company_id and status in ('pending', 'confirmed');
  end if;
  return null;
end $$;
create trigger trips_status_effects after update of status on trips
  for each row when (old.status is distinct from new.status)
  execute function app_private.trips_status_effects();

-- ---------- plan limit: trips per calendar month of DEPARTURE (company time zone), cancelled trips excluded ----------
create or replace function app_private.trips_month_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_tz text; v_count bigint; v_month timestamp;
begin
  select timezone into v_tz from public.company_settings where company_id = new.company_id;
  v_tz := coalesce(v_tz, 'UTC');
  v_month := date_trunc('month', new.departure_at at time zone v_tz);
  if tg_op = 'UPDATE' and date_trunc('month', old.departure_at at time zone v_tz) = v_month then return new; end if;   -- not moving into another month
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || 'max_trips_per_month', 0));
  v_limit := app_private.entitlement_limit(new.company_id, 'max_trips_per_month');
  if v_limit is null then return new; end if;
  select count(*) into v_count from public.trips t
   where t.company_id = new.company_id and t.status <> 'cancelled' and t.id <> new.id
     and date_trunc('month', t.departure_at at time zone v_tz) = v_month;
  if v_count >= v_limit then
    raise exception 'plan limit reached: max_trips_per_month (%)', v_limit using errcode = '53400';
  end if;
  return new;
end $$;
create trigger "200_month_limit" before insert or update of departure_at on trips
  for each row execute function app_private.trips_month_limit();

-- =====================================================================================================
-- transition_trip
-- =====================================================================================================
create or replace function public.transition_trip(p_trip_id uuid, p_to text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; t public.trips%rowtype; v_released int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_to not in ('draft', 'scheduled', 'boarding', 'in_progress', 'completed', 'cancelled') then
    raise exception 'invalid trip status' using errcode = '22023'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'input too long' using errcode = '22023'; end if;

  select tr.company_id into v_company from public.trips tr where tr.id = p_trip_id;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  select * into t from public.trips tr where tr.id = p_trip_id and tr.company_id = v_company for update;
  if t.status = p_to then
    return jsonb_build_object('id', t.id, 'status', t.status, 'changed', false, 'bookings_cancelled', 0);
  end if;
  if p_to = 'cancelled' then
    select count(*) into v_released from public.bookings b where b.trip_id = t.id and b.status in ('pending', 'confirmed');
  end if;

  update public.trips set status = p_to where id = t.id;      -- machine + effects run in triggers; exclusion constraints judge conflicts

  perform app_private.write_audit('company_user', v_company, 'trip.' || p_to, 'trip', t.id,
    jsonb_build_object('from', t.status, 'bookings_cancelled', v_released, 'reason', nullif(trim(coalesce(p_reason, '')), '')));
  return jsonb_build_object('id', t.id, 'status', p_to, 'changed', true, 'bookings_cancelled', v_released);
end $$;
revoke all on function public.transition_trip(uuid, text, text) from public, anon;
grant execute on function public.transition_trip(uuid, text, text) to authenticated;

-- =====================================================================================================
-- delete_draft_trip: only a draft that never had a booking (cancelled bookings count as history).
-- =====================================================================================================
create or replace function public.delete_draft_trip(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; t public.trips%rowtype;
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
  delete from public.trips where id = t.id;
  perform app_private.write_audit('company_user', v_company, 'trip.deleted', 'trip', t.id, '{}'::jsonb);
  return jsonb_build_object('id', t.id, 'deleted', true);
end $$;
revoke all on function public.delete_draft_trip(uuid) from public, anon;
grant execute on function public.delete_draft_trip(uuid) to authenticated;
