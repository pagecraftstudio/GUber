-- 35: route subscriptions PHASE E2 (migration 0039): company reports. Requires 30 (route Sub-Go + return, members 3001/3002), 33 (driver 3341, bus 3331).
-- Users: 2 ownerA (analytics.read), 5 bookingA (no analytics.read), 7 ownerB, 91 driver A. Company A = t.u(101), company B = t.u(102).
select t.as_admin();
delete from app_private.rate_limit_counters;   -- earlier suites used up the per-user booking budget
create or replace function t.plan35() returns uuid language sql security definer as $$ select id from public.route_plans where name = 'Report Range' $$;
create or replace function t.sub35(p_user int) returns uuid language sql security definer as $$ select id from public.route_subscriptions where plan_id = t.plan35() and user_id = t.u(p_user) $$;
create or replace function t.bk35(p_user int, p_trip uuid) returns uuid language sql security definer as $$ select id from public.bookings where subscription_id = t.sub35(p_user) and trip_id = p_trip $$;
create temp table base35 (kind text primary key, v jsonb);
grant select, insert on base35 to public;

select t.as_user(t.u(2));
select public.create_route_plan(t.sroute33('Sub-Go'), 'Report Range', 350, 'range', null, current_date - 1, current_date + 150);
select t.as_user(t.u(3001)); select public.request_route_subscription(t.plan35());
select t.as_user(t.u(3002)); select public.request_route_subscription(t.plan35());
select t.as_user(t.u(5)); select public.decide_route_subscription(t.sub35(3001), true); select public.decide_route_subscription(t.sub35(3002), true);

-- baseline of "yesterday" (company local) before anything is moved there
select t.as_user(t.u(2));
insert into base35 select 'day', to_jsonb(r) from public.subscription_daily_report(t.u(101), current_date - 1, current_date - 1) r;

