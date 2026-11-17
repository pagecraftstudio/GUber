-- 30: route subscriptions Phase A (migration 0034). Requires 01 fixtures, 05 (t.err_of, t.seats), 08 (website A published), 29 (create_route_pair).
-- Users: 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB. Members: 3001, 3002 (company-less users).
select t.as_admin();
insert into auth.users (id, email) values (t.u(3001), 'sub1@test.dev'), (t.u(3002), 'sub2@test.dev'), (t.u(3003), 'sub3@test.dev') on conflict do nothing;
update public.profiles set phone = '+201000030001', full_name = 'Sub One' where id = t.u(3001);
update public.profiles set phone = '+201000030002', full_name = 'Sub Two' where id = t.u(3002);   -- 3003 keeps no phone
update public.plan_entitlements e set int_value = null where e.plan_id in (select plan_id from public.subscriptions where company_id = t.u(101))
  and e.key in ('max_trips_per_month', 'max_buses', 'max_drivers', 'max_routes', 'max_bookings_per_month');
create or replace function t.sub_route(p text) returns uuid language sql security definer as $$ select id from public.routes where name = p order by created_at desc limit 1 $$;
create or replace function t.sub_status(p uuid) returns text language sql security definer as $$ select status from public.route_subscriptions where id = p $$;
create or replace function t.plan_id(p text) returns uuid language sql security definer as $$ select id from public.route_plans where name = p limit 1 $$;
create or replace function t.masar(p uuid) returns text language sql security definer as $$ select masar_id from public.profiles where id = p $$;
create or replace function t.nscans() returns bigint language sql security definer as $$ select count(*) from public.route_subscription_scans $$;

-- ============ MASAR ID ============
select t.eq('masar id: assigned at signup, right format', (select masar_id ~ '^MSR-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$' from profiles where id = t.u(3001)), true);
select t.eq('masar id: unique across profiles', (select count(distinct masar_id) = count(*) from profiles), true);
select t.eq('masar id: immutable', left(t.err_of(format($$update profiles set masar_id = 'MSR-AAAA-BBBB' where id = %L$$, t.u(3001))), 5), '42501');
select t.as_user(t.u(3001));
select t.eq('masar id: a member cannot edit it (no column grant)', left(t.err_of(format($$update profiles set masar_id = 'MSR-AAAA-BBBB' where id = %L$$, t.u(3001))), 5), '42501');
select t.eq('masar id: a member sees their own', (select count(*) from profiles where id = t.u(3001) and masar_id is not null), 1::bigint);
select t.as_admin();

-- ============ plans ============
select t.as_user(t.u(2));
select public.create_route_pair('Sub-Go', 'SG', 'Cairo', 'Galala', null,
  '[{"name":"SG1","offsetMinutes":0,"stopType":"pickup"},{"name":"SG2","offsetMinutes":60,"stopType":"dropoff"}]'::jsonb, '{"sameAsReverse":true}'::jsonb);
