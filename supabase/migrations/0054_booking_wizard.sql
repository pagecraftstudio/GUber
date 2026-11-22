-- 0054 (P2): pay-first booking - payment instructions, a payment deadline that holds the seats, automatic cancel, and the single-trip read the
-- booking page needs. Plan: docs/plans/NEXT-FEATURES-PLAN.md section 4. Builds on 0053 (scheduler + notifications).
--
-- WHAT
--   company_payment_settings   one row per company: Vodafone Cash / InstaPay details, a payment WhatsApp number, the deadline (1-48 h) and notes.
--                              `require_prepayment` is OFF by default: a company that has not turned it on books exactly as before (confirmed at
--                              once, paid at the bus). Written only through save_company_payment_settings (settings.write).
--   bookings.payment_due_at    set only for a web booking made while the company requires prepayment and the total is above zero. Such a booking is
--                              `pending` (holds its seats, no ticket yet) until staff record the full amount (set_booking_amount_paid), which
--                              confirms it (the existing trigger then issues the tickets). Nothing else changes a booking's payment state.
--   quote_my_booking           what the wizard's invoice step shows, from the server (price, total, deadline, whether payment is needed).
--   my_booking_payment         the payment instructions of THIS caller's own booking only (numbers are not public: only the student who made the
--                              booking sees them, and only while it is unpaid).
--   public_trip_detail         ONE bookable trip for the booking page opened from a company website (same eligibility as public_search_trips).
--   cancel_unpaid_bookings     job (every minute): a pending booking past its deadline with NOTHING recorded as paid is cancelled with reason
--                              payment_timeout; the seat-release trigger runs exactly once. If staff recorded part of the amount, it is NOT
--                              cancelled automatically (a person is already handling it).
--   remind_unpaid_bookings     job: one reminder at half the window and one in the last 10 minutes (deduplicated by key).
--   events booking.payment_reminder / booking.cancelled_unpaid / booking.confirmed become live (in-app text, both languages).
--
-- NOT CHANGED ON PURPOSE: round-trip and subscriber bookings (a later phase moves them into the same wizard), staff create_booking, the cancel
--   rules and windows, the ticket trigger, capacity locking order (trip first, then booking).
-- SECURITY: no client write to the new table; every function is security definer with search_path = ''; the company always comes from the trip /
--   the caller's membership, never from a parameter; payment numbers are reachable only by staff of that company (select policy) and by the
--   student who owns an unpaid booking of it.
--
-- ROLLBACK (manual)
--   delete from app_private.jobs where name in ('cancel-unpaid-bookings','remind-unpaid-bookings');
--   update notification_events set is_live = false where key in ('booking.payment_reminder','booking.cancelled_unpaid','booking.confirmed');
--   delete from notification_templates where company_id is null and key in ('booking.payment_reminder','booking.cancelled_unpaid','booking.confirmed');
--   drop function public.public_trip_detail(uuid), public.quote_my_booking(uuid, integer), public.my_booking_payment(uuid),
--     public.save_company_payment_settings(boolean, text, text, text, text, text, integer, text, text),
--     app_private.cancel_unpaid_bookings(), app_private.remind_unpaid_bookings();
--   alter table bookings drop column payment_due_at; drop table company_payment_settings;
--   (create_my_booking_impl and set_booking_amount_paid must be restored from 0013/0020 and 0032.)
-- RUNNER NOTE: requires 0053. Apply BEFORE deploying code that reads these (incident 0033).
set search_path = public, extensions;

