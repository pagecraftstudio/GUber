-- 36: route subscriptions PHASE E3 (migration 0041): renewal before expiry, expiry notices, staff expiring list.
-- Requires 30 (route Sub-Go, members 3001/3002 with phones), 33 (driver 3341, bus 3331). Users: 2 ownerA, 5 bookingA, 7 ownerB, 91 driver A.
select t.as_admin();
delete from app_private.rate_limit_counters;
create or replace function t.plan36(p_name text) returns uuid language sql security definer as $$ select id from public.route_plans where name = p_name $$;
create or replace function t.sub36(p_user int, p_plan text, p_n int) returns uuid language sql security definer as $$
  select id from (select id, row_number() over (order by requested_at, id) n from public.route_subscriptions where plan_id = t.plan36(p_plan) and user_id = t.u(p_user)) x where n = p_n $$;
create or replace function t.n36(p_sql text) returns bigint language plpgsql security definer as $$ declare r bigint; begin execute p_sql into r; return r; end $$;

select t.as_user(t.u(2));
select public.create_route_plan(t.sroute33('Sub-Go'), 'Renew Duration', 300, 'duration', 1);
select public.create_route_plan(t.sroute33('Sub-Go'), 'Renew Range', 200, 'range', null, current_date - 1, current_date + 120);
select t.as_user(t.u(3001)); select public.request_route_subscription(t.plan36('Renew Duration'));
select t.as_user(t.u(3002)); select public.request_route_subscription(t.plan36('Renew Range'));
select t.as_user(t.u(5));
select public.decide_route_subscription(t.sub36(3001, 'Renew Duration', 1), true);
select public.decide_route_subscription(t.sub36(3002, 'Renew Range', 1), true);

-- 1. renewal is closed while the subscription has plenty of time, and never for a fixed-window plan
select t.as_user(t.u(3001));
select t.eq('renew: too early is refused', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan36('Renew Duration'))), '23514|renewal opens 7 days before your subscription ends');
select t.as_user(t.u(3002));
select t.eq('renew: a fixed-window plan cannot be renewed while active', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan36('Renew Range'))), '23505|you already have an active subscription for this plan');

-- the subscription now ends in 5 days
select t.as_admin();
update public.route_subscriptions set valid_from = current_date - 25, valid_to = current_date + 5 where id = t.sub36(3001, 'Renew Duration', 1);

-- 2. staff expiring list
select t.as_user(t.u(5));
select t.eq('expiring: staff see the subscription ending in 5 days', (select days_left from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3001, 'Renew Duration', 1)), 5);
select t.eq('expiring: not renewed yet', (select renewal_pending from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3001, 'Renew Duration', 1)), false);
select t.eq('expiring: carries phone and language for the message', (select member_locale || ':' || (member_phone is not null)::text from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3001, 'Renew Duration', 1)), 'ar:true');
select t.eq('expiring: the fixed-window plan ending in 120 days is not listed', (select count(*) from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3002, 'Renew Range', 1)), 0::bigint);
select t.eq('expiring: a 1-day window excludes it', (select count(*) from public.subscriptions_expiring(t.u(101), 1) where id = t.sub36(3001, 'Renew Duration', 1)), 0::bigint);
select t.eq('expiring: bad range', t.err_of(format($$select * from public.subscriptions_expiring(%L, 0)$$, t.u(101))), '22023|invalid range');
select t.as_user(t.u(7));
select t.eq('expiring: company B staff are refused', t.err_of(format($$select * from public.subscriptions_expiring(%L)$$, t.u(101))), 'P0002|company not found');
select t.as_user(t.u(3001));
select t.eq('expiring: a member is refused', t.err_of(format($$select * from public.subscriptions_expiring(%L)$$, t.u(101))), 'P0002|company not found');
select t.as_user(t.u(91));
select t.eq('expiring: a driver is refused', t.err_of(format($$select * from public.subscriptions_expiring(%L)$$, t.u(101))), 'P0002|company not found');
select t.as_anon();
select t.eq('expiring: anonymous is refused', left(t.err_of(format($$select * from public.subscriptions_expiring(%L)$$, t.u(101))), 5), '42501');

select t.as_user(t.u(3001));
select t.eq('renewable: the subscription ending in 5 days can be renewed', (select count(*) from public.my_renewable_subscriptions() where subscription_id = t.sub36(3001, 'Renew Duration', 1)), 1::bigint);
select t.as_user(t.u(3002));
select t.eq('renewable: a fixed-window plan never is', (select count(*) from public.my_renewable_subscriptions()), 0::bigint);
select t.as_anon();
select t.eq('renewable: anonymous is refused', left(t.err_of('select * from public.my_renewable_subscriptions()'), 5), '42501');