select t.as_admin();
select t.as_user(t.u(2));
select public.create_route_plan(t.sub_route('Sub-Go'), 'Monthly', 900, 'duration', 1);
select public.create_route_plan(t.sub_route('Sub-Go'), 'Term', 2500, 'range', null, current_date - 1, current_date + 120);
select t.as_admin();
select t.eq('plans: owner created two plans for their route', (select count(*) from route_plans where route_id = t.sub_route('Sub-Go')), 2::bigint);
select t.eq('plans: company derived from the route', (select count(distinct company_id) from route_plans where route_id = t.sub_route('Sub-Go')), 1::bigint);
select t.eq('plans: creation audited', (select count(*) from audit_logs where action = 'route_plan.created'), 2::bigint);
select t.as_user(t.u(2));
select t.eq('plans: duration plan must not carry dates', left(t.err_of(format($$select public.create_route_plan(%L, 'x', 1, 'duration', 1, current_date, null)$$, t.sub_route('Sub-Go'))), 5), '23514');
select t.eq('plans: range plan needs both dates', left(t.err_of(format($$select public.create_route_plan(%L, 'x', 1, 'range', null, current_date, null)$$, t.sub_route('Sub-Go'))), 5), '23514');
select t.eq('plans: range end before start refused', left(t.err_of(format($$select public.create_route_plan(%L, 'x', 1, 'range', null, current_date, current_date - 1)$$, t.sub_route('Sub-Go'))), 5), '23514');
select t.eq('plans: negative price refused', left(t.err_of(format($$select public.create_route_plan(%L, 'x', -1, 'duration', 1)$$, t.sub_route('Sub-Go'))), 5), '23514');
select t.as_user(t.u(5));
select t.eq('plans: booking staff cannot create (routes.write)', t.err_of(format($$select public.create_route_plan(%L, 'x', 1, 'duration', 1)$$, t.sub_route('Sub-Go'))), 'P0002|route not found');
select t.as_user(t.u(7));
select t.eq('plans: company B cannot create a plan on company A route', t.err_of(format($$select public.create_route_plan(%L, 'x', 1, 'duration', 1)$$, t.sub_route('Sub-Go'))), 'P0002|route not found');
select t.eq('plans: company B cannot read company A plans', (select count(*) from public.route_plans), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('plans: a plain member cannot read the plan table', (select count(*) from public.route_plans), 0::bigint);
select t.eq('plans: direct insert refused', left(t.err_of(format($$insert into public.route_plans (company_id, route_id, name, price, validity_type, duration_months) values (%L, %L, 'x', 1, 'duration', 1)$$, t.u(101), t.sub_route('Sub-Go'))), 5), '42501');
select t.as_anon();
select t.eq('public list: anonymous sees both plans of the published company', (select count(*) from public.public_route_plans(t.u(101))), 2::bigint);
select t.eq('public list: no private columns', (select pg_get_function_result('public.public_route_plans(uuid)'::regprocedure) !~* '(created_by|deleted_at|is_active|company_id_x)'), true);
select t.as_admin();

-- plan limit (max_route_plans)
update plan_entitlements set int_value = 2 where key = 'max_route_plans' and plan_id in (select plan_id from subscriptions where company_id = t.u(101));
select t.as_user(t.u(2));
select t.eq('limit: third plan refused at the plan limit', left(t.err_of(format($$select public.create_route_plan(%L, 'third', 1, 'duration', 1)$$, t.sub_route('Sub-Go'))), 5), '53400');
select t.as_admin();
update plan_entitlements set int_value = 20 where key = 'max_route_plans' and plan_id in (select plan_id from subscriptions where company_id = t.u(101));

-- update / archive
select t.as_user(t.u(2));
select public.update_route_plan(t.plan_id('Monthly'), 'Monthly', 950, true);
select t.as_admin();
select t.eq('update: price changed', (select price from route_plans where name = 'Monthly'), 950::numeric);

-- ============ requests ============
select t.as_user(t.u(3001));
select public.request_route_subscription(t.plan_id('Term'));
select public.request_route_subscription(t.plan_id('Monthly'));
select t.eq('request: duplicate open request refused', left(t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan_id('Term'))), 5), '23505');
select t.as_user(t.u(3003));
select t.eq('request: no phone on the profile refused', left(t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan_id('Term'))), 5), '22023');
select t.as_anon();
select t.eq('request: anonymous refused', left(t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan_id('Term'))), 5), '42501');
select t.as_admin();
select t.eq('request: pending, snapshot of MASAR ID and name', (select status = 'pending' and masar_id = t.masar(t.u(3001)) and member_name = 'Sub One' and price = 2500 from route_subscriptions where plan_id = t.plan_id('Term')), true);
select t.eq('request: price snapshot follows the plan at request time', (select price from route_subscriptions where plan_id = t.plan_id('Monthly')), 950::numeric);
select t.as_user(t.u(3002));
select t.eq('request: another member does not see it', (select count(*) from route_subscriptions), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('request: the member sees their own two', (select count(*) from route_subscriptions), 2::bigint);
select t.as_user(t.u(7));
select t.eq('request: company B staff see none of company A', (select count(*) from route_subscriptions), 0::bigint);
select t.as_user(t.u(5));
select t.eq('request: company A booking staff see both', (select count(*) from route_subscriptions), 2::bigint);

-- ============ decisions ============
select t.as_user(t.u(7));
select t.eq('decide: company B cannot decide A request', t.err_of(format($$select public.decide_route_subscription(%L, true)$$, (select id from route_subscriptions limit 1))), 'P0002|subscription not found');
select t.as_user(t.u(4));
select t.eq('decide: operations staff cannot (bookings.write)', t.err_of(format($$select public.decide_route_subscription(%L, true)$$, (select id from route_subscriptions limit 1))), 'P0002|subscription not found');
select t.as_user(t.u(3001));
select t.eq('decide: the member cannot approve their own', t.err_of(format($$select public.decide_route_subscription(%L, true)$$, (select id from route_subscriptions limit 1))), 'P0002|subscription not found');
select t.as_admin();
create temp table sub_ids as select (select id from route_subscriptions where plan_id = t.plan_id('Term')) as term,
                                    (select id from route_subscriptions where plan_id = t.plan_id('Monthly')) as monthly;
grant select on sub_ids to public;
select t.as_user(t.u(5));
select public.decide_route_subscription((select term from sub_ids), true);
select public.decide_route_subscription((select monthly from sub_ids), true, 'welcome');
select t.as_admin();
select t.eq('decide: range plan, valid to the plan end, from today at the latest', (select status = 'active' and valid_from = current_date and valid_to = current_date + 120 and paid_at is not null from route_subscriptions where id = (select term from sub_ids)), true);
select t.eq('decide: 1 month from approval, inclusive', (select valid_from = app_private.company_day(company_id, now()) and valid_to = valid_from + interval '1 month' - interval '1 day' from route_subscriptions where id = (select monthly from sub_ids)), true);
select t.eq('decide: decider recorded, note kept', (select decided_by = t.u(5) and decision_note = 'welcome' from route_subscriptions where id = (select monthly from sub_ids)), true);
select t.eq('decide: audited', (select count(*) from audit_logs where action = 'route_subscription.approved'), 2::bigint);
select t.as_user(t.u(5));
select t.eq('decide: deciding twice refused', left(t.err_of(format($$select public.decide_route_subscription(%L, false)$$, (select term from sub_ids))), 5), '23514');
select t.as_user(t.u(3001));
select public.cancel_my_route_subscription((select monthly from sub_ids));
select t.as_user(t.u(3002));
select t.eq('cancel: another member cannot cancel it', t.err_of(format($$select public.cancel_my_route_subscription(%L)$$, (select term from sub_ids))), 'P0002|subscription not found');
select t.as_admin();
select t.eq('cancel: member cancelled their own', t.sub_status((select monthly from sub_ids)), 'cancelled');
select t.eq('cancel: the other stays active', t.sub_status((select term from sub_ids)), 'active');

-- ============ trips, subscriber booking ============
insert into buses (id, company_id, plate_number, capacity) values (t.u(3031), t.u(101), 'S30-1', 30), (t.u(3032), t.u(101), 'S30-2', 30);
insert into drivers (id, company_id, full_name, phone) values (t.u(3041), t.u(101), 'S30 D', '+201300000001'), (t.u(3042), t.u(101), 'S30 D2', '+201300000002');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3001), t.u(101), t.sub_route('Sub-Go'),          t.u(3031), t.u(3041), date_trunc('day', now()) + interval '70 day 6 hours',  date_trunc('day', now()) + interval '70 day 8 hours',  50, 5, 'scheduled'),
  (t.u(3002), t.u(101), t.sub_route('Sub-Go'),          t.u(3031), t.u(3041), date_trunc('day', now()) + interval '71 day 6 hours',  date_trunc('day', now()) + interval '71 day 8 hours',  50, 5, 'scheduled'),
  (t.u(3011), t.u(101), t.sub_route('Sub-Go (return)'), t.u(3031), t.u(3041), date_trunc('day', now()) + interval '70 day 12 hours', date_trunc('day', now()) + interval '70 day 14 hours', 50, 5, 'scheduled'),
  (t.u(3012), t.u(101), t.sub_route('Sub-Go (return)'), t.u(3031), t.u(3041), date_trunc('day', now()) + interval '70 day 16 hours', date_trunc('day', now()) + interval '70 day 18 hours', 50, 1, 'scheduled'),
  (t.u(3013), t.u(101), t.sub_route('Sub-Go (return)'), t.u(3031), t.u(3041), date_trunc('day', now()) + interval '71 day 12 hours', date_trunc('day', now()) + interval '71 day 14 hours', 50, 5, 'scheduled'),
  (t.u(3014), t.u(101), t.sub_route('Sub-Go (return)'), t.u(3032), t.u(3042), date_trunc('day', now()) + interval '70 day 7 hours',  date_trunc('day', now()) + interval '70 day 7 hours 30 minutes', 50, 5, 'scheduled');