-- 1. settings ----------------------------------------------------------------------------------------------------------------------------
create table company_payment_settings (
  company_id           uuid primary key references companies(id) on delete cascade,
  require_prepayment   boolean not null default false,
  vodafone_cash_number text,                                   -- E.164, normalised on save
  vodafone_cash_holder text,
  instapay_address     text,
  instapay_holder      text,
  payment_whatsapp     text,                                   -- E.164: where the student sends the transfer proof
  payment_deadline_hours smallint not null default 2 check (payment_deadline_hours between 1 and 48),
  note_en              text,
  note_ar              text,
  updated_by           uuid references profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint cps_lengths check (
    length(coalesce(vodafone_cash_holder, '')) <= 100 and length(coalesce(instapay_holder, '')) <= 100 and length(coalesce(instapay_address, '')) <= 100
    and length(coalesce(note_en, '')) <= 500 and length(coalesce(note_ar, '')) <= 500),
  constraint cps_prepayment_has_details check (
    not require_prepayment or ((vodafone_cash_number is not null or instapay_address is not null) and payment_whatsapp is not null))
);
alter table company_payment_settings enable row level security;
create policy tenant_select   on company_payment_settings for select to authenticated using (app_private.has_permission(company_id, 'settings.read'));
create policy platform_select on company_payment_settings for select to authenticated using (app_private.is_platform_user());
revoke all on company_payment_settings from public, anon, authenticated;
grant select on company_payment_settings to authenticated;
create trigger "000_tenant_guard" before insert or update on company_payment_settings for each row execute function app_private.tenant_guard();
create trigger forbid_company_id_change before update on company_payment_settings for each row execute function app_private.forbid_company_id_change();
create trigger set_updated_at before update on company_payment_settings for each row execute function app_private.set_updated_at();

alter table bookings add column payment_due_at timestamptz;
create index bookings_payment_due_idx on bookings (payment_due_at) where status = 'pending' and payment_due_at is not null;

