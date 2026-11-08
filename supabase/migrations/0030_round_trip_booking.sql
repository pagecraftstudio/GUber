-- 0030: go-and-return PHASE B: students can see and book round trips.
--
-- WHAT
--   1. bookings.round_trip_group_id + bookings.trip_leg link the two bookings of one round-trip purchase.
--   2. public_search_trips also returns round_trip_price + return_options (how many return times are bookable).
--      The round-trip price is published ONLY when at least one return option is bookable.
--   3. public_trip_return_options(trip): the bookable return times of one public outbound trip.
--   4. create_my_round_trip_booking(): books outbound + the chosen return trip in ONE transaction, for ONE price.
--   5. cancel_my_booking(): cancelling one leg also cancels the other leg when that leg is still cancellable.
-- PRICING: the customer pays trips.round_trip_price per seat. It is split over the two bookings in proportion to the two
--   single-leg prices (price_go : price_return), the return leg takes the rounding remainder, so
--   outbound.total + return.total = round_trip_price * seats exactly. Each leg satisfies bookings_total_matches.
-- SAFETY (unchanged rules from 0013/0013b/0020): company derived from the trip, never from the client; customer derived
--   from auth.uid(); both trips locked in id order (no deadlock with single-trip bookings or with another round trip);
--   per-user rate limit bucket 'booking.create'; idempotency key per request (return leg stores key || ':return').
-- NOT CHANGED: single-trip booking (create_my_booking), staff booking (create_booking), tickets (trigger from 0014 issues the
--   tickets of each leg).
-- ROLLBACK: restore cancel_my_booking from 0020 and public_search_trips from 0022 (drop the 8-column version first);
--   drop function public.create_my_round_trip_booking(...), app_private.create_my_round_trip_booking_impl(...),
--   app_private.round_trip_result(uuid, boolean), public.public_trip_return_options(uuid);
--   alter table public.bookings drop column round_trip_group_id, drop column trip_leg;
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh (staging first). Immutable once applied.
set search_path = public, extensions;

alter table bookings
  add column round_trip_group_id uuid,
  add column trip_leg text check (trip_leg in ('outbound', 'return')),
  add constraint bookings_leg_with_group check ((round_trip_group_id is null) = (trip_leg is null));
create index bookings_round_trip_group_idx on bookings(round_trip_group_id) where round_trip_group_id is not null;
create unique index bookings_group_leg_uq on bookings(round_trip_group_id, trip_leg) where round_trip_group_id is not null;

-- ---------------------------------------------------------------------------------------------------
-- public search: + round_trip_price, return_options (return type changes => drop + create)
-- ---------------------------------------------------------------------------------------------------
drop function public.public_search_trips(text, text, date, uuid, integer, integer);
create function public.public_search_trips(
  p_origin text default null, p_destination text default null, p_date date default null,
  p_company_id uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  trip_id uuid, company_id uuid, company_name text, company_slug text,
  route_id uuid, origin_name text, destination_name text,
  departure_at timestamptz, arrival_at timestamptz,
  price numeric, currency char(3), capacity smallint, seats_available integer,
  max_seats_per_booking smallint, timezone text,
  round_trip_price numeric, return_options integer)
language sql stable security definer set search_path = '' as $$
  select t.id, c.id, c.name, c.slug::text,
         r.id, r.origin_name, r.destination_name,
         t.departure_at, t.arrival_at,
         t.price, s.currency, t.capacity, (t.capacity - t.seats_booked)::integer,
         s.max_seats_per_booking, s.timezone,
         case when ro.n > 0 then t.round_trip_price end, coalesce(ro.n, 0)::integer
  from public.trips t
  join public.companies c        on c.id = t.company_id
  join public.company_settings s on s.company_id = t.company_id
  join public.website_settings w on w.company_id = t.company_id
  join public.routes r           on r.company_id = t.company_id and r.id = t.route_id
  left join lateral (
    select count(*) as n from public.trips rt
     where t.round_trip_price is not null and rt.outbound_trip_id = t.id and rt.company_id = t.company_id
       and app_private.is_trip_public(rt.id)
  ) ro on true
  where t.status = 'scheduled'
    and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
    and s.booking_enabled and w.is_published
    and c.deleted_at is null and c.status in ('trial', 'active')
    and app_private.has_live_subscription(c.id)
    and r.is_active and r.deleted_at is null
    and (p_company_id  is null or t.company_id = p_company_id)
    and (p_origin      is null or lower(r.origin_name)      = lower(trim(p_origin)))
    and (p_destination is null or lower(r.destination_name) = lower(trim(p_destination)))
    and (p_date        is null or (t.departure_at at time zone s.timezone)::date = p_date)
  order by t.departure_at, t.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 1000)