select t.as_user(t.u(3001));
select t.eq('return options: same day, after arrival, seats left (3011, 3012 only)', (select array_agg(trip_id order by departure_at) from public.subscriber_return_options((select term from sub_ids), t.u(3001))), array[t.u(3011), t.u(3012)]);
select t.as_user(t.u(3002));
select t.eq('return options: another member gets nothing', (select count(*) from public.subscriber_return_options((select term from sub_ids), t.u(3001))), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('book: return trip on another day refused', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select term from sub_ids), t.u(3001), t.u(3013))), 'P0002|return trip not found');
select t.eq('book: return that departs before the go arrives refused', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select term from sub_ids), t.u(3001), t.u(3014))), 'P0002|return trip not found');
select t.eq('book: the go trip as its own return refused', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select term from sub_ids), t.u(3001), t.u(3001))), 'P0002|return trip not found');
select t.eq('book: cancelled subscription cannot book', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select monthly from sub_ids), t.u(3001), t.u(3011))), 'P0002|subscription not found');
select public.create_my_subscriber_booking((select term from sub_ids), t.u(3001), t.u(3011));
select t.as_admin();
select t.eq('book: both seats taken', t.seats(t.u(3001)) * 100 + t.seats(t.u(3011)), 101);
select t.eq('book: both legs paid, price 0, one seat, marked with the subscription, linked as a round trip',
  (select count(*) = 2 and bool_and(payment_status = 'paid' and total_amount = 0 and seats_count = 1 and subscription_id = (select term from sub_ids) and round_trip_group_id is not null)
     from bookings where subscription_id = (select term from sub_ids)), true);
