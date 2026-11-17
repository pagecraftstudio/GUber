-- 31: route subscriptions Phase B support (migration 0035). Requires 01 fixtures and 30 (plans, subscriptions, subscriber bookings exist).
-- Users: 2 ownerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB (starter); members 3001, 3002.
select t.as_admin();
create or replace function t.n_plans(p_company uuid) returns bigint language sql security definer as $$ select count(*) from public.route_plans where company_id = p_company and deleted_at is null $$;
create or replace function t.n_sub_bookings() returns bigint language sql security definer as $$ select count(*) from public.bookings where subscription_id is not null $$;
create or replace function t.n_sub_rows(p_company uuid) returns bigint language sql security definer as $$ select count(*) from public.route_subscriptions where company_id = p_company $$;

-- ============ my_plan_usage counts plans ============
select t.as_user(t.u(2));
select t.eq('usage: plan limit and used are reported (professional: 20)', (select (public.my_plan_usage(t.u(101))->'limits'->'max_route_plans'->>'limit')::int), 20);
select t.eq('usage: used equals the live plans of the company', (select (public.my_plan_usage(t.u(101))->'limits'->'max_route_plans'->>'used')::bigint), t.n_plans(t.u(101)));
select t.as_admin();
update plan_entitlements set int_value = 3 where key = 'max_route_plans' and plan_id in (select plan_id from subscriptions where company_id = t.u(102));   -- earlier suites loosen limits for their own needs
select t.as_user(t.u(7));
select t.eq('usage: starter company sees its own limit (3) and own count', (select (public.my_plan_usage(t.u(102))->'limits'->'max_route_plans'->>'limit')::int * 100 + (public.my_plan_usage(t.u(102))->'limits'->'max_route_plans'->>'used')::int), 301);
select t.eq('usage: company B cannot read company A numbers', t.err_of(format($$select public.my_plan_usage(%L)$$, t.u(101))), 'P0002|company not found');
select t.as_user(t.u(2));
select public.create_route_plan((select id from public.routes where name = 'Sub-Go' limit 1), 'Usage probe', 10, 'duration', 1);
select t.eq('usage: a new plan raises used by one', (select (public.my_plan_usage(t.u(101))->'limits'->'max_route_plans'->>'used')::bigint), t.n_plans(t.u(101)));
select public.archive_route_plan((select id from public.route_plans where name = 'Usage probe'));
select t.eq('usage: an archived plan stops counting', (select (public.my_plan_usage(t.u(101))->'limits'->'max_route_plans'->>'used')::bigint), t.n_plans(t.u(101)));
select t.eq('usage: other limits are still reported', (select (public.my_plan_usage(t.u(101))->'limits') ? 'max_routes' and (public.my_plan_usage(t.u(101))->'limits'->'max_trips_per_month'->>'used') is not null), true);

-- ============ booking_list.is_subscriber ============
select t.as_user(t.u(5));
select t.eq('booking list: subscriber bookings are flagged', (select count(*) from public.booking_list where is_subscriber), t.n_sub_bookings());
select t.eq('booking list: ordinary bookings are not flagged', (select count(*) from public.booking_list where not is_subscriber and id in (select id from public.bookings where subscription_id is not null)), 0::bigint);
select t.eq('booking list: there are ordinary bookings too (flag is not always true)', (select count(*) from public.booking_list where not is_subscriber) > 0, true);
select t.as_user(t.u(7));
select t.eq('booking list: company B sees no company A subscriber booking', (select count(*) from public.booking_list where is_subscriber), 0::bigint);

-- ============ route_subscription_list ============
select t.as_user(t.u(5));
select t.eq('inbox: booking staff see every request of their company', (select count(*) from public.route_subscription_list), t.n_sub_rows(t.u(101)));
select t.eq('inbox: plan and route names resolve for booking staff', (select count(*) from public.route_subscription_list where plan_name is null or route_name is null), 0::bigint);
select t.eq('inbox: rows carry the MASAR ID snapshot', (select count(*) from public.route_subscription_list where masar_id !~ '^MSR-'), 0::bigint);
select t.as_user(t.u(6));
select t.eq('inbox: a driver (no bookings.read) sees nothing', (select count(*) from public.route_subscription_list), 0::bigint);
select t.as_user(t.u(7));
select t.eq('inbox: company B staff see none of company A', (select count(*) from public.route_subscription_list where company_id = t.u(101)), 0::bigint);
select t.as_user(t.u(3002));
select t.eq('inbox: a member sees only their own rows (here: own renewal if any)', (select count(*) from public.route_subscription_list where masar_id <> t.masar(t.u(3002))), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('inbox: a member never sees plan names through the staff view (no routes.read)', (select count(*) from public.route_subscription_list where plan_name is not null), 0::bigint);
select t.eq('inbox: ... but sees their own rows', (select count(*) > 0 from public.route_subscription_list), true);
select t.as_anon();
select t.eq('inbox: anonymous cannot read the view', left(t.err_of($$select count(*) from public.route_subscription_list$$), 5), '42501');
select t.as_admin();