create function public.save_company_payment_settings(
  p_require boolean, p_vodafone text, p_vodafone_holder text, p_instapay text, p_instapay_holder text, p_whatsapp text,
  p_deadline_hours integer, p_note_en text, p_note_ar text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_co uuid := app_private.caller_company('settings.write');
  v_vf text := nullif(trim(coalesce(p_vodafone, '')), ''); v_wa text := nullif(trim(coalesce(p_whatsapp, '')), '');
  v_ip text := nullif(trim(coalesce(p_instapay, '')), '');
  v_text text;
begin
  perform app_private.rate_limit_hit('settings.write');
  if p_require is null or p_deadline_hours is null or p_deadline_hours not between 1 and 48 then raise exception 'invalid payment deadline' using errcode = '22023'; end if;
  if v_vf is not null then v_vf := app_private.normalize_phone(v_vf); if v_vf is null then raise exception 'invalid phone number' using errcode = '22023'; end if; end if;
  if v_wa is not null then v_wa := app_private.normalize_phone(v_wa); if v_wa is null then raise exception 'invalid phone number' using errcode = '22023'; end if; end if;
  if v_ip is not null and v_ip !~ '^[A-Za-z0-9._@+-]{3,100}$' then raise exception 'invalid instapay address' using errcode = '22023'; end if;
  foreach v_text in array array[coalesce(p_vodafone_holder, ''), coalesce(p_instapay_holder, ''), coalesce(p_note_en, ''), coalesce(p_note_ar, '')] loop
    if v_text ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception 'invalid text' using errcode = '22023'; end if;
    if length(v_text) > 500 then raise exception 'input too long' using errcode = '22023'; end if;
  end loop;
  if length(coalesce(p_vodafone_holder, '')) > 100 or length(coalesce(p_instapay_holder, '')) > 100 then raise exception 'input too long' using errcode = '22023'; end if;
  if p_require and ((v_vf is null and v_ip is null) or v_wa is null) then raise exception 'payment details required' using errcode = '22023'; end if;
  insert into public.company_payment_settings as s (company_id, require_prepayment, vodafone_cash_number, vodafone_cash_holder, instapay_address, instapay_holder,
                                                    payment_whatsapp, payment_deadline_hours, note_en, note_ar, updated_by)
  values (v_co, p_require, v_vf, nullif(trim(coalesce(p_vodafone_holder, '')), ''), v_ip, nullif(trim(coalesce(p_instapay_holder, '')), ''), v_wa, p_deadline_hours,
          nullif(trim(coalesce(p_note_en, '')), ''), nullif(trim(coalesce(p_note_ar, '')), ''), auth.uid())
  on conflict (company_id) do update set require_prepayment = excluded.require_prepayment, vodafone_cash_number = excluded.vodafone_cash_number,
    vodafone_cash_holder = excluded.vodafone_cash_holder, instapay_address = excluded.instapay_address, instapay_holder = excluded.instapay_holder,
    payment_whatsapp = excluded.payment_whatsapp, payment_deadline_hours = excluded.payment_deadline_hours, note_en = excluded.note_en,
    note_ar = excluded.note_ar, updated_by = excluded.updated_by;
  perform app_private.write_audit('company_user', v_co, 'payment_settings.saved', 'company', v_co,
    jsonb_build_object('require_prepayment', p_require, 'deadline_hours', p_deadline_hours));   -- never the numbers themselves
end $$;
revoke all on function public.save_company_payment_settings(boolean, text, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.save_company_payment_settings(boolean, text, text, text, text, text, integer, text, text) to authenticated;
insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description)
  select 'settings.write', 600, 30, 'save_company_payment_settings per user per 10 minutes'
   where not exists (select 1 from app_private.rate_limit_policies where bucket = 'settings.write');

-- 2. one bookable trip, for the booking page -----------------------------------------------------------------------------------------------
create function public.public_trip_detail(p_trip_id uuid)
returns table (
  trip_id uuid, company_id uuid, company_name text, company_slug text,
  route_id uuid, origin_name text, destination_name text,
  departure_at timestamptz, arrival_at timestamptz,
  price numeric, currency char(3), capacity smallint, seats_available integer,
  max_seats_per_booking smallint, timezone text)
language sql stable security definer set search_path = '' as $$
  select t.id, c.id, c.name, c.slug::text, r.id, r.origin_name, r.destination_name, t.departure_at, t.arrival_at,
         t.price, s.currency, t.capacity, (t.capacity - t.seats_booked)::integer, s.max_seats_per_booking, s.timezone
  from public.trips t
  join public.companies c        on c.id = t.company_id
  join public.company_settings s on s.company_id = t.company_id
  join public.website_settings w on w.company_id = t.company_id
  join public.routes r           on r.company_id = t.company_id and r.id = t.route_id
  where t.id = p_trip_id
    and t.status = 'scheduled'
    and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
    and s.booking_enabled and w.is_published
    and c.deleted_at is null and c.status in ('trial', 'active')
    and app_private.has_live_subscription(c.id)
    and r.is_active and r.deleted_at is null
$$;
revoke all on function public.public_trip_detail(uuid) from public;
grant execute on function public.public_trip_detail(uuid) to anon, authenticated;

-- 3. quote -------------------------------------------------------------------------------------------------------------------------------
create function public.quote_my_booking(p_trip_id uuid, p_seats integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.trips%rowtype; s public.company_settings%rowtype; ps public.company_payment_settings%rowtype; v_total numeric;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into t from public.trips x where x.id = p_trip_id;
  if not found or not app_private.is_trip_public(p_trip_id) then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'invalid seats' using errcode = '22023'; end if;
  select * into s from public.company_settings x where x.company_id = t.company_id;
  select * into ps from public.company_payment_settings x where x.company_id = t.company_id;
  v_total := t.price * p_seats;
  return jsonb_build_object('unit_price', t.price, 'total', v_total, 'currency', s.currency, 'seats', p_seats,
    'seats_available', t.capacity - t.seats_booked, 'max_seats', s.max_seats_per_booking,
    'requires_payment', coalesce(ps.require_prepayment, false) and v_total > 0,
    'deadline_hours', case when coalesce(ps.require_prepayment, false) and v_total > 0 then ps.payment_deadline_hours end);
end $$;
revoke all on function public.quote_my_booking(uuid, integer) from public, anon;
grant execute on function public.quote_my_booking(uuid, integer) to authenticated;

-- 4. booking creation: pending + deadline when the company requires prepayment --------------------------------------------------------------
-- Both functions are the LIVE definitions (0013 -> 0013b -> 0020); the ONLY differences are marked  -- P2  (replay also returns payment_due_at).
CREATE OR REPLACE FUNCTION app_private.my_booking_replay(p_company_id uuid, p_key text, p_trip_id uuid, p_seats integer, p_pickup_stop_id uuid, p_dropoff_stop_id uuid, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'total_amount', v_existing.total_amount, 'currency', v_existing.currency, 'payment_due_at', v_existing.payment_due_at, 'idempotent_replay', true);
end $function$;

CREATE OR REPLACE FUNCTION app_private.create_my_booking_impl(p_trip_id uuid, p_seats integer, p_full_name text, p_phone text, p_email text DEFAULT NULL::text, p_university text DEFAULT NULL::text, p_student_id text DEFAULT NULL::text, p_pickup_stop_id uuid DEFAULT NULL::uuid, p_dropoff_stop_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid; v_trip public.trips%rowtype; v_set public.company_settings%rowtype;
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := app_private.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_replay jsonb; v_pay public.company_payment_settings%rowtype; v_status text; v_due timestamptz;   -- P2
  v_cust uuid; v_id uuid; v_ref text; v_attempt int := 0;
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
  select * into v_pay from public.company_payment_settings ps where ps.company_id = v_company;   -- P2

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

  -- P2: a pay-first company and something to pay -> pending with a deadline (seats held; tickets come when staff confirm the payment)
  if coalesce(v_pay.require_prepayment, false) and v_trip.price * p_seats > 0 then
    v_status := 'pending'; v_due := now() + make_interval(hours => v_pay.payment_deadline_hours);
  else
    v_status := 'confirmed'; v_due := null;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_ref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count,
                                   unit_price, total_amount, currency, status, payment_status, source, idempotency_key, notes, created_by, payment_due_at)
      values (v_company, v_ref, p_trip_id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, p_seats,
              v_trip.price, v_trip.price * p_seats, v_set.currency, v_status, 'unpaid', 'web', v_key, v_notes, v_uid, v_due)
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
    jsonb_build_object('trip_id', p_trip_id, 'seats', p_seats, 'reference', v_ref, 'source', 'web', 'status', v_status));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', v_status, 'trip_id', p_trip_id,
    'seats_count', p_seats, 'unit_price', v_trip.price, 'total_amount', v_trip.price * p_seats,
    'currency', v_set.currency, 'payment_due_at', v_due, 'idempotent_replay', false);
