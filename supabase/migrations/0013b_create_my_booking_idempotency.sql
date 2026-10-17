-- 0013b: corrective migration for create_my_booking (0013). Applied AFTER 0013 and BEFORE the next feature migration (0014).
-- 0013 is already applied in environments, so it is NOT rewritten; this file replaces the function (create or replace).
--
-- Defects fixed (compared with the established handling in 0010 create_booking):
--   D1  0013 looked the idempotency key up only BEFORE the trip row lock. A concurrent retry that waited on the lock
--       then ran the capacity check / insert and failed with "not enough seats" or a uniqueness error instead of
--       returning the original booking.  -> serialise per (company, key) with an advisory lock, look up again after
--       the trip lock (0010 does the same), and resolve a late unique_violation by re-reading the winner.
--   D2  Replay only compared trip + seats. Reusing a key with another pickup/dropoff stop or other notes was silently
--       treated as a replay.  -> compare every booking-level input that is persisted on the booking row.
--   D3  A key held by someone else's booking (another customer / staff) surfaced as a raw unique violation after the
--       capacity checks.  -> same neutral 23505 'idempotency key reused with a different request' up front, and it
--       never reveals whose booking it is.
-- Not compared on purpose: full_name / phone / email / university / student_id. They belong to the customers row,
-- which create_my_booking reuses and never overwrites, so they are not part of the booking outcome; comparing them
-- would reject a legitimate retry from a customer whose stored profile differs from the form defaults.
-- Preserved: customer ownership (key lookups are scoped to my_customer_ids()), tenant isolation (company derived from
-- the trip), capacity guarantees (trip row lock -> booking insert, trigger + CHECK from 0010), lock order
-- (advisory -> trip -> booking; no other path takes the advisory lock, so no new deadlock cycle).
set search_path = public, extensions;

-- Replay decision for ONE (company, key). null = key unused. Raises 23505 when the key belongs to somebody else's
-- booking or to a different request; otherwise returns the original result. SECURITY DEFINER because it reads
-- bookings of the caller's customer rows through app_private.my_customer_ids() (auth.uid()-derived).
create or replace function app_private.my_booking_replay(
  p_company_id uuid, p_key text, p_trip_id uuid, p_seats integer,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid, p_notes text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_existing public.bookings%rowtype;
begin
  select * into v_existing from public.bookings b where b.company_id = p_company_id and b.idempotency_key = p_key;
  if not found then return null; end if;
  if v_existing.customer_id not in (select app_private.my_customer_ids())
     or v_existing.trip_id <> p_trip_id
     or v_existing.seats_count <> p_seats
     or v_existing.pickup_stop_id  is distinct from p_pickup_stop_id
     or v_existing.dropoff_stop_id is distinct from p_dropoff_stop_id
     or v_existing.notes is distinct from p_notes then
    raise exception 'idempotency key reused with a different request' using errcode = '23505';
  end if;
  return jsonb_build_object('id', v_existing.id, 'reference', v_existing.reference, 'status', v_existing.status,
    'trip_id', v_existing.trip_id, 'seats_count', v_existing.seats_count, 'unit_price', v_existing.unit_price,
    'total_amount', v_existing.total_amount, 'currency', v_existing.currency, 'idempotent_replay', true);
end $$;
revoke all on function app_private.my_booking_replay(uuid, text, uuid, integer, uuid, uuid, text) from public, anon, authenticated;

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
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_replay jsonb; v_cust uuid; v_id uuid; v_ref text; v_attempt int := 0;
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

  if v_key is not null then
    -- D1: identical retries queue here, so the second one always finds the first one's committed booking.
    perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || v_key, 0));
    v_replay := app_private.my_booking_replay(v_company, v_key, p_trip_id, p_seats, p_pickup_stop_id, p_dropoff_stop_id, v_notes);
    if v_replay is not null then return v_replay; end if;
  end if;

  -- P4: serialise on the trip row (same order as 0010: trip -> booking)
  select * into v_trip from public.trips t where t.id = p_trip_id and t.company_id = v_company for update;
  if not found or not app_private.is_trip_public(p_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  -- same key may have committed (via another path) while we waited for the trip lock; 0010 rechecks here too
  if v_key is not null then
    v_replay := app_private.my_booking_replay(v_company, v_key, p_trip_id, p_seats, p_pickup_stop_id, p_dropoff_stop_id, v_notes);
    if v_replay is not null then return v_replay; end if;
  end if;

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
              v_trip.price, v_trip.price * p_seats, v_set.currency, 'confirmed', 'unpaid', 'web', v_key, v_notes, v_uid)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if sqlerrm like '%bookings_idempotency_uq%' then
        -- D1 last line of defence: someone committed this key between our lookups and the insert (e.g. a retry on a
        -- different trip row). Re-read the winner: identical request -> replay, anything else -> neutral conflict.
        v_replay := app_private.my_booking_replay(v_company, v_key, p_trip_id, p_seats, p_pickup_stop_id, p_dropoff_stop_id, v_notes);
        if v_replay is not null then return v_replay; end if;
        raise exception 'idempotency key reused with a different request' using errcode = '23505';
      end if;
      if v_attempt >= 8 then raise; end if;      -- reference collision: try another code
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
