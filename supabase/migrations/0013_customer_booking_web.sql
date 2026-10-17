-- 0013: customer-facing web booking (Integration step 1).
-- Gap found in 0010/0012: create_booking / cancel_booking need `bookings.write` in the trip's company (staff only),
-- there was NO public trip search, NO customer-facing create/cancel, and my_bookings() returned no trip details.
-- 0010 explicitly deferred "booking_enabled / booking_cutoff_minutes / allow_guest_booking ... to the Phase 8 web RPC".
--
-- Rules (all enforced here, in the database):
--   P1  Public search exposes ONLY: trip.status = 'scheduled', not departed, past the booking cutoff, company active
--       (trial/active, not deleted), company_settings.booking_enabled, and the company website is_published.
--       Columns are an explicit allow-list: no bus, driver, plate, notes, created_by, seats_booked raw, other tenants' data.
--   P2  The company is ALWAYS derived from the trip. The client never sends company_id / customer_id / user id.
--   P3  A signed-in customer gets (or reuses) exactly one customers row per company, linked by user_id = auth.uid().
--       A new row is created ONLY if the phone is free in that company. If the phone already belongs to a guest/staff
--       row, we do NOT attach it (the phone is not verified here) -> 'phone already registered' and the person must
--       use claim_my_customer() (verified phone) instead. This prevents taking over someone else's booking history.
--   P4  Capacity: same row lock + trigger + CHECK as 0010 (trip row lock -> booking row). No new write path to trips.
--   P5  Idempotency per (company, key). Replay returns the original booking; reuse with other input = 23505.
--   P6  Cancellation: only the owner, only inside company_settings.cancellation_window_hours, seats released once by
--       the existing trigger.
set search_path = public, extensions;

-- ---------- helper: is this trip open to the public right now? (single definition, used by every public path) ----------
create or replace function app_private.is_trip_public(p_trip_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.trips t
    join public.company_settings s on s.company_id = t.company_id
    join public.website_settings w on w.company_id = t.company_id
    where t.id = p_trip_id
      and t.status = 'scheduled'
      and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
      and s.booking_enabled
      and w.is_published
      and app_private.is_company_active(t.company_id)
  )
$$;
revoke all on function app_private.is_trip_public(uuid) from public, anon, authenticated;

-- =====================================================================================================
-- public_search_trips: anonymous + signed-in. Allow-listed columns only.
-- =====================================================================================================
create or replace function public.public_search_trips(
  p_origin text default null, p_destination text default null, p_date date default null,
  p_company_id uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  trip_id uuid, company_id uuid, company_name text, company_slug text,
  route_id uuid, origin_name text, destination_name text,
  departure_at timestamptz, arrival_at timestamptz,
  price numeric, currency char(3), capacity smallint, seats_available integer,
  max_seats_per_booking smallint, timezone text)
language sql stable security definer set search_path = '' as $$
  select t.id, c.id, c.name, c.slug::text,
         r.id, r.origin_name, r.destination_name,
         t.departure_at, t.arrival_at,
         t.price, s.currency, t.capacity, (t.capacity - t.seats_booked)::integer,
         s.max_seats_per_booking, s.timezone
  from public.trips t
  join public.companies c        on c.id = t.company_id
  join public.company_settings s on s.company_id = t.company_id
  join public.website_settings w on w.company_id = t.company_id
  join public.routes r           on r.company_id = t.company_id and r.id = t.route_id
  where t.status = 'scheduled'
    and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
    and s.booking_enabled and w.is_published
    and c.deleted_at is null and c.status in ('trial', 'active')
    and r.is_active and r.deleted_at is null
    and (p_company_id  is null or t.company_id = p_company_id)
    and (p_origin      is null or lower(r.origin_name)      = lower(trim(p_origin)))
    and (p_destination is null or lower(r.destination_name) = lower(trim(p_destination)))
    and (p_date        is null or (t.departure_at at time zone s.timezone)::date = p_date)
  order by t.departure_at, t.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.public_search_trips(text, text, date, uuid, integer, integer) from public;
grant execute on function public.public_search_trips(text, text, date, uuid, integer, integer) to anon, authenticated;

