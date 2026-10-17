-- 0010: booking operations. Create / cancel / status / payment status as SECURITY DEFINER RPCs, with the seat
-- counter maintained by a trigger so that NO write path (RPC, SQL job, platform admin) can make it drift.
--
-- Invariants (all enforced in the database):
--   I1  trips.seats_booked = sum(seats_count) of that trip's bookings whose status <> 'cancelled'.
--       (Design doc said pending+confirmed only. We also keep completed/no_show: the seats WERE used, and the
--       counter must not shrink when a finished trip is closed. Decision D-P5-1, needs your approval.)
--   I2  seats_booked <= capacity (CHECK trips_seats_valid) - the last line of defence against overbooking.
--   I3  A booking row is never deleted; seats_count/trip_id/prices never change after insert.
--   I4  A cancelled booking can never be revived, so capacity is released exactly once.
--   I5  Clients cannot write bookings/booking_payments at all (grants revoked): only the RPCs below.
-- Lock order is ALWAYS trip row -> booking row, so concurrent create/cancel/transition cannot deadlock.
set search_path = public, extensions;

-- ---------- no direct client writes, not even for platform staff ----------
revoke insert, update, delete on bookings, booking_payments from authenticated;

-- ---------- reference generator: 6 chars from an unambiguous 32-letter alphabet, crypto-random ----------
create or replace function app_private.new_booking_reference() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; bytes bytea; ref text := ''; i int;
begin
  bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..5 loop ref := ref || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  return 'MB-' || ref;
end $$;

-- ---------- bookings: immutability, state machine, no delete ----------
create or replace function app_private.bookings_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_trip_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'bookings are never deleted: cancel instead' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    select status into v_trip_status from public.trips where id = new.trip_id and company_id = new.company_id;
    if v_trip_status is distinct from 'scheduled' then
      raise exception 'trip is not open for booking' using errcode = '23514';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.trip_id is distinct from old.trip_id or new.customer_id is distinct from old.customer_id
     or new.seats_count is distinct from old.seats_count or new.unit_price is distinct from old.unit_price
     or new.total_amount is distinct from old.total_amount or new.currency is distinct from old.currency
     or new.reference is distinct from old.reference or new.source is distinct from old.source
     or new.pickup_stop_id is distinct from old.pickup_stop_id or new.dropoff_stop_id is distinct from old.dropoff_stop_id
  then
    raise exception 'booking fields are immutable after creation' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not ( (old.status = 'pending'   and new.status in ('confirmed', 'cancelled', 'no_show'))
          or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled')) ) then
      raise exception 'invalid booking status transition: % -> %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
      new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
    end if;
  end if;
  return new;
end $$;
create trigger bookings_before_write before insert or update or delete on bookings
  for each row execute function app_private.bookings_before_write();

-- ---------- seat counter: moves exactly once per state change, in the same transaction ----------
create or replace function app_private.bookings_seat_counter() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'cancelled' then
      update public.trips set seats_booked = seats_booked + new.seats_count
       where id = new.trip_id and company_id = new.company_id;        -- CHECK trips_seats_valid = overbooking backstop
    end if;
  elsif old.status <> 'cancelled' and new.status = 'cancelled' then
    update public.trips set seats_booked = seats_booked - old.seats_count
     where id = old.trip_id and company_id = old.company_id;
  end if;
  return null;
end $$;
create trigger bookings_seat_counter after insert or update of status on bookings
  for each row execute function app_private.bookings_seat_counter();

-- ---------- plan limit: bookings created per calendar month (company time zone) ----------
create or replace function app_private.bookings_month_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_tz text; v_count bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || 'max_bookings_per_month', 0));
  v_limit := app_private.entitlement_limit(new.company_id, 'max_bookings_per_month');
  if v_limit is null then return new; end if;
  select timezone into v_tz from public.company_settings where company_id = new.company_id;
  select count(*) into v_count from public.bookings b
   where b.company_id = new.company_id
     and date_trunc('month', b.created_at at time zone coalesce(v_tz, 'UTC')) = date_trunc('month', now() at time zone coalesce(v_tz, 'UTC'));
  if v_count >= v_limit then
    raise exception 'plan limit reached: max_bookings_per_month (%)', v_limit using errcode = '53400';
  end if;
  return new;
