-- 32: route subscriptions Phase C reads (migration 0036). Requires 30 + 31 data: member 3001 has an active 'Term' subscription is archived/expired by 30,
-- so this suite builds its own fresh plan, request, approval and trips on a far-future day (+200 days). Users: 2 ownerA, 5 bookingA, 7 ownerB; members 3001, 3002.
select t.as_admin();
create or replace function t.d200() returns date language sql as $$ select (current_date + 200) $$;
create or replace function t.plan_named(p text) returns uuid language sql security definer as $$ select id from public.route_plans where name = p limit 1 $$;
create or replace function t.sub_of(p_user uuid, p_plan uuid) returns uuid language sql security definer as $$ select id from public.route_subscriptions where user_id = p_user and plan_id = p_plan and status in ('pending','active') limit 1 $$;
create or replace function t.sroute(p text) returns uuid language sql security definer as $$ select id from public.routes where name = p order by created_at desc limit 1 $$;

select t.as_user(t.u(2));
select public.create_route_plan(t.sroute('Sub-Go'), 'Reads Range', 700, 'range', null, current_date, current_date + 260);
select t.as_user(t.u(3001));
select public.request_route_subscription(t.plan_named('Reads Range'));
select t.as_user(t.u(3002));
select public.request_route_subscription(t.plan_named('Reads Range'));
select t.as_user(t.u(5));
select public.decide_route_subscription(t.sub_of(t.u(3001), t.plan_named('Reads Range')), true);
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3201), t.u(101), t.sroute('Sub-Go'),          t.u(3031), t.u(3041), date_trunc('day', now()) + interval '200 day 6 hours',  date_trunc('day', now()) + interval '200 day 8 hours',  50, 5, 'scheduled'),
  (t.u(3202), t.u(101), t.sroute('Sub-Go (return)'), t.u(3031), t.u(3041), date_trunc('day', now()) + interval '200 day 12 hours', date_trunc('day', now()) + interval '200 day 14 hours', 50, 5, 'scheduled');

-- my_route_subscriptions
select t.as_user(t.u(3001));
select t.eq('mine: my row carries plan, route, company names and my MASAR ID', (select count(*) = 1 and bool_and(origin_name = 'Cairo' and company_name is not null and masar_id = t.masar(t.u(3001))) from public.my_route_subscriptions() where plan_name = 'Reads Range'), true);
select t.eq('mine: statuses reflect approval', (select status from public.my_route_subscriptions() where plan_name = 'Reads Range'), 'active');
select t.as_user(t.u(3002));
select t.eq('mine: a pending request is shown as pending to its owner', (select status from public.my_route_subscriptions() where plan_name = 'Reads Range'), 'pending');
select t.eq('mine: member 3002 sees nothing of member 3001 (own MASAR ID only)', (select count(*) from public.my_route_subscriptions() where masar_id = t.masar(t.u(3001))), 0::bigint);
select t.as_anon();
select t.eq('mine: anonymous refused', left(t.err_of($$select * from public.my_route_subscriptions()$$), 5), '42501');
select t.as_admin();
update route_subscriptions set valid_from = current_date - 30, valid_to = current_date - 1 where id = t.sub_of(t.u(3001), t.plan_named('Reads Range'));
select t.as_user(t.u(3001));
select t.eq('mine: an active subscription past its end date reads as expired', (select status from public.my_route_subscriptions() where plan_name = 'Reads Range'), 'expired');
select t.as_admin();
update route_subscriptions set valid_from = current_date, valid_to = current_date + 260 where id = t.sub_of(t.u(3001), t.plan_named('Reads Range')) or (user_id = t.u(3001) and plan_id = t.plan_named('Reads Range'));

-- outbound options
select t.as_user(t.u(3001));
select t.eq('go options: the go trip of that day', (select array_agg(trip_id) from public.subscriber_outbound_options(t.sub_of(t.u(3001), t.plan_named('Reads Range')), t.d200())), array[t.u(3201)]);
select t.eq('go options: a day with no trips is empty', (select count(*) from public.subscriber_outbound_options(t.sub_of(t.u(3001), t.plan_named('Reads Range')), t.d200() + 1)), 0::bigint);
select t.eq('go options: a day outside the validity is empty', (select count(*) from public.subscriber_outbound_options(t.sub_of(t.u(3001), t.plan_named('Reads Range')), current_date + 400)), 0::bigint);
select t.as_user(t.u(3002));
select t.eq('go options: pending subscription gives nothing', (select count(*) from public.subscriber_outbound_options(t.sub_of(t.u(3002), t.plan_named('Reads Range')), t.d200())), 0::bigint);
select t.eq('go options: someone else subscription gives nothing', (select count(*) from public.subscriber_outbound_options((select id from public.my_route_subscriptions() limit 0) , t.d200())), 0::bigint);
select t.as_admin();
create temp table sub_reads as select t.sub_of(t.u(3001), t.plan_named('Reads Range')) as s1;
grant select on sub_reads to public;
select t.as_user(t.u(3002));
select t.eq('go options: member 3002 cannot read member 3001 subscription', (select count(*) from public.subscriber_outbound_options((select s1 from sub_reads), t.d200())), 0::bigint);
select t.eq('day state: member 3002 gets no row for 3001 subscription', (select count(*) from public.subscriber_day_state((select s1 from sub_reads), t.d200())), 0::bigint);
select t.eq('bookings: member 3002 gets none for 3001 subscription', (select count(*) from public.subscriber_bookings((select s1 from sub_reads))), 0::bigint);

-- booking then day state + bookings + scanned
select t.as_user(t.u(3001));
select t.eq('day state: nothing booked yet', (select go_booked::text || return_booked::text from public.subscriber_day_state((select s1 from sub_reads), t.d200())), 'falsefalse');
select public.create_my_subscriber_booking((select s1 from sub_reads), t.u(3201), t.u(3202));
select t.eq('day state: both seats booked', (select go_booked::text || return_booked::text from public.subscriber_day_state((select s1 from sub_reads), t.d200())), 'truetrue');
select t.eq('day state: another day still free', (select go_booked::text || return_booked::text from public.subscriber_day_state((select s1 from sub_reads), t.d200() + 1)), 'falsefalse');
select t.eq('bookings: two legs, go then return, not scanned', (select string_agg(direction || ':' || scanned::text, ',' order by departure_at) from public.subscriber_bookings((select s1 from sub_reads))), 'go:false,return:false');
select t.eq('bookings: legs carry outbound / return', (select string_agg(trip_leg, ',' order by departure_at) from public.subscriber_bookings((select s1 from sub_reads))), 'outbound,return');
select t.as_user(t.u(5));
select public.scan_route_subscription(t.masar(t.u(3001)), t.u(3201));
select t.as_user(t.u(3001));
select t.eq('bookings: the scanned leg is marked', (select string_agg(direction || ':' || scanned::text, ',' order by departure_at) from public.subscriber_bookings((select s1 from sub_reads))), 'go:true,return:false');
select t.eq('go options: a fully booked day no longer offers that trip twice (trip still has seats, so listed)', (select count(*) from public.subscriber_outbound_options((select s1 from sub_reads), t.d200())), 1::bigint);
select public.cancel_my_booking((select booking_id from public.subscriber_bookings((select s1 from sub_reads)) where direction = 'go'));
select t.eq('bookings: cancelling the go leg removes both from the list', (select count(*) from public.subscriber_bookings((select s1 from sub_reads))), 0::bigint);
select t.eq('day state: free again after the cancel', (select go_booked::text || return_booked::text from public.subscriber_day_state((select s1 from sub_reads), t.d200())), 'falsefalse');
select t.as_admin();