-- stops of ONE public trip (so the booking form can offer pickup/drop-off). Same eligibility, same answer when hidden.
create or replace function public.public_trip_stops(p_trip_id uuid)
returns table (stop_id uuid, name text, address text, stop_order smallint, stop_type text, offset_minutes smallint)
language sql stable security definer set search_path = '' as $$
  select rs.id, rs.name, rs.address, rs.stop_order, rs.stop_type, rs.offset_minutes
  from public.trips t
  join public.route_stops rs on rs.company_id = t.company_id and rs.route_id = t.route_id and rs.is_active
  where t.id = p_trip_id and app_private.is_trip_public(t.id)
  order by rs.stop_order
$$;
revoke all on function public.public_trip_stops(uuid) from public;
grant execute on function public.public_trip_stops(uuid) to anon, authenticated;

-- =====================================================================================================
-- create_my_booking: the signed-in customer books seats for themselves.
-- =====================================================================================================
create or replace function public.create_my_booking(
  p_trip_id uuid, p_seats integer, p_full_name text, p_phone text,
  p_email text default null, p_university text default null, p_student_id text default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_idempotency_key text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid; v_trip public.trips%rowtype; v_set public.company_settings%rowtype;
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := app_private.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_existing public.bookings%rowtype; v_cust uuid; v_id uuid; v_ref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'account disabled' using errcode = '42501'; end if;

  -- P2: company comes from the trip. Hidden / unknown / not-public trips all answer the same way.
  select t.company_id into v_company from public.trips t where t.id = p_trip_id;
  if v_company is null or not app_private.is_trip_public(p_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid customer name' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'invalid phone number: must be international format (E.164)' using errcode = '22023'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254) then
    raise exception 'invalid email' using errcode = '22023'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'invalid seats' using errcode = '22023'; end if;
  if v_key is not null and length(v_key) > 128 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  if length(coalesce(p_notes, '')) > 1000 or length(coalesce(p_university, '')) > 200 or length(coalesce(p_student_id, '')) > 100 then
    raise exception 'input too long' using errcode = '22023'; end if;

  -- P5: replay before taking the lock
  if v_key is not null then
    select * into v_existing from public.bookings b
     where b.company_id = v_company and b.idempotency_key = v_key and b.customer_id in (select app_private.my_customer_ids());
    if found then
      if v_existing.trip_id <> p_trip_id or v_existing.seats_count <> p_seats then
        raise exception 'idempotency key reused with a different request' using errcode = '23505'; end if;
      return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference, 'status', v_existing.status,
        'trip_id', v_existing.trip_id, 'seats_count', v_existing.seats_count, 'unit_price', v_existing.unit_price,
        'total_amount', v_existing.total_amount, 'currency', v_existing.currency, 'idempotent_replay', true);
    end if;
  end if;

  -- P4: serialise on the trip row (same order as 0010: trip -> booking)
  select * into v_trip from public.trips t where t.id = p_trip_id and t.company_id = v_company for update;
  if not found or not app_private.is_trip_public(p_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  select * into v_set from public.company_settings s where s.company_id = v_company;

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

  -- P3: reuse MY customer row in this company, else create one linked to me. Never attach a pre-existing phone row.
  select c.id into v_cust from public.customers c
   where c.company_id = v_company and c.user_id = v_uid and c.deleted_at is null;
  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_company and c.phone = v_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505';
    end if;
    insert into public.customers (company_id, user_id, full_name, phone, email, university, student_id)
    values (v_company, v_uid, v_name, v_phone, v_email, nullif(trim(coalesce(p_university, '')), ''), nullif(trim(coalesce(p_student_id, '')), ''))
    returning id into v_cust;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_ref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count,
                                   unit_price, total_amount, currency, status, payment_status, source, idempotency_key, notes, created_by)
      values (v_company, v_ref, p_trip_id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, p_seats,
              v_trip.price, v_trip.price * p_seats, v_set.currency, 'confirmed', 'unpaid', 'web', v_key,
              nullif(trim(coalesce(p_notes, '')), ''), v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if sqlerrm like '%bookings_idempotency_uq%' then
        raise exception 'idempotency key reused with a different request' using errcode = '23505'; end if;
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  perform app_private.write_audit('customer', v_company, 'booking.created', 'booking', v_id,
    jsonb_build_object('trip_id', p_trip_id, 'seats', p_seats, 'reference', v_ref, 'source', 'web'));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'confirmed', 'trip_id', p_trip_id,
    'seats_count', p_seats, 'unit_price', v_trip.price, 'total_amount', v_trip.price * p_seats,
    'currency', v_set.currency, 'idempotent_replay', false);
end $$;
revoke all on function public.create_my_booking(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_my_booking(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) to authenticated;

-- =====================================================================================================
-- cancel_my_booking: owner only, inside the cancellation window. Seats released once by the 0010 trigger.
-- =====================================================================================================
create or replace function public.cancel_my_booking(p_booking_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; v_trip_id uuid; v_trip public.trips%rowtype;
  v_window integer; b public.bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(coalesce(p_reason, '')) > 500 then raise exception 'input too long' using errcode = '22023'; end if;

  -- ownership first; not mine and not existing look identical
  select bk.company_id, bk.trip_id into v_company, v_trip_id from public.bookings bk
   where bk.id = p_booking_id and bk.customer_id in (select app_private.my_customer_ids());
  if v_company is null then raise exception 'booking not found' using errcode = 'P0002'; end if;

  select * into v_trip from public.trips t where t.id = v_trip_id and t.company_id = v_company for update;   -- trip first
  select * into b from public.bookings bk where bk.id = p_booking_id for update;                             -- then booking

  if b.status = 'cancelled' then
    return jsonb_build_object('id', b.id, 'status', 'cancelled', 'already_cancelled', true, 'seats_released', 0);
  end if;
  if b.status in ('completed', 'no_show') then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;
  if v_trip.status <> 'scheduled' then raise exception 'trip is closed' using errcode = '23514'; end if;

  select s.cancellation_window_hours into v_window from public.company_settings s where s.company_id = v_company;
  if v_trip.departure_at - now() < make_interval(hours => v_window) then
    raise exception 'cancellation window closed' using errcode = '23514'; end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_booking_id;

  perform app_private.write_audit('customer', v_company, 'booking.cancelled', 'booking', b.id,
    jsonb_build_object('trip_id', b.trip_id, 'seats_released', b.seats_count, 'by', 'customer'));
  return jsonb_build_object('id', b.id, 'status', 'cancelled', 'already_cancelled', false, 'seats_released', b.seats_count);
end $$;
revoke all on function public.cancel_my_booking(uuid, text) from public, anon;
grant execute on function public.cancel_my_booking(uuid, text) to authenticated;

-- =====================================================================================================
-- my_booking_details: caller's own bookings WITH trip/route/stop display data. Safe columns only.
-- =====================================================================================================
create or replace function public.my_booking_details(p_company_id uuid default null)
returns table (
  id uuid, company_id uuid, company_name text, company_slug text, reference text, trip_id uuid,
  seats_count smallint, total_amount numeric, currency char(3), status text, payment_status text,
  created_at timestamptz, cancelled_at timestamptz,
  origin_name text, destination_name text, departure_at timestamptz, arrival_at timestamptz, trip_status text,
  pickup_stop_name text, dropoff_stop_name text, can_cancel boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.company_id, c.name, c.slug::text, b.reference, b.trip_id,
         b.seats_count, b.total_amount, b.currency, b.status, b.payment_status, b.created_at, b.cancelled_at,
         r.origin_name, r.destination_name, t.departure_at, t.arrival_at, t.status,
         ps.name, ds.name,
         (b.status in ('pending', 'confirmed') and t.status = 'scheduled'
          and t.departure_at - now() >= make_interval(hours => s.cancellation_window_hours))
  from public.bookings b
  join public.companies c        on c.id = b.company_id
  join public.company_settings s on s.company_id = b.company_id
  join public.trips t            on t.company_id = b.company_id and t.id = b.trip_id
  join public.routes r           on r.company_id = t.company_id and r.id = t.route_id
  left join public.route_stops ps on ps.company_id = b.company_id and ps.id = b.pickup_stop_id
  left join public.route_stops ds on ds.company_id = b.company_id and ds.id = b.dropoff_stop_id
  where b.customer_id in (select app_private.my_customer_ids())
    and (p_company_id is null or b.company_id = p_company_id)
  order by b.created_at desc
$$;
revoke all on function public.my_booking_details(uuid) from public, anon;
grant execute on function public.my_booking_details(uuid) to authenticated;
