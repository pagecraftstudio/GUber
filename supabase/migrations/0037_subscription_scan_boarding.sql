-- 0037: route subscriptions PHASE D. A subscription scan IS boarding.
--
-- DESIGN (replaces the "member_subscription_token" idea of the handoff plan)
--   A subscriber booking is a normal confirmed booking, so it already owns a ticket whose QR is rotated every time the member opens it
--   (my_ticket_qr, 0014/0020: hash only stored, 366-bit token, ticket.qr rate limit). Scanning that QR with the existing driver flow
--   (board_ticket) therefore needs NO second token system. What was missing was the link between the two:
--     1. board_ticket_impl: when the ticket's booking carries subscription_id it ALSO records the daily scan (one per direction per
--        company-local day, unique key from 0034) and refuses an inactive / out-of-validity subscription. All in ONE transaction:
--        if the scan cannot be recorded, the ticket is not boarded.
--     2. scan_route_subscription (MASAR ID, manual fallback for staff or the assigned driver): now boards the ticket too, under the
--        same boarding-window rule as the QR path, and is rate limited with the same 'ticket.board' bucket (a MASAR ID is 40 bits).
--   Authorization is unchanged: QR path = the assigned driver (driver_trip); MASAR path = bookings.write staff or the assigned driver.
-- ROLLBACK: restore board_ticket_impl from 0014 and scan_route_subscription from 0034, then
--           drop function app_private.subscriber_scan(public.trips, public.tickets), app_private.board_ticket_row(public.trips, public.tickets).
-- RUNNER NOTE: apply with scripts/db/apply-migrations.sh BEFORE deploying Phase D code. Requires 0034, 0014, 0020.
set search_path = public, extensions;

-- 1. one place that flips a ticket to boarded (the same steps board_ticket always did)
create function app_private.board_ticket_row(t public.trips, k public.tickets) returns public.tickets
language plpgsql security definer set search_path = '' as $$
begin
  update public.tickets set status = 'boarded', boarded_at = now(), boarded_by = auth.uid(), boarded_driver_id = t.driver_id where id = k.id
    returning * into k;
  insert into public.boarding_events (company_id, ticket_id, trip_id, driver_id, user_id) values (t.company_id, k.id, t.id, t.driver_id, auth.uid());
  if t.status = 'scheduled' then update public.trips set status = 'boarding' where id = t.id; end if;   -- first scan opens boarding
  perform app_private.write_audit('company_user', t.company_id, 'ticket.boarded', 'ticket', k.id,
    jsonb_build_object('trip_id', t.id, 'booking_id', k.booking_id, 'ticket_index', k.ticket_index));
  return k;
end $$;
revoke all on function app_private.board_ticket_row(public.trips, public.tickets) from public, anon, authenticated;

-- 2. the subscription side of a boarding: returns null for an ordinary booking
create function app_private.subscriber_scan(t public.trips, k public.tickets) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_b public.bookings%rowtype; v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_dir text; v_day date; v_scan uuid;
begin
  select * into v_b from public.bookings b where b.id = k.booking_id and b.company_id = k.company_id;
  if v_b.subscription_id is null then return null; end if;
  select * into v_s from public.route_subscriptions s where s.company_id = v_b.company_id and s.id = v_b.subscription_id;
  v_day := app_private.company_day(t.company_id, t.departure_at);
  if v_s.status <> 'active' or v_day < v_s.valid_from or v_day > v_s.valid_to then
    raise exception 'subscription is not valid' using errcode = '23514'; end if;
  select * into v_pl from public.route_plans pl where pl.company_id = v_s.company_id and pl.id = v_s.plan_id;
  v_dir := case when t.route_id = v_pl.route_id then 'go' else 'return' end;
  insert into public.route_subscription_scans (company_id, subscription_id, trip_id, booking_id, direction, service_date, scanned_by)
  values (t.company_id, v_s.id, t.id, v_b.id, v_dir, v_day, auth.uid())
  on conflict (subscription_id, service_date, direction) do nothing returning id into v_scan;
  if v_scan is null then raise exception 'already scanned for this direction today' using errcode = '23505'; end if;
  perform app_private.write_audit('company_user', t.company_id, 'route_subscription.scanned', 'route_subscription', v_s.id,
    jsonb_build_object('trip_id', t.id, 'direction', v_dir, 'booking_id', v_b.id));
  return jsonb_build_object('scan_id', v_scan, 'direction', v_dir, 'member_name', v_s.member_name, 'masar_id', v_s.masar_id,
    'subscription_id', v_s.id, 'service_date', v_day);
end $$;
revoke all on function app_private.subscriber_scan(public.trips, public.tickets) from public, anon, authenticated;