select t.eq('book: legs are outbound + return', (select string_agg(trip_leg, ',' order by trip_leg) from bookings where subscription_id = (select term from sub_ids)), 'outbound,return');
select t.eq('book: tickets issued for both legs', (select count(*) from tickets where booking_id in (select id from bookings where subscription_id = (select term from sub_ids))), 2::bigint);
select t.eq('book: audited per leg', (select count(*) from audit_logs where action = 'booking.created' and metadata ? 'subscription_id'), 2::bigint);
select t.as_user(t.u(3001));
select t.eq('book: second booking the same day refused', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select term from sub_ids), t.u(3001), t.u(3012))), '23505|already booked for this day');
select t.as_admin();
select t.eq('book: the refused retry moved no seats', t.seats(t.u(3001)) * 100 + t.seats(t.u(3011)) + t.seats(t.u(3012)), 101);
select t.as_user(t.u(3002));
select t.eq('book: another member cannot use someone else subscription', t.err_of(format($$select public.create_my_subscriber_booking(%L, %L)$$, (select term from sub_ids), t.u(3002))), 'P0002|subscription not found');

-- go-only booking on another day; full return trip refuses atomically
select t.as_user(t.u(3001));
select public.create_my_subscriber_booking((select term from sub_ids), t.u(3002));
select t.as_admin();
select t.eq('go only: one booking, no round trip group', (select count(*) = 1 and bool_and(round_trip_group_id is null and trip_leg is null) from bookings where subscription_id = (select term from sub_ids) and trip_id = t.u(3002)), true);
update trips set seats_booked = 1 where id = t.u(3012);   -- full
select t.as_user(t.u(3001));
select t.eq('return full: refused as a whole', left(t.err_of(format($$select public.create_my_subscriber_booking(%L, %L, %L)$$, (select term from sub_ids), t.u(3001), t.u(3012))), 5), '23505');

-- ============ cancel one leg cancels both (0030 rule) ============
select t.as_admin();
select t.eq('cancel: precondition, two confirmed legs', (select count(*) from bookings where subscription_id = (select term from sub_ids) and trip_id in (t.u(3001), t.u(3011)) and status = 'confirmed'), 2::bigint);

