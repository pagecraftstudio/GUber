-- 0055: free trips for subscribers inside the normal booking flow (P4, plan section 3).
--
-- Rule (unchanged, now applied everywhere a trip can be booked): a student with an ACTIVE subscription of the SAME company rides free on any
-- scheduled trip of that company on the plan's route (go) or its paired return route, ONE seat per direction per company-local day.
-- Everything else is an ordinary paid booking.
--
--   app_private.trip_coverage(uid, trip)        which subscription of the caller covers a trip, which direction, and whether that day's free seat is still unused
--   public.my_trip_coverage(uuid[])             the same for up to 200 trips at once (marketplace labels "Free with your plan"); signed-in only
--   public.quote_my_booking(uuid, integer)      REPLACED: adds `subscription` and returns price 0 / no payment for a free seat
--   public.create_my_subscriber_trip_booking(uuid, uuid, uuid)   books ONE free leg (go or return) of a trip; the company comes from the trip, the member from auth.uid()
--
-- No table changes. Rollback: drop function public.create_my_subscriber_trip_booking(uuid, uuid, uuid); drop function public.my_trip_coverage(uuid[]);
-- drop function app_private.trip_coverage(uuid, uuid); then recreate quote_my_booking from 0054.
-- Runner note: apply BEFORE deploying the code that calls these functions.