-- 3. QR boarding (driver). Same checks and order as 0014; subscriber part added after the boarding update.
create or replace function app_private.board_ticket_impl(p_trip_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t public.trips%rowtype; k public.tickets%rowtype; v_status text; v_sub jsonb;
  v_tok text := trim(coalesce(p_token, '')); v_prefix constant text := 'MALAKY:TICKET:';
begin
  t := app_private.driver_trip(p_trip_id, true);

  if t.status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'trip is closed for boarding' using errcode = '23514'; end if;
  if t.status = 'scheduled' and now() < t.departure_at - app_private.boarding_opens_before() then
    raise exception 'boarding has not opened yet' using errcode = '23514'; end if;

  if left(v_tok, length(v_prefix)) = v_prefix then v_tok := substr(v_tok, length(v_prefix) + 1); end if;
  if length(v_tok) < 20 or length(v_tok) > 200 or v_tok !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid ticket' using errcode = 'P0002'; end if;

  select * into k from public.tickets x where x.token_hash = app_private.ticket_token_hash(v_tok) for update;
  if not found or k.company_id <> t.company_id then raise exception 'invalid ticket' using errcode = 'P0002'; end if;
  if k.trip_id <> t.id then raise exception 'ticket is for another trip' using errcode = '23514'; end if;

  select b.status into v_status from public.bookings b where b.id = k.booking_id and b.company_id = k.company_id;
  if k.status = 'void' or v_status is distinct from 'confirmed' then
    raise exception 'ticket is cancelled' using errcode = '23514'; end if;

  if k.status = 'boarded' then
    return jsonb_build_object('result', 'already_boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at)
           || app_private.trip_boarding_stats(t.company_id, t.id);
  end if;

  k := app_private.board_ticket_row(t, k);
  v_sub := app_private.subscriber_scan(t, k);           -- raises (and rolls the boarding back) if the subscription is not valid or the day is used
  return jsonb_build_object('result', 'boarded', 'ticket_index', k.ticket_index, 'boarded_at', k.boarded_at)
         || case when v_sub is null then '{}'::jsonb else jsonb_build_object('subscriber', v_sub) end
         || app_private.trip_boarding_stats(t.company_id, t.id);
end $$;

-- 4. MASAR ID fallback: validates as before, then boards the ticket (it used to only write the scan row)
create or replace function public.scan_route_subscription(p_masar_id text, p_trip_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.trips%rowtype; v_s public.route_subscriptions%rowtype; v_bid uuid; k public.tickets%rowtype; v_day date; v_sub jsonb;
  v_id text := upper(trim(coalesce(p_masar_id, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('ticket.board');
  select * into t from public.trips x where x.id = p_trip_id for update;       -- trip row first, like board_ticket
  if not found or t.status = 'cancelled' or not (
       app_private.has_permission(t.company_id, 'bookings.write')
       or (app_private.has_permission(t.company_id, 'trips.read_assigned') and app_private.is_my_driver(t.company_id, t.driver_id))) then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'trip is closed for boarding' using errcode = '23514'; end if;
  if t.status = 'scheduled' and now() < t.departure_at - app_private.boarding_opens_before() then
    raise exception 'boarding has not opened yet' using errcode = '23514'; end if;
  v_day := app_private.company_day(t.company_id, t.departure_at);

  select s.* into v_s from public.route_subscriptions s
    join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
    join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
   where s.company_id = t.company_id and s.masar_id = v_id and s.status = 'active'
     and v_day between s.valid_from and s.valid_to
     and (pl.route_id = t.route_id or r.return_route_id = t.route_id)
   -- a member can hold several active plans of one company: prefer the one that owns a booking on THIS trip
   order by exists (select 1 from public.bookings b where b.company_id = t.company_id and b.subscription_id = s.id and b.trip_id = t.id
                       and b.status in ('pending', 'confirmed')) desc, s.valid_to desc, s.id limit 1;
  if not found then raise exception 'no valid subscription' using errcode = 'P0002'; end if;

  select b.id into v_bid from public.bookings b
   where b.company_id = t.company_id and b.subscription_id = v_s.id and b.trip_id = t.id and b.status in ('pending', 'confirmed') limit 1;
  if v_bid is null then raise exception 'no booking for this trip' using errcode = 'P0002'; end if;

  select * into k from public.tickets x where x.company_id = t.company_id and x.booking_id = v_bid order by x.ticket_index limit 1 for update;
  if not found or k.status = 'void' then raise exception 'ticket is cancelled' using errcode = '23514'; end if;
  if k.status = 'boarded' then raise exception 'already scanned for this direction today' using errcode = '23505'; end if;

  k := app_private.board_ticket_row(t, k);
  v_sub := app_private.subscriber_scan(t, k);
  return v_sub || jsonb_build_object('ticket_index', k.ticket_index) || app_private.trip_boarding_stats(t.company_id, t.id);
end $$;