-- 3. the nightly notice: once per subscription, in the member's language, readable only by the member
select t.as_admin();
select t.eq('notice: the job writes at least this notice', (select app_private.notify_expiring_subscriptions() >= 1), true);
select t.eq('notice: a second run adds nothing for it', t.n36(format($$select count(*) from public.notifications where related_entity_id = %L$$, t.sub36(3001, 'Renew Duration', 1))), 1::bigint);
select t.eq('notice: second run creates none', (select app_private.notify_expiring_subscriptions()), 0);
select t.as_user(t.u(3001));
select t.eq('notice: the member sees it, unread, in Arabic', (select count(*) from public.my_notices() where subject = 'ينتهي اشتراكك قريباً' and not is_read), 1::bigint);
select t.eq('notice: names the plan', (select count(*) from public.my_notices() where body like '%Renew Duration%'), 1::bigint);
select t.as_user(t.u(3002));
select t.eq('notice: another member does not see it', (select count(*) from public.my_notices() where body like '%Renew Duration%'), 0::bigint);
select t.eq('notice: another member cannot mark it read', public.mark_my_notices_read(array(select id from public.my_notices())), 0);
select t.as_user(t.u(3001));
select t.eq('notice: mark read counts one', public.mark_my_notices_read(), 1);
select t.eq('notice: now read', (select count(*) from public.my_notices() where not is_read), 0::bigint);
select t.as_anon();
select t.eq('notice: anonymous is refused', left(t.err_of('select * from public.my_notices()'), 5), '42501');

-- 4. renewal request inside the window; one pending at a time
select t.as_user(t.u(3001));
select public.request_route_subscription(t.plan36('Renew Duration'));
select t.eq('renew: a second request while one is pending is refused', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan36('Renew Duration'))), '23505|you already have an open request or active subscription for this plan');
select t.eq('renewable: not while the renewal is pending', (select count(*) from public.my_renewable_subscriptions()), 0::bigint);
select t.as_user(t.u(5));
select t.eq('expiring: shows the renewal as pending', (select renewal_pending from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3001, 'Renew Duration', 1)), true);

-- 5. approval starts the new period the day after the old one ends
select public.decide_route_subscription(t.sub36(3001, 'Renew Duration', 2), true);
select t.as_admin();
select t.eq('renew: new period starts the day after the old one ends', (select valid_from from public.route_subscriptions where id = t.sub36(3001, 'Renew Duration', 2)), (current_date + 6));
select t.eq('renew: and lasts the plan duration', (select valid_to from public.route_subscriptions where id = t.sub36(3001, 'Renew Duration', 2)), ((current_date + 6) + interval '1 month')::date - 1);
select t.eq('renew: both periods are active and do not overlap', (select count(*) from public.route_subscriptions a join public.route_subscriptions b on a.user_id = b.user_id and a.plan_id = b.plan_id and a.id < b.id where a.plan_id = t.plan36('Renew Duration') and a.status = 'active' and b.status = 'active' and daterange(a.valid_from, a.valid_to, '[]') && daterange(b.valid_from, b.valid_to, '[]')), 0::bigint);
select t.as_user(t.u(5));
select t.eq('expiring: a renewed subscription leaves the list', (select count(*) from public.subscriptions_expiring(t.u(101)) where id = t.sub36(3001, 'Renew Duration', 1)), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('renew: no second early renewal on top', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan36('Renew Duration'))), '23514|renewal opens 7 days before your subscription ends');
select t.as_admin();
select t.eq('notice: no new notice for the renewed subscription', (select app_private.notify_expiring_subscriptions()), 0);

-- 6. the renewal period is bookable, the old one is not, on a day after the old one ended
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3661), t.u(101), t.sroute33('Sub-Go'), t.u(3331), t.u(3341), date_trunc('day', now()) + interval '20 day 6 hours', date_trunc('day', now()) + interval '20 day 7 hours', 50, 5, 'scheduled');
select t.as_user(t.u(3001));
select t.eq('book: the old period is not valid on a day after it ended', left(t.err_of(format($$select public.create_my_subscriber_booking(%L, %L)$$, t.sub36(3001, 'Renew Duration', 1), t.u(3661))), 8), '23514|su');
select t.eq('book: the renewal period is', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L)$$, t.sub36(3001, 'Renew Duration', 2), t.u(3661))), 'NO ERROR');
select t.as_admin();