create or replace function app_private.trip_coverage(p_uid uuid, p_trip_id uuid)
returns table (subscription_id uuid, plan_name text, leg text, available boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, pl.name,
         case when t.route_id = pl.route_id then 'go' else 'return' end,
         not exists (select 1 from public.bookings b join public.trips bt on bt.company_id = b.company_id and bt.id = b.trip_id
                      where b.company_id = s.company_id and b.subscription_id = s.id and b.status <> 'cancelled'
                        and bt.route_id = t.route_id and app_private.company_day(s.company_id, bt.departure_at) = app_private.company_day(s.company_id, t.departure_at))
    from public.trips t
    join public.route_subscriptions s on s.company_id = t.company_id and s.user_id = p_uid and s.status = 'active'
    join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
    join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
   where t.id = p_trip_id
     and (t.route_id = pl.route_id or t.route_id = r.return_route_id)
     and app_private.company_day(t.company_id, t.departure_at) between s.valid_from and s.valid_to
   order by s.valid_to desc, s.id
   limit 1
$$;
revoke all on function app_private.trip_coverage(uuid, uuid) from public, anon, authenticated;

create or replace function public.my_trip_coverage(p_trip_ids uuid[])
returns table (trip_id uuid, subscription_id uuid, plan_name text, leg text, available boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_trip_ids is null or cardinality(p_trip_ids) > 200 then raise exception 'too many trips' using errcode = '22023'; end if;
  return query
    select i.id, c.subscription_id, c.plan_name, c.leg, c.available
      from unnest(p_trip_ids) as i(id)
      cross join lateral app_private.trip_coverage(auth.uid(), i.id) c
     where app_private.is_trip_public(i.id);
end $$;
revoke all on function public.my_trip_coverage(uuid[]) from public, anon;
grant execute on function public.my_trip_coverage(uuid[]) to authenticated;

-- Quote: a free seat is price 0 with no payment step. Only for exactly 1 seat (friends' seats are separate paid bookings, decision D3).
create or replace function public.quote_my_booking(p_trip_id uuid, p_seats integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.trips%rowtype; s public.company_settings%rowtype; ps public.company_payment_settings%rowtype; v_total numeric;
        cov record; v_free boolean := false;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into t from public.trips x where x.id = p_trip_id;
  if not found or not app_private.is_trip_public(p_trip_id) then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if p_seats is null or p_seats < 1 then raise exception 'invalid seats' using errcode = '22023'; end if;
  select * into s from public.company_settings x where x.company_id = t.company_id;
  select * into ps from public.company_payment_settings x where x.company_id = t.company_id;
  select * into cov from app_private.trip_coverage(auth.uid(), p_trip_id);
  v_free := cov.subscription_id is not null and cov.available and p_seats = 1;
  v_total := case when v_free then 0 else t.price * p_seats end;
  return jsonb_build_object('unit_price', case when v_free then 0 else t.price end, 'total', v_total, 'currency', s.currency, 'seats', p_seats,
    'seats_available', t.capacity - t.seats_booked, 'max_seats', s.max_seats_per_booking,
    'requires_payment', coalesce(ps.require_prepayment, false) and v_total > 0,
    'deadline_hours', case when coalesce(ps.require_prepayment, false) and v_total > 0 then ps.payment_deadline_hours end,
    'subscription', case when cov.subscription_id is null then null
                         else jsonb_build_object('id', cov.subscription_id, 'plan_name', cov.plan_name, 'leg', cov.leg, 'free', v_free, 'day_limit_reached', not cov.available) end);
end $$;

create or replace function public.create_my_subscriber_trip_booking(p_trip_id uuid, p_pickup_stop_id uuid default null, p_dropoff_stop_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_cov record; v_s public.route_subscriptions%rowtype; v_t public.trips%rowtype; v_cust uuid;
  v_id uuid; v_ref text; v_attempt int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then raise exception 'account disabled' using errcode = '42501'; end if;
  select * into v_cov from app_private.trip_coverage(v_uid, p_trip_id);
  if v_cov.subscription_id is null then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  -- serialise this member's bookings for the day, then decide again on the locked state (a double click cannot book twice)
  select * into v_s from public.route_subscriptions s where s.id = v_cov.subscription_id and s.user_id = v_uid and s.status = 'active' for update;
  if not found then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  select * into v_cov from app_private.trip_coverage(v_uid, p_trip_id);
  if v_cov.subscription_id is null then raise exception 'no subscription covers this trip' using errcode = 'P0002'; end if;
  if not v_cov.available then raise exception 'already booked for this day' using errcode = '23505'; end if;
  select * into v_t from public.trips t where t.id = p_trip_id and t.company_id = v_s.company_id for update;
  if v_t.id is null or not app_private.is_trip_public(v_t.id) then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if v_t.capacity - v_t.seats_booked < 1 then raise exception 'not enough seats available' using errcode = '23514'; end if;
  if p_pickup_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_pickup_stop_id and s.company_id = v_s.company_id
       and s.route_id = v_t.route_id and s.is_active and s.stop_type in ('pickup', 'both')) then
    raise exception 'pickup stop does not belong to the trip route' using errcode = '23514'; end if;
  if p_dropoff_stop_id is not null and not exists (select 1 from public.route_stops s where s.id = p_dropoff_stop_id and s.company_id = v_s.company_id
       and s.route_id = v_t.route_id and s.is_active and s.stop_type in ('dropoff', 'both')) then
    raise exception 'dropoff stop does not belong to the trip route' using errcode = '23514'; end if;

  select c.id into v_cust from public.customers c where c.company_id = v_s.company_id and c.user_id = v_uid and c.deleted_at is null;
  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_s.company_id and c.phone = v_s.member_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505'; end if;
    insert into public.customers (company_id, user_id, full_name, phone) values (v_s.company_id, v_uid, v_s.member_name, v_s.member_phone) returning id into v_cust;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_ref := app_private.new_booking_reference();
    begin
      insert into public.bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, dropoff_stop_id, seats_count, unit_price, total_amount,
                                   currency, status, payment_status, source, created_by, subscription_id)
      values (v_s.company_id, v_ref, v_t.id, v_cust, p_pickup_stop_id, p_dropoff_stop_id, 1, 0, 0, v_s.currency, 'confirmed', 'paid', 'web', v_uid, v_s.id)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  perform app_private.write_audit('customer', v_s.company_id, 'booking.created', 'booking', v_id,
    jsonb_build_object('trip_id', v_t.id, 'seats', 1, 'reference', v_ref, 'source', 'web', 'subscription_id', v_s.id, 'leg', v_cov.leg));
  return jsonb_build_object('id', v_id, 'reference', v_ref, 'status', 'confirmed', 'seats_count', 1, 'total_amount', 0, 'currency', v_s.currency,
                            'payment_due_at', null, 'leg', v_cov.leg, 'plan_name', v_cov.plan_name);
end $$;
revoke all on function public.create_my_subscriber_trip_booking(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_my_subscriber_trip_booking(uuid, uuid, uuid) to authenticated;