end $function$;
revoke all on function app_private.create_my_booking_impl(uuid, integer, text, text, text, text, text, uuid, uuid, text, text) from public, anon, authenticated;

-- 5. the student's own payment instructions ------------------------------------------------------------------------------------------------
create function public.my_booking_payment(p_booking_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings%rowtype; ps public.company_payment_settings%rowtype; s public.company_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into b from public.bookings x where x.id = p_booking_id and x.customer_id in (select app_private.my_customer_ids());
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into ps from public.company_payment_settings x where x.company_id = b.company_id;
  select * into s from public.company_settings x where x.company_id = b.company_id;
  return jsonb_build_object('reference', b.reference, 'status', b.status, 'payment_status', b.payment_status, 'total', b.total_amount,
    'amount_paid', b.amount_paid, 'currency', b.currency, 'payment_due_at', b.payment_due_at, 'timezone', s.timezone,
    -- the numbers are shown only while there is something to pay on a live booking
    'instructions', case when b.status in ('pending', 'confirmed') and b.payment_status <> 'paid' and ps.company_id is not null and
                              (ps.vodafone_cash_number is not null or ps.instapay_address is not null) then jsonb_build_object(
      'vodafone_cash_number', ps.vodafone_cash_number, 'vodafone_cash_holder', ps.vodafone_cash_holder,
      'instapay_address', ps.instapay_address, 'instapay_holder', ps.instapay_holder, 'whatsapp', ps.payment_whatsapp,
      'note_en', ps.note_en, 'note_ar', ps.note_ar) end);
end $$;
revoke all on function public.my_booking_payment(uuid) from public, anon;
grant execute on function public.my_booking_payment(uuid) to authenticated;

-- 6. staff record the full payment -> a pending booking is confirmed (tickets by the existing trigger) ----------------------------------------
-- Same function as 0032; the ONLY differences are marked  -- P2.
create or replace function public.set_booking_amount_paid(p_booking_id uuid, p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; b public.bookings%rowtype; v_status text; v_booking_status text; v_trip_status text; v_user uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid amount' using errcode = '22023'; end if;
  select bk.company_id into v_company from public.bookings bk where bk.id = p_booking_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id for update;
  if p_amount > b.total_amount then raise exception 'amount exceeds booking total' using errcode = '23514'; end if;
  if b.status = 'cancelled' and p_amount > 0 then
    raise exception 'booking cannot be cancelled in its current state' using errcode = '23514'; end if;

  v_status := case
    when p_amount >= b.total_amount and p_amount > 0 then 'paid'
    when p_amount > 0 then 'partial'
    when b.payment_status = 'refunded' then 'refunded'
    else 'unpaid' end;
  if b.total_amount = 0 then v_status := 'paid'; end if;

  v_booking_status := b.status;
  if b.status = 'pending' and v_status = 'paid' then                                                                   -- P2
    select t.status into v_trip_status from public.trips t where t.id = b.trip_id and t.company_id = b.company_id;
    if v_trip_status not in ('scheduled', 'boarding') then raise exception 'trip is closed' using errcode = '23514'; end if;
    v_booking_status := 'confirmed';
  end if;

  update public.bookings set amount_paid = p_amount, payment_status = v_status, status = v_booking_status,
         payment_due_at = case when v_booking_status = 'confirmed' then null else payment_due_at end
   where id = p_booking_id;
  perform app_private.write_audit('company_user', v_company, 'booking.amount_paid', 'booking', b.id,
    jsonb_build_object('from_amount', b.amount_paid, 'to_amount', p_amount, 'from', b.payment_status, 'to', v_status, 'booking_status', v_booking_status));
  if v_booking_status = 'confirmed' and b.status = 'pending' then                                                      -- P2: tell the student
    select c.user_id into v_user from public.customers c where c.id = b.customer_id and c.company_id = b.company_id;
    if v_user is not null then
      perform app_private.enqueue_notification('booking.confirmed', v_user, b.company_id, jsonb_build_object('reference', b.reference),
                                               'booking', b.id, 'booking.confirmed:' || b.id, '/my-bookings');
    end if;
  end if;
  return jsonb_build_object('id', b.id, 'amount_paid', p_amount, 'payment_status', v_status, 'total_amount', b.total_amount, 'status', v_booking_status);
end $$;
revoke all on function public.set_booking_amount_paid(uuid, numeric) from public, anon;
grant execute on function public.set_booking_amount_paid(uuid, numeric) to authenticated;

-- 7. notification texts (events were catalogued, not live, in 0053) --------------------------------------------------------------------------
update notification_events set is_live = true where key in ('booking.payment_reminder', 'booking.cancelled_unpaid', 'booking.confirmed');
insert into notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'booking.payment_reminder', 'in_app', 'en', 'Payment due soon: {{reference}}', 'Send your payment proof before {{due}} or booking {{reference}} ({{route}}) is cancelled automatically.'),
  (null, 'booking.payment_reminder', 'in_app', 'ar', 'اقترب موعد الدفع: {{reference}}', 'أرسل إثبات الدفع قبل {{due}} وإلا يُلغى الحجز {{reference}} ({{route}}) تلقائيًا.'),
  (null, 'booking.cancelled_unpaid', 'in_app', 'en', 'Booking cancelled: {{reference}}', 'Booking {{reference}} ({{route}}) was cancelled because the payment was not received in time. Your seats were released.'),
  (null, 'booking.cancelled_unpaid', 'in_app', 'ar', 'أُلغي الحجز: {{reference}}', 'أُلغي الحجز {{reference}} ({{route}}) لعدم استلام الدفع في الموعد. تم تحرير مقاعدك.'),
  (null, 'booking.confirmed', 'in_app', 'en', 'Booking confirmed: {{reference}}', 'Your payment for booking {{reference}} was received. Your ticket is ready in My bookings.'),
  (null, 'booking.confirmed', 'in_app', 'ar', 'تم تأكيد الحجز: {{reference}}', 'تم استلام دفعتك للحجز {{reference}}. تذكرتك جاهزة في حجوزاتي.');

-- 8. jobs ---------------------------------------------------------------------------------------------------------------------------------
create function app_private.cancel_unpaid_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0; v_user uuid; v_route text; v_done uuid;
begin
  for r in select b.id, b.company_id, b.trip_id, b.customer_id, b.reference from public.bookings b
            where b.status = 'pending' and b.payment_due_at is not null and b.payment_due_at <= now() and b.amount_paid = 0
            order by b.payment_due_at, b.id limit 200 loop
    perform 1 from public.trips t where t.id = r.trip_id and t.company_id = r.company_id for update;                 -- trip first, then booking (same order everywhere)
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = null, cancellation_reason = 'payment_timeout'
     where id = r.id and status = 'pending' and amount_paid = 0 and payment_due_at <= now()
     returning id into v_done;                                                                                        -- the trigger releases the seats, once
    if v_done is null then continue; end if;
    v_n := v_n + 1;
    perform app_private.write_audit('system', r.company_id, 'booking.cancelled_unpaid', 'booking', r.id, jsonb_build_object('reference', r.reference));
    select c.user_id into v_user from public.customers c where c.id = r.customer_id and c.company_id = r.company_id;
    if v_user is not null then
      select rt.origin_name || ' → ' || rt.destination_name into v_route from public.trips t
        join public.routes rt on rt.company_id = t.company_id and rt.id = t.route_id where t.id = r.trip_id;
      perform app_private.enqueue_notification('booking.cancelled_unpaid', v_user, r.company_id,
        jsonb_build_object('reference', r.reference, 'route', v_route), 'booking', r.id, 'booking.cancelled_unpaid:' || r.id, '/my-bookings');
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.cancel_unpaid_bookings() from public, anon, authenticated;

create function app_private.remind_unpaid_bookings() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0; v_kind text; v_route text; v_due text;
begin
  for r in select b.id, b.company_id, b.reference, b.trip_id, b.payment_due_at, b.created_at, c.user_id, s.timezone
             from public.bookings b
             join public.customers c on c.id = b.customer_id and c.company_id = b.company_id and c.user_id is not null
             join public.company_settings s on s.company_id = b.company_id
            where b.status = 'pending' and b.payment_due_at > now() and b.amount_paid = 0
              and (b.payment_due_at - now() <= interval '10 minutes' or now() >= b.created_at + (b.payment_due_at - b.created_at) / 2)
            order by b.payment_due_at limit 500 loop
    v_kind := case when r.payment_due_at - now() <= interval '10 minutes' then '10m' else 'half' end;
    select rt.origin_name || ' → ' || rt.destination_name into v_route from public.trips t
      join public.routes rt on rt.company_id = t.company_id and rt.id = t.route_id where t.id = r.trip_id;
    v_due := to_char(r.payment_due_at at time zone r.timezone, 'DD Mon HH24:MI');
    v_n := v_n + app_private.enqueue_notification('booking.payment_reminder', r.user_id, r.company_id,
      jsonb_build_object('reference', r.reference, 'route', v_route, 'due', v_due), 'booking', r.id, 'booking.payment_reminder:' || r.id || ':' || v_kind, '/my-bookings');
  end loop;
  return v_n;
end $$;
revoke all on function app_private.remind_unpaid_bookings() from public, anon, authenticated;

insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values
  ('cancel-unpaid-bookings', 'cancel_unpaid_bookings', 60, 300),
  ('remind-unpaid-bookings', 'remind_unpaid_bookings', 60, 300);
