-- 0036: route subscriptions PHASE C support (member side, read functions only; no tables, no policy changes).
--
-- WHY RPCs: a member may read their own route_subscriptions rows (policy own_select) but NOT route_plans or routes (no company role),
-- so names, trips and per-day state must come from narrow SECURITY DEFINER functions. Every function derives the member from
-- auth.uid() and the company from the subscription row; nothing trusts a client id. All return only the caller's own data.
--   my_route_subscriptions()                      own subscriptions with plan / route / company names
--   subscriber_outbound_options(sub, day)         bookable go trips of the plan route on a company-local day (seats left)
--   subscriber_day_state(sub, day)                whether the go / return seat of that day is already booked
--   subscriber_bookings(sub)                      own non-cancelled subscriber bookings (recent + upcoming), with scanned flag
-- ROLLBACK: drop function public.my_route_subscriptions(), public.subscriber_outbound_options(uuid, date),
--           public.subscriber_day_state(uuid, date), public.subscriber_bookings(uuid).
-- RUNNER NOTE: apply with scripts/db/apply-migrations.sh BEFORE deploying the Phase C code. Requires 0034.
set search_path = public, extensions;

create function public.my_route_subscriptions()
returns table (id uuid, company_id uuid, company_name text, plan_id uuid, plan_name text, route_id uuid, origin_name text, destination_name text,
               status text, price numeric, currency char(3), valid_from date, valid_to date, requested_at timestamptz, masar_id text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.company_id, c.name, s.plan_id, pl.name, pl.route_id, r.origin_name, r.destination_name,
         case when s.status = 'active' and s.valid_to < app_private.company_day(s.company_id, now()) then 'expired' else s.status end,
         s.price, s.currency, s.valid_from, s.valid_to, s.requested_at, s.masar_id
  from public.route_subscriptions s
  join public.companies c on c.id = s.company_id
  join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
  join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
  where s.user_id = auth.uid()
  order by s.requested_at desc, s.id
  limit 100
$$;

create function public.subscriber_outbound_options(p_subscription_id uuid, p_day date)
returns table (trip_id uuid, route_id uuid, departure_at timestamptz, arrival_at timestamptz, seats_available integer, origin_name text, destination_name text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.route_id, t.departure_at, t.arrival_at, (t.capacity - t.seats_booked)::integer, r.origin_name, r.destination_name
  from public.route_subscriptions s
  join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
  join public.trips t on t.company_id = s.company_id and t.route_id = pl.route_id
  join public.routes r on r.company_id = t.company_id and r.id = t.route_id
  where s.id = p_subscription_id and s.user_id = auth.uid() and s.status = 'active'
    and p_day between s.valid_from and s.valid_to
    and app_private.company_day(s.company_id, t.departure_at) = p_day
    and app_private.is_trip_public(t.id) and t.capacity - t.seats_booked >= 1
  order by t.departure_at, t.id
  limit 50
$$;

create function public.subscriber_day_state(p_subscription_id uuid, p_day date)
returns table (go_booked boolean, return_booked boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(t.route_id = pl.route_id), false), coalesce(bool_or(t.route_id = r.return_route_id), false)
  from public.route_subscriptions s
  join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
  join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
  left join public.bookings b on b.company_id = s.company_id and b.subscription_id = s.id and b.status <> 'cancelled'
  left join public.trips t on t.company_id = b.company_id and t.id = b.trip_id and app_private.company_day(s.company_id, t.departure_at) = p_day
  where s.id = p_subscription_id and s.user_id = auth.uid()
  group by s.id
$$;

create function public.subscriber_bookings(p_subscription_id uuid)
returns table (booking_id uuid, reference text, trip_id uuid, trip_leg text, direction text, departure_at timestamptz, arrival_at timestamptz,
               origin_name text, destination_name text, status text, scanned boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.reference, t.id, b.trip_leg, case when t.route_id = pl.route_id then 'go' else 'return' end,
         t.departure_at, t.arrival_at, r.origin_name, r.destination_name, b.status,
         exists (select 1 from public.route_subscription_scans x where x.company_id = b.company_id and x.booking_id = b.id)
  from public.route_subscriptions s
  join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
  join public.bookings b on b.company_id = s.company_id and b.subscription_id = s.id and b.status <> 'cancelled'
  join public.trips t on t.company_id = b.company_id and t.id = b.trip_id
  join public.routes r on r.company_id = t.company_id and r.id = t.route_id
  where s.id = p_subscription_id and s.user_id = auth.uid() and t.departure_at >= now() - interval '1 day'
  order by t.departure_at, b.id
  limit 60
$$;

revoke all on function public.my_route_subscriptions() from public, anon;
revoke all on function public.subscriber_outbound_options(uuid, date) from public, anon;
revoke all on function public.subscriber_day_state(uuid, date) from public, anon;
revoke all on function public.subscriber_bookings(uuid) from public, anon;
grant execute on function public.my_route_subscriptions() to authenticated;
grant execute on function public.subscriber_outbound_options(uuid, date) to authenticated;
grant execute on function public.subscriber_day_state(uuid, date) to authenticated;
grant execute on function public.subscriber_bookings(uuid) to authenticated;