-- ============ scan ============
select t.as_user(t.u(5));
select t.eq('scan: no booking on that trip refused', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3012))), 'P0002|no booking for this trip');
select t.eq('scan: unknown MASAR ID refused', t.err_of(format($$select public.scan_route_subscription('MSR-ZZZZ-ZZZZ', %L)$$, t.u(3001))), 'P0002|no valid subscription');
select t.eq('scan: go direction recorded', (select public.scan_route_subscription(lower(t.masar(t.u(3001))), t.u(3001)))->>'direction', 'go');
select t.eq('scan: a second go scan the same day refused', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3001))), '23505|already scanned for this direction today');
select t.eq('scan: return direction recorded', (select public.scan_route_subscription(t.masar(t.u(3001)), t.u(3011)))->>'direction', 'return');
select t.eq('scan: a third scan the same day refused', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3011))), '23505|already scanned for this direction today');
select t.as_admin();
select t.eq('scan: exactly two scan rows, one per direction', (select string_agg(direction, ',' order by direction) from route_subscription_scans), 'go,return');
select t.eq('scan: audited', (select count(*) from audit_logs where action = 'route_subscription.scanned'), 2::bigint);
select t.eq('scan: rows are append-only', left(t.err_of($$delete from route_subscription_scans$$), 5), '42501');
select t.as_user(t.u(7));
select t.eq('scan: company B staff cannot scan on company A trip', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3001))), 'P0002|trip not found');
select t.eq('scan: company B staff cannot read scans', (select count(*) from route_subscription_scans), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('scan: a member cannot scan', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3001))), 'P0002|trip not found');
select t.eq('scan: direct insert refused', left(t.err_of($$insert into route_subscription_scans (company_id) values (null)$$), 5), '42501');
select t.as_user(t.u(6));
select t.eq('scan: a driver not assigned to the trip cannot scan', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3002))), 'P0002|trip not found');

-- different day, new scans allowed again
select t.as_user(t.u(5));
select t.eq('scan: next day go scan allowed', (select public.scan_route_subscription(t.masar(t.u(3001)), t.u(3002)))->>'direction', 'go');

-- cancelling the go leg of a subscriber round trip cancels both legs and frees both seats (0030 rule via round_trip_group_id)
select t.as_admin();
create temp table sub_go as select id from bookings where subscription_id = (select term from sub_ids) and trip_id = t.u(3001);
grant select on sub_go to public;
select t.as_user(t.u(3001));
select public.cancel_my_booking((select id from sub_go));
select t.as_admin();
select t.eq('cancel: both legs cancelled', (select count(*) from bookings where subscription_id = (select term from sub_ids) and trip_id in (t.u(3001), t.u(3011)) and status = 'cancelled'), 2::bigint);
select t.eq('cancel: both seats released', t.seats(t.u(3001)) + t.seats(t.u(3011)), 0);

-- expired subscription cannot scan or book
select t.as_admin();
update route_subscriptions set valid_from = current_date - 40, valid_to = current_date - 10 where id = (select term from sub_ids);
select t.as_user(t.u(5));
select t.eq('expired: scan refused', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3001))), 'P0002|no valid subscription');
select t.as_user(t.u(3001));
select t.eq('expired: renewal request lapses the old row and is accepted', (select count(*) from (select public.request_route_subscription(t.plan_id('Term'))) q), 1::bigint);
select t.as_admin();
select t.eq('expired: old row marked expired', t.sub_status((select term from sub_ids)), 'expired');

-- ============ archive ============
select t.as_user(t.u(2));
select public.archive_route_plan(t.plan_id('Term'));
select t.as_anon();
select t.eq('archive: no longer public', (select count(*) from public.public_route_plans(t.u(101)) where name = 'Term'), 0::bigint);
select t.as_user(t.u(3002));
select t.eq('archive: cannot be requested', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan_id('Term'))), 'P0002|plan not found');
select t.as_admin();
select t.eq('archive: existing subscriptions untouched', (select count(*) from route_subscriptions where plan_id = t.plan_id('Term')), 2::bigint);

-- ============ unpublished company (B) ============
select t.as_user(t.u(7));
select public.create_route_plan(t.u(203), 'B plan', 10, 'duration', 1);
select t.as_user(t.u(3002));
select t.eq('hidden: plan of an unpublished company cannot be requested', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan_id('B plan'))), 'P0002|plan not found');
select t.as_admin();