$$;
revoke all on function public.public_search_trips(text, text, date, uuid, integer, integer) from public;
grant execute on function public.public_search_trips(text, text, date, uuid, integer, integer) to anon, authenticated;

-- return times of ONE public outbound trip (same eligibility as search; hidden / unknown => no rows)
create function public.public_trip_return_options(p_trip_id uuid)
returns table (trip_id uuid, route_id uuid, origin_name text, destination_name text,
               departure_at timestamptz, arrival_at timestamptz, price numeric, seats_available integer, timezone text)
language sql stable security definer set search_path = '' as $$
  select rt.id, r.id, r.origin_name, r.destination_name, rt.departure_at, rt.arrival_at, rt.price,
         (rt.capacity - rt.seats_booked)::integer, s.timezone
  from public.trips o
  join public.trips rt on rt.outbound_trip_id = o.id and rt.company_id = o.company_id
  join public.routes r on r.company_id = rt.company_id and r.id = rt.route_id and r.is_active and r.deleted_at is null
  join public.company_settings s on s.company_id = o.company_id
  where o.id = p_trip_id and o.round_trip_price is not null
    and app_private.is_trip_public(o.id) and app_private.is_trip_public(rt.id)
  order by rt.departure_at, rt.id
$$;
revoke all on function public.public_trip_return_options(uuid) from public;
grant execute on function public.public_trip_return_options(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- result of a round-trip booking (both legs), read back from the table so a replay answers exactly like the first call
-- ---------------------------------------------------------------------------------------------------
create function app_private.round_trip_result(p_group uuid, p_replay boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'group_id', p_group, 'currency', o.currency, 'total_amount', o.total_amount + r.total_amount,
    'outbound', jsonb_build_object('id', o.id, 'reference', o.reference, 'status', o.status, 'trip_id', o.trip_id,
                 'seats_count', o.seats_count, 'unit_price', o.unit_price, 'total_amount', o.total_amount),
    'return',   jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'trip_id', r.trip_id,
                 'seats_count', r.seats_count, 'unit_price', r.unit_price, 'total_amount', r.total_amount),
    'idempotent_replay', p_replay)
  from public.bookings o join public.bookings r on r.round_trip_group_id = o.round_trip_group_id and r.trip_leg = 'return'
  where o.round_trip_group_id = p_group and o.trip_leg = 'outbound'
$$;
revoke all on function app_private.round_trip_result(uuid, boolean) from public, anon, authenticated;