end $$;
create trigger "200_month_limit" before insert on bookings
  for each row execute function app_private.bookings_month_limit();

-- ---------- consistency check (used by tests and ops) ----------
create or replace function app_private.seat_drift() returns table (trip_id uuid, seats_booked smallint, actual bigint)
language sql stable security definer set search_path = '' as $$
  select t.id, t.seats_booked, coalesce(sum(b.seats_count) filter (where b.status <> 'cancelled'), 0)
  from public.trips t left join public.bookings b on b.trip_id = t.id and b.company_id = t.company_id
  group by t.id, t.seats_booked
  having t.seats_booked <> coalesce(sum(b.seats_count) filter (where b.status <> 'cancelled'), 0)
$$;
revoke all on function app_private.seat_drift() from public, anon, authenticated;

-- =====================================================================================================
-- create_booking
-- =====================================================================================================
-- Authorization: caller must hold bookings.write in the TRIP'S company. Unknown trip and "not yours" give the same
-- 'trip not found' (P0002) so ids cannot be probed. The company is derived from the trip, never from input.
-- Idempotency: with p_idempotency_key a retry returns the original booking (idempotent_replay = true) and never
-- touches the counter again. Same key with a different trip/seats/phone => 23505 conflict.
-- Staff rules: trip must be 'scheduled' and not departed; seats <= company_settings.max_seats_per_booking.
-- (booking_enabled / booking_cutoff_minutes / allow_guest_booking are customer-facing: applied by the Phase 8 web RPC.)
create or replace function public.create_booking(
  p_trip_id uuid, p_customer_name text, p_customer_phone text, p_seats integer,
  p_customer_email text default null, p_university text default null, p_student_id text default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_idempotency_key text default null, p_notes text default null, p_status text default 'confirmed')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid; v_trip public.trips%rowtype; v_set public.company_settings%rowtype;
  v_name text := trim(coalesce(p_customer_name, ''));
  v_phone text := app_private.normalize_phone(p_customer_phone);
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_existing public.bookings%rowtype; v_cust uuid; v_id uuid; v_ref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select t.company_id into v_company from public.trips t where t.id = p_trip_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;

  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid customer name' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'invalid phone number: must be international format (E.164)' using errcode = '22023'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254) then
    raise exception 'invalid email' using errcode = '22023'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'invalid seats' using errcode = '22023'; end if;
  if p_status not in ('pending', 'confirmed') then raise exception 'invalid initial status' using errcode = '22023'; end if;
  if v_key is not null and length(v_key) > 128 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  if length(coalesce(p_notes, '')) > 1000 or length(coalesce(p_university, '')) > 200 or length(coalesce(p_student_id, '')) > 100 then
    raise exception 'input too long' using errcode = '22023'; end if;

  -- retry of an already-completed request? (cheap check before taking the trip lock)
  if v_key is not null then
    select * into v_existing from public.bookings b where b.company_id = v_company and b.idempotency_key = v_key;
    if found then
      if v_existing.trip_id <> p_trip_id or v_existing.seats_count <> p_seats
         or not exists (select 1 from public.customers c where c.id = v_existing.customer_id and c.phone = v_phone) then
        raise exception 'idempotency key reused with a different request' using errcode = '23505';
      end if;
      return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference, 'status', v_existing.status,
        'trip_id', v_existing.trip_id, 'customer_id', v_existing.customer_id, 'seats_count', v_existing.seats_count,
        'unit_price', v_existing.unit_price, 'total_amount', v_existing.total_amount, 'currency', v_existing.currency,
        'idempotent_replay', true);
    end if;
  end if;

  -- serialise everybody who touches this trip's seats. Concurrent bookings queue here.
  select * into v_trip from public.trips t where t.id = p_trip_id and t.company_id = v_company for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;

  -- same key may have committed while we waited for the lock
  if v_key is not null then
    select * into v_existing from public.bookings b where b.company_id = v_company and b.idempotency_key = v_key;
    if found then
      if v_existing.trip_id <> p_trip_id or v_existing.seats_count <> p_seats then
        raise exception 'idempotency key reused with a different request' using errcode = '23505'; end if;
      return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference, 'status', v_existing.status,
        'trip_id', v_existing.trip_id, 'customer_id', v_existing.customer_id, 'seats_count', v_existing.seats_count,
        'unit_price', v_existing.unit_price, 'total_amount', v_existing.total_amount, 'currency', v_existing.currency,
        'idempotent_replay', true);
    end if;
  end if;

  select * into v_set from public.company_settings s where s.company_id = v_company;
  if v_trip.status <> 'scheduled' then raise exception 'trip is not open for booking' using errcode = '23514'; end if;
  if v_trip.departure_at <= now() then raise exception 'trip already departed' using errcode = '23514'; end if;
  if p_seats > v_set.max_seats_per_booking then raise exception 'seats per booking exceeded' using errcode = '23514'; end if;
  if v_trip.capacity - v_trip.seats_booked < p_seats then
    raise exception 'not enough seats available' using errcode = '23514',
      hint = format('available=%s', v_trip.capacity - v_trip.seats_booked);
  end if;
  if p_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_pickup_stop_id
       and s.company_id = v_company and s.route_id = v_trip.route_id and s.is_active and s.stop_type in ('pickup','both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_dropoff_stop_id
       and s.company_id = v_company and s.route_id = v_trip.route_id and s.is_active and s.stop_type in ('dropoff','both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;

  -- customer: find or create by (company, phone). An existing customer's NAME is never overwritten (risk R4);
  -- only empty optional fields are filled in.
  insert into public.customers (company_id, full_name, phone, email, university, student_id)
  values (v_company, v_name, v_phone, v_email, nullif(trim(coalesce(p_university, '')), ''), nullif(trim(coalesce(p_student_id, '')), ''))
  on conflict (company_id, phone) where deleted_at is null do nothing
  returning id into v_cust;
  if v_cust is null then
    select c.id into v_cust from public.customers c where c.company_id = v_company and c.phone = v_phone and c.deleted_at is null;
    update public.customers c set email = coalesce(c.email, v_email),
           university = coalesce(c.university, nullif(trim(coalesce(p_university, '')), '')),
           student_id = coalesce(c.student_id, nullif(trim(coalesce(p_student_id, '')), ''))
     where c.id = v_cust and ((c.email is null and v_email is not null) or (c.university is null and p_university is not null and trim(p_university) <> '')
                           or (c.student_id is null and p_student_id is not null and trim(p_student_id) <> ''));
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_ref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count,
                                   unit_price, total_amount, currency, status, payment_status, source, idempotency_key, notes, created_by)
      values (v_company, v_ref, p_trip_id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, p_seats,
              v_trip.price, v_trip.price * p_seats, v_set.currency, p_status, 'unpaid', 'staff', v_key,
              nullif(trim(coalesce(p_notes, '')), ''), v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if sqlerrm like '%bookings_idempotency_uq%' then
        raise exception 'idempotency key reused with a different request' using errcode = '23505';
      end if;
      if v_attempt >= 8 then raise; end if;      -- reference collision: try another code
    end;
  end loop;

  perform app_private.write_audit('company_user', v_company, 'booking.created', 'booking', v_id,
    jsonb_build_object('trip_id', p_trip_id, 'seats', p_seats, 'reference', v_ref));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', p_status, 'trip_id', p_trip_id, 'customer_id', v_cust,
    'seats_count', p_seats, 'unit_price', v_trip.price, 'total_amount', v_trip.price * p_seats, 'currency', v_set.currency,
    'idempotent_replay', false);
end $$;
revoke all on function public.create_booking(uuid, text, text, integer, text, text, text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_booking(uuid, text, text, integer, text, text, text, uuid, uuid, text, text, text) to authenticated;

-- =====================================================================================================
-- cancel_booking: releases the seats exactly once. Repeating the call is a harmless no-op.
-- =====================================================================================================
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; v_trip_id uuid; v_trip_status text; b public.bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'input too long' using errcode = '22023'; end if;

  select bk.company_id, bk.trip_id into v_company, v_trip_id from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  select t.status into v_trip_status from public.trips t where t.id = v_trip_id and t.company_id = v_company for update;   -- trip first
  select * into b from public.bookings bk where bk.id = p_booking_id for update;                                         -- then booking

  if b.status = 'cancelled' then
    return jsonb_build_object('id', b.id, 'status', 'cancelled', 'already_cancelled', true, 'seats_released', 0);
  end if;
  if b.status in ('completed', 'no_show') then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;
  if v_trip_status not in ('scheduled', 'boarding') then
    raise exception 'trip is closed' using errcode = '23514'; end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_booking_id;                                                             -- trigger releases the seats

  perform app_private.write_audit('company_user', v_company, 'booking.cancelled', 'booking', b.id,
    jsonb_build_object('trip_id', b.trip_id, 'seats_released', b.seats_count));
  return jsonb_build_object('id', b.id, 'status', 'cancelled', 'already_cancelled', false, 'seats_released', b.seats_count);
end $$;
revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- =====================================================================================================
-- set_booking_status: pending->confirmed, confirmed->completed|no_show (cancel has its own RPC).
-- Repeating a transition that already happened is a no-op. Counter is untouched (seats stay used).
-- =====================================================================================================
create or replace function public.set_booking_status(p_booking_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; v_trip_id uuid; v_trip_status text; b public.bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_status not in ('confirmed', 'completed', 'no_show') then raise exception 'invalid booking status' using errcode = '22023'; end if;

  select bk.company_id, bk.trip_id into v_company, v_trip_id from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002'; end if;

  select t.status into v_trip_status from public.trips t where t.id = v_trip_id and t.company_id = v_company for update;
  select * into b from public.bookings bk where bk.id = p_booking_id for update;
  if b.status = p_status then
    return jsonb_build_object('id', b.id, 'status', b.status, 'changed', false);
  end if;
  if p_status = 'confirmed' and v_trip_status not in ('scheduled', 'boarding') then raise exception 'trip is closed' using errcode = '23514'; end if;
  if p_status in ('completed', 'no_show') and v_trip_status not in ('boarding', 'in_progress', 'completed') then
    raise exception 'trip has not started' using errcode = '23514'; end if;

  update public.bookings set status = p_status where id = p_booking_id;       -- trigger validates the transition
  perform app_private.write_audit('company_user', v_company, 'booking.' || p_status, 'booking', b.id, jsonb_build_object('from', b.status));
  return jsonb_build_object('id', b.id, 'status', p_status, 'changed', true);
end $$;
revoke all on function public.set_booking_status(uuid, text) from public, anon;
grant execute on function public.set_booking_status(uuid, text) to authenticated;

-- =====================================================================================================
-- set_booking_payment_status: V1 cash handling (manual toggle). Online payments replace this later (Q3).
-- =====================================================================================================
create or replace function public.set_booking_payment_status(p_booking_id uuid, p_payment_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; b public.bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_payment_status not in ('unpaid', 'partial', 'paid', 'refunded') then raise exception 'invalid payment status' using errcode = '22023'; end if;
  select bk.company_id into v_company from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id for update;
  if b.status = 'cancelled' and p_payment_status in ('partial', 'paid') then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;
  update public.bookings set payment_status = p_payment_status where id = p_booking_id;
  perform app_private.write_audit('company_user', v_company, 'booking.payment_status', 'booking', b.id,
    jsonb_build_object('from', b.payment_status, 'to', p_payment_status));
  return jsonb_build_object('id', b.id, 'payment_status', p_payment_status);
end $$;
revoke all on function public.set_booking_payment_status(uuid, text) from public, anon;
grant execute on function public.set_booking_payment_status(uuid, text) to authenticated;

-- ---------- one-time reconciliation of counters written before the trigger existed (Phase 4: no maintenance at all) ----------
update public.trips t set seats_booked = d.actual
from app_private.seat_drift() d where d.trip_id = t.id;