select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3701), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '110 day 6 hours',  date_trunc('day', now()) + interval '110 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3702), t.u(101), t.sroute33('Sub-Go (return)'), t.u(3331), t.u(3341), date_trunc('day', now()) + interval '110 day 12 hours', date_trunc('day', now()) + interval '110 day 13 hours', 50, 5, 'scheduled'),
  (t.u(3703), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '111 day 6 hours',  date_trunc('day', now()) + interval '111 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3704), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '3 day 6 hours',    date_trunc('day', now()) + interval '3 day 7 hours',    50, 5, 'scheduled'),
  (t.u(3705), t.u(101), t.sroute33('Sub-Go (return)'), t.u(3331), t.u(3341), date_trunc('day', now()) + interval '3 day 12 hours',   date_trunc('day', now()) + interval '3 day 13 hours',   50, 5, 'scheduled');
select t.as_user(t.u(3001));
select public.create_my_subscriber_booking(t.sub35(3001), t.u(3701), t.u(3702));
select public.create_my_subscriber_booking(t.sub35(3001), t.u(3704), t.u(3705));
select t.as_user(t.u(3002));
select public.create_my_subscriber_booking(t.sub35(3002), t.u(3703));
select t.as_admin();
-- move the three far trips to yesterday (the trips already departed): 3701 go + 3702 return not boarded, 3703 go boarded + scanned
update trips set departure_at = date_trunc('day', now()) - interval '1 day' + interval '6 hours',  arrival_at = date_trunc('day', now()) - interval '1 day' + interval '7 hours'  where id = t.u(3701);
update trips set departure_at = date_trunc('day', now()) - interval '1 day' + interval '12 hours', arrival_at = date_trunc('day', now()) - interval '1 day' + interval '13 hours' where id = t.u(3702);
update trips set departure_at = date_trunc('day', now()) - interval '1 day' + interval '8 hours',  arrival_at = date_trunc('day', now()) - interval '1 day' + interval '9 hours'  where id = t.u(3703);
update tickets set status = 'boarded', boarded_at = now(), boarded_by = t.u(2), boarded_driver_id = t.u(3341) where booking_id = t.bk35(3002, t.u(3703));
insert into route_subscription_scans (company_id, subscription_id, trip_id, booking_id, direction, service_date, scanned_by)
  values (t.u(101), t.sub35(3002), t.u(3703), t.bk35(3002, t.u(3703)), 'go', app_private.company_day(t.u(101), (select departure_at from trips where id = t.u(3703))), t.u(2));

-- who may read
select t.as_user(t.u(5));
select t.eq('guard: booking staff (no analytics.read) get nothing', t.err_of(format($$select * from public.subscription_plan_report(%L, current_date - 7, current_date)$$, t.u(101))), 'P0002|company not found');
select t.as_user(t.u(7));
select t.eq('guard: another company owner cannot read company A', t.err_of(format($$select * from public.subscription_daily_report(%L, current_date - 7, current_date)$$, t.u(101))), 'P0002|company not found');
select t.eq('guard: ... nor its trip demand', t.err_of(format($$select * from public.subscription_trip_demand(%L, 7)$$, t.u(101))), 'P0002|company not found');
select t.eq('guard: an unknown company looks the same', t.err_of(format($$select * from public.subscription_plan_report(%L, current_date - 7, current_date)$$, t.u(99999))), 'P0002|company not found');
select t.eq('guard: a null company is refused', t.err_of($$select * from public.subscription_plan_report(null, current_date - 7, current_date)$$), 'P0002|company not found');
select t.as_user(t.u(3001));
select t.eq('guard: a member cannot read company reports', t.err_of(format($$select * from public.subscription_plan_report(%L, current_date - 7, current_date)$$, t.u(101))), 'P0002|company not found');
select t.as_anon();
select t.eq('guard: anonymous is refused', left(t.err_of(format($$select * from public.subscription_plan_report(%L, current_date - 7, current_date)$$, t.u(101))), 5), '42501');
select t.as_user(t.u(2));
select t.eq('range: to before from', t.err_of(format($$select * from public.subscription_daily_report(%L, current_date, current_date - 1)$$, t.u(101))), '22023|invalid range');
select t.eq('range: more than 366 days', t.err_of(format($$select * from public.subscription_daily_report(%L, current_date - 400, current_date)$$, t.u(101))), '22023|invalid range');
select t.eq('range: demand days 0 / 32 refused', t.err_of(format($$select * from public.subscription_trip_demand(%L, 0)$$, t.u(101))) || '/' || t.err_of(format($$select * from public.subscription_trip_demand(%L, 32)$$, t.u(101))), '22023|invalid range/22023|invalid range');

-- plan report (the owner of company A)
select t.eq('plan: the plan shows 2 active members and 2 new approvals', (select active_now || ',' || new_in_range || ',' || pending_now from public.subscription_plan_report(t.u(101), current_date, current_date) where plan_name = 'Report Range'), '2,2,0');
select t.eq('plan: revenue is the sum of the approved prices', (select revenue_in_range from public.subscription_plan_report(t.u(101), current_date, current_date) where plan_name = 'Report Range'), 700::numeric);
select t.eq('plan: a range that does not contain today has no new approvals or revenue', (select new_in_range || ',' || revenue_in_range from public.subscription_plan_report(t.u(101), current_date - 30, current_date - 20) where plan_name = 'Report Range'), '0,0');
select t.eq('plan: currency comes from the company settings', (select currency from public.subscription_plan_report(t.u(101), current_date, current_date) where plan_name = 'Report Range'), (select currency::text from company_settings where company_id = t.u(101)));

-- daily report for yesterday: deltas against the baseline taken before the fixtures moved there
select t.eq('daily: yesterday go scans +1', (select go_scans from public.subscription_daily_report(t.u(101), current_date - 1, current_date - 1)) - (select (v->>'go_scans')::int from base35 where kind = 'day'), 1);
select t.eq('daily: yesterday booked go +2 and return +1', (select (go_booked - (select (v->>'go_booked')::int from base35 where kind = 'day')) || ',' || (return_booked - (select (v->>'return_booked')::int from base35 where kind = 'day')) from public.subscription_daily_report(t.u(101), current_date - 1, current_date - 1)), '2,1');
select t.eq('daily: no-shows +2 (the boarded booking is not one)', (select no_shows from public.subscription_daily_report(t.u(101), current_date - 1, current_date - 1)) - (select (v->>'no_shows')::int from base35 where kind = 'day'), 2);
select t.eq('daily: one row per day, in order', (select count(*) from public.subscription_daily_report(t.u(101), current_date - 3, current_date)), 4::bigint);
select t.eq('daily: future days carry no no-shows', (select max(no_shows) from public.subscription_daily_report(t.u(101), current_date + 1, current_date + 5)), 0);

-- trip demand
select t.eq('demand: the go trip carries the subscriber seat and the return intent', (select subscriber_seats || ',' || return_intent from public.subscription_trip_demand(t.u(101), 7) where trip_id = t.u(3704)), '1,1');
select t.eq('demand: the return trip carries the seat but no intent', (select subscriber_seats || ',' || return_intent from public.subscription_trip_demand(t.u(101), 7) where trip_id = t.u(3705)), '1,0');
select t.eq('demand: seats available reflect the booked seat', (select seats_available from public.subscription_trip_demand(t.u(101), 7) where trip_id = t.u(3704)), 4);
select t.eq('demand: a trip beyond the window is not listed', (select count(*) from public.subscription_trip_demand(t.u(101), 1) where trip_id = t.u(3704)), 0::bigint);
select t.eq('demand: past trips are not listed', (select count(*) from public.subscription_trip_demand(t.u(101), 31) where trip_id = t.u(3701)), 0::bigint);

-- isolation: company B owner sees nothing of A in his own reports
select t.as_user(t.u(7));
select t.eq('isolation: company B plan report has no company A plan', (select count(*) from public.subscription_plan_report(t.u(102), current_date - 7, current_date) where plan_name = 'Report Range'), 0::bigint);
select t.eq('isolation: company B demand lists none of A trips', (select count(*) from public.subscription_trip_demand(t.u(102), 31) where trip_id = t.u(3704)), 0::bigint);
select t.as_admin();

-- platform usage: staff only, counts only
select t.as_user(t.u(9));
select t.passes('platform usage: support staff can read', format('select * from public.platform_subscription_usage(%L)', t.u(101)));
select t.eq('platform usage: active count matches the subscriptions table', (select active from public.platform_subscription_usage(t.u(101))), (select count(*)::integer from public.route_subscriptions where company_id = t.u(101) and status = 'active'));
select t.as_user(t.u(2));
select t.eq('platform usage: a company owner is refused', t.err_of(format('select * from public.platform_subscription_usage(%L)', t.u(101))), 'P0002|company not found');
select t.as_anon();
select t.eq('platform usage: anon is refused', t.err_of(format('select * from public.platform_subscription_usage(%L)', t.u(101))), '42501|permission denied for function platform_subscription_usage');
select t.as_admin();

-- member time zones (0040): own subscriptions only, company zone
select t.as_user(t.u(3001));
select t.eq('timezones: a member gets a zone for each own subscription', (select count(*) from public.my_subscription_timezones()), (select count(*) from public.route_subscriptions where user_id = t.u(3001)));
select t.eq('timezones: zone is the company setting', (select count(distinct timezone) from public.my_subscription_timezones()), 1::bigint);
select t.as_user(t.u(3002));
select t.eq('timezones: another member sees none of the first member subscriptions', (select count(*) from public.my_subscription_timezones() z where z.subscription_id in (select id from public.route_subscriptions where user_id = t.u(3001))), 0::bigint);
select t.as_anon();
select t.eq('timezones: anon is refused', t.err_of('select * from public.my_subscription_timezones()'), '42501|permission denied for function my_subscription_timezones');
select t.as_admin();