create function app_private.create_my_round_trip_booking_impl(
  p_outbound_trip_id uuid, p_return_trip_id uuid, p_seats integer, p_full_name text, p_phone text,
  p_email text, p_university text, p_student_id text,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid, p_return_pickup_stop_id uuid, p_return_dropoff_stop_id uuid,
  p_idempotency_key text, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_company uuid; v_out public.trips%rowtype; v_ret public.trips%rowtype; v_set public.company_settings%rowtype;
  v_name text := trim(coalesce(p_full_name, '')); v_phone text := app_private.normalize_phone(p_phone);
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_ob public.bookings%rowtype; v_rb public.bookings%rowtype; v_cust uuid; v_group uuid := gen_random_uuid();
  v_out_share numeric(12,2); v_ret_share numeric(12,2); v_oid uuid; v_rid uuid; v_oref text; v_rref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'account disabled' using errcode = '42501'; end if;
  if p_outbound_trip_id is null or p_return_trip_id is null or p_outbound_trip_id = p_return_trip_id then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  -- company from the OUTBOUND trip; the return trip must be one of ITS return options (same company, linked, offered)
  select t.company_id into v_company from public.trips t where t.id = p_outbound_trip_id;
  if v_company is null or not app_private.is_trip_public(p_outbound_trip_id) or not exists (
       select 1 from public.trips r join public.trips o on o.id = r.outbound_trip_id and o.company_id = r.company_id
        where r.id = p_return_trip_id and o.id = p_outbound_trip_id and o.company_id = v_company and o.round_trip_price is not null)
     or not app_private.is_trip_public(p_return_trip_id) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'invalid customer name' using errcode = '22023'; end if;
  if v_phone is null then raise exception 'invalid phone number: must be international format (E.164)' using errcode = '22023'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254) then
    raise exception 'invalid email' using errcode = '22023'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'invalid seats' using errcode = '22023'; end if;
  if v_key is not null and length(v_key) > 120 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  if length(coalesce(p_notes, '')) > 1000 or length(coalesce(p_university, '')) > 200 or length(coalesce(p_student_id, '')) > 100 then
    raise exception 'input too long' using errcode = '22023'; end if;

  if v_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_company::text || ':' || v_key, 0));
    select * into v_ob from public.bookings b where b.company_id = v_company and b.idempotency_key = v_key;
    if found then
      select * into v_rb from public.bookings b where b.company_id = v_company and b.idempotency_key = v_key || ':return';
      if v_ob.customer_id not in (select app_private.my_customer_ids()) or v_ob.round_trip_group_id is null or v_rb.id is null
         or v_ob.trip_id <> p_outbound_trip_id or v_rb.trip_id <> p_return_trip_id or v_ob.seats_count <> p_seats
         or v_ob.pickup_stop_id  is distinct from p_pickup_stop_id  or v_ob.dropoff_stop_id is distinct from p_dropoff_stop_id
         or v_rb.pickup_stop_id  is distinct from p_return_pickup_stop_id or v_rb.dropoff_stop_id is distinct from p_return_dropoff_stop_id
         or v_ob.notes is distinct from v_notes then
        raise exception 'idempotency key reused with a different request' using errcode = '23505'; end if;
      return app_private.round_trip_result(v_ob.round_trip_group_id, true);
    end if;
  end if;

  -- both trips, always in id order: the same order any other two-trip operation uses, so no lock cycle
  perform 1 from public.trips t where t.id in (p_outbound_trip_id, p_return_trip_id) and t.company_id = v_company order by t.id for update;
  select * into v_out from public.trips t where t.id = p_outbound_trip_id and t.company_id = v_company;
  select * into v_ret from public.trips t where t.id = p_return_trip_id and t.company_id = v_company;
  if v_out.id is null or v_ret.id is null or not app_private.is_trip_public(v_out.id) or not app_private.is_trip_public(v_ret.id)
     or v_ret.outbound_trip_id is distinct from v_out.id or v_out.round_trip_price is null then
    raise exception 'trip not found' using errcode = 'P0002'; end if;

  select * into v_set from public.company_settings s where s.company_id = v_company;
  if p_seats > v_set.max_seats_per_booking then raise exception 'seats per booking exceeded' using errcode = '23514'; end if;
  if v_out.capacity - v_out.seats_booked < p_seats or v_ret.capacity - v_ret.seats_booked < p_seats then
    raise exception 'not enough seats available' using errcode = '23514',
      hint = format('available=%s', least(v_out.capacity - v_out.seats_booked, v_ret.capacity - v_ret.seats_booked)); end if;
  if p_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_pickup_stop_id and s.company_id = v_company
       and s.route_id = v_out.route_id and s.is_active and s.stop_type in ('pickup','both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_dropoff_stop_id and s.company_id = v_company
       and s.route_id = v_out.route_id and s.is_active and s.stop_type in ('dropoff','both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_return_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_return_pickup_stop_id and s.company_id = v_company
       and s.route_id = v_ret.route_id and s.is_active and s.stop_type in ('pickup','both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_return_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_return_dropoff_stop_id and s.company_id = v_company
       and s.route_id = v_ret.route_id and s.is_active and s.stop_type in ('dropoff','both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;

  -- customer: same rules as create_my_booking (P3)
  select c.id into v_cust from public.customers c where c.company_id = v_company and c.user_id = v_uid and c.deleted_at is null;
  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_company and c.phone = v_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505'; end if;
    insert into public.customers (company_id, user_id, full_name, phone, email, university, student_id)
    values (v_company, v_uid, v_name, v_phone, v_email, nullif(trim(coalesce(p_university, '')), ''), nullif(trim(coalesce(p_student_id, '')), ''))
    returning id into v_cust;
  end if;

  -- price split: proportional to the single-leg prices, remainder to the return leg (exact sum)
  v_out_share := case when v_out.price + v_ret.price = 0 then round(v_out.round_trip_price / 2, 2)
                      else round(v_out.round_trip_price * v_out.price / (v_out.price + v_ret.price), 2) end;
  v_ret_share := v_out.round_trip_price - v_out_share;

  loop
    v_attempt := v_attempt + 1;
    v_oref := app_private.new_booking_reference(); v_rref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                   currency, status, payment_status, source, idempotency_key, notes, created_by, round_trip_group_id, trip_leg)
      values (v_company, v_oref, v_out.id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, p_seats, v_out_share, v_out_share * p_seats,
              v_set.currency, 'confirmed', 'unpaid', 'web', v_key, v_notes, v_uid, v_group, 'outbound')
      returning id into v_oid;
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                   currency, status, payment_status, source, idempotency_key, notes, created_by, round_trip_group_id, trip_leg)
      values (v_company, v_rref, v_ret.id, v_cust, p_return_pickup_stop_id, p_return_dropoff_stop_id, p_seats, v_ret_share, v_ret_share * p_seats,
              v_set.currency, 'confirmed', 'unpaid', 'web', case when v_key is null then null else v_key || ':return' end, v_notes, v_uid, v_group, 'return')
      returning id into v_rid;
      exit;
    exception when unique_violation then
      if sqlerrm like '%bookings_idempotency_uq%' then raise exception 'idempotency key reused with a different request' using errcode = '23505'; end if;
      if v_attempt >= 8 then raise; end if;   -- reference collision: both inserts are rolled back with the sub-transaction, try again
    end;
  end loop;

  perform app_private.write_audit('customer', v_company, 'booking.created', 'booking', v_oid,
    jsonb_build_object('trip_id', v_out.id, 'seats', p_seats, 'reference', v_oref, 'source', 'web', 'round_trip_group', v_group, 'leg', 'outbound'));
  perform app_private.write_audit('customer', v_company, 'booking.created', 'booking', v_rid,
    jsonb_build_object('trip_id', v_ret.id, 'seats', p_seats, 'reference', v_rref, 'source', 'web', 'round_trip_group', v_group, 'leg', 'return'));
  return app_private.round_trip_result(v_group, false);
end $$;
revoke all on function app_private.create_my_round_trip_booking_impl(uuid, uuid, integer, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;

create function public.create_my_round_trip_booking(
  p_outbound_trip_id uuid, p_return_trip_id uuid, p_seats integer, p_full_name text, p_phone text,
  p_email text default null, p_university text default null, p_student_id text default null,
  p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null,
  p_return_pickup_stop_id uuid default null, p_return_dropoff_stop_id uuid default null,
  p_idempotency_key text default null, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('booking.create');
  return app_private.create_my_round_trip_booking_impl(p_outbound_trip_id, p_return_trip_id, p_seats, p_full_name, p_phone, p_email, p_university,
    p_student_id, p_pickup_stop_id, p_dropoff_stop_id, p_return_pickup_stop_id, p_return_dropoff_stop_id, p_idempotency_key, p_notes);
end $$;
revoke all on function public.create_my_round_trip_booking(uuid, uuid, integer, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.create_my_round_trip_booking(uuid, uuid, integer, text, text, text, text, text, uuid, uuid, uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- cancel: cancelling one leg of a round trip also cancels the other leg when that leg can still be cancelled.
-- The target leg follows the normal rules (window, state); the sibling is skipped, never forced, when it is not cancellable
-- (e.g. the outbound trip already ran, then cancelling the return only cancels the return).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.cancel_my_booking(p_booking_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_trips uuid[]; v_sib uuid; v_res jsonb;
begin
  perform app_private.rate_limit_hit('booking.cancel');
  select b.round_trip_group_id into v_group from public.bookings b
   where b.id = p_booking_id and b.customer_id in (select app_private.my_customer_ids());
  if v_group is not null then
    -- both trips, id order (same order as the round-trip booking), before the implementation locks trip -> booking
    select array_agg(distinct s.trip_id order by s.trip_id) into v_trips from public.bookings s where s.round_trip_group_id = v_group;
    perform 1 from public.trips t where t.id = any (v_trips) order by t.id for update;
  end if;
  v_res := app_private.cancel_my_booking_impl(p_booking_id, p_reason);
  if v_group is not null then
    select s.id into v_sib from public.bookings s
      join public.trips t on t.id = s.trip_id and t.company_id = s.company_id
      join public.company_settings cs on cs.company_id = s.company_id
     where s.round_trip_group_id = v_group and s.id <> p_booking_id and s.customer_id in (select app_private.my_customer_ids())
       and s.status in ('pending', 'confirmed') and t.status = 'scheduled'
       and t.departure_at - now() >= make_interval(hours => cs.cancellation_window_hours);
    if v_sib is not null then
      perform app_private.cancel_my_booking_impl(v_sib, p_reason);
      v_res := v_res || jsonb_build_object('also_cancelled', v_sib);
    end if;
  end if;
  return v_res;
end $$;
revoke all on function public.cancel_my_booking(uuid, text) from public, anon;
grant execute on function public.cancel_my_booking(uuid, text) to authenticated;
