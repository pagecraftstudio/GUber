-- 51: P4 free subscriber trips in the normal flow (migration 0055). Needs 01 fixtures, 30 (route 'Sub-Go' with its return route, plan 'Monthly'), 50 (t.err50, website A published).
-- Company A = 101, B = 102. New members 5101 (active subscription), 5102 (dates ended), 5103 (pending only), 5104 (no subscription).
select t.as_admin();
create or replace function t.cnt51(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.bid51(p uuid) returns uuid language sql security definer as $$ select id from public.bookings where trip_id = p and created_by = t.u(5101) and status <> 'cancelled' limit 1 $$;
create or replace function t.q51(p_trip uuid, p_seats int) returns jsonb language plpgsql as $$ begin return public.quote_my_booking(p_trip, p_seats); exception when others then return jsonb_build_object('err', sqlstate); end $$;
insert into auth.users (id, email) values (t.u(5101), 'm1@test.dev'), (t.u(5102), 'm2@test.dev'), (t.u(5103), 'm3@test.dev'), (t.u(5104), 'm4@test.dev') on conflict do nothing;
update public.profiles set phone = '+20100005' || right(id::text, 3), full_name = 'Member ' || right(id::text, 4) where id in (t.u(5101), t.u(5102), t.u(5103), t.u(5104));
-- (profile phones above are only for the customer row the RPC creates)
insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, status, price, currency, valid_from, valid_to, paid_at)
select t.u(101), (select id from public.route_plans where name = 'Monthly' and route_id = t.sub_route('Sub-Go') limit 1), t.u(5101), (select masar_id from public.profiles where id = t.u(5101)), 'Member One', '+201000051010', 'active', 900, 'EGP', current_date - 1, current_date + 200, now();
insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, status, price, currency, valid_from, valid_to, paid_at)
select t.u(101), (select id from public.route_plans where name = 'Monthly' and route_id = t.sub_route('Sub-Go') limit 1), t.u(5102), (select masar_id from public.profiles where id = t.u(5102)), 'Member Two', '+201000051020', 'active', 900, 'EGP', current_date - 60, current_date - 30, now();
insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, status, price, currency)
select t.u(101), (select id from public.route_plans where name = 'Monthly' and route_id = t.sub_route('Sub-Go') limit 1), t.u(5103), (select masar_id from public.profiles where id = t.u(5103)), 'Member Three', '+201000051030', 'pending', 900, 'EGP';

insert into public.trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select x.id, t.u(101), x.route, x.bus, x.drv, d.day + x.at, d.day + x.at + interval '2 hours', 40, 5, 'scheduled'
from (values
  (t.u(5101), t.sub_route('Sub-Go'), t.u(221), t.u(231), interval '7 hours'),
  (t.u(5102), (select return_route_id from public.routes where id = t.sub_route('Sub-Go')), t.u(225), t.u(234), interval '16 hours'),
  (t.u(5103), t.sub_route('Sub-Go'), t.u(221), t.u(231), interval '11 hours')
) as x(id, route, bus, drv, at) cross join (select date_trunc('day', now()) + interval '70 days' as day) d;
insert into public.trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select t.u(5104), t.u(101), t.sub_route('Sub-Go'), t.u(221), t.u(231), date_trunc('day', now()) + interval '71 days 7 hours', date_trunc('day', now()) + interval '71 days 9 hours', 40, 5, 'scheduled';
select t.eq('fixture: the covered trips are public', t.cnt51($$select count(*) from public.trips where id in (t.u(5101), t.u(5102), t.u(5103), t.u(5104)) and app_private.is_trip_public(id)$$), 4::bigint);

-- 1. coverage and quote ----------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5101));
select t.eq('quote: a subscriber''s go trip is free', (t.q51(t.u(5101), 1)->>'total')::numeric || '/' || (t.q51(t.u(5101), 1)->'subscription'->>'free'), '0/true');
select t.eq('quote: ...with no payment step', (t.q51(t.u(5101), 1)->>'requires_payment')::boolean, false);
select t.eq('quote: the paired return trip is free too', (t.q51(t.u(5102), 1)->'subscription'->>'leg') || '/' || (t.q51(t.u(5102), 1)->>'total'), 'return/0');
select t.eq('quote: 2 seats are a normal paid booking (friends pay)', (t.q51(t.u(5101), 2)->>'total')::numeric || '/' || (t.q51(t.u(5101), 2)->'subscription'->>'free'), '80.00/false');
select t.eq('quote: another route of the same company is NOT covered', t.q51(t.u(5001), 1)->'subscription', 'null'::jsonb);
select t.eq('quote: ...and costs the full price', (t.q51(t.u(5001), 1)->>'total')::numeric, 40::numeric);
select t.eq('coverage list: the three covered trips of the day, none of the others', (select count(*) from public.my_trip_coverage(array[t.u(5101), t.u(5102), t.u(5103), t.u(5001), t.u(974)])), 3::bigint);
select t.eq('coverage list: more than 200 ids refused', t.err50($$select * from public.my_trip_coverage((select array_agg(gen_random_uuid()) from generate_series(1, 201)))$$), '22023');
select t.as_user(t.u(5102));
select t.eq('quote: a subscription whose dates ended pays', (t.q51(t.u(5101), 1)->>'total')::numeric, 40::numeric);
select t.eq('coverage list: none for an ended subscription', (select count(*) from public.my_trip_coverage(array[t.u(5101), t.u(5102)])), 0::bigint);
select t.as_user(t.u(5103));
select t.eq('quote: a pending (unapproved) subscription pays', (t.q51(t.u(5101), 1)->>'total')::numeric, 40::numeric);
select t.as_user(t.u(5104));
select t.eq('quote: a student with no subscription pays', (t.q51(t.u(5101), 1)->>'total')::numeric, 40::numeric);
select t.eq('coverage list: none for a student with no subscription', (select count(*) from public.my_trip_coverage(array[t.u(5101)])), 0::bigint);
select t.as_anon();
select t.eq('anon: quote refused', t.err50($$select public.quote_my_booking(t.u(5101), 1)$$), '42501');
select t.eq('anon: coverage refused', t.err50($$select * from public.my_trip_coverage(array[t.u(5101)])$$), '42501');
select t.eq('anon: free booking refused', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5101))$$), '42501');

-- 2. booking the free seat --------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5104));
select t.eq('book: no subscription -> refused, nothing created', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5101))$$), 'P0002');
select t.as_user(t.u(5102));
select t.eq('book: ended subscription refused', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5101))$$), 'P0002');
select t.as_user(t.u(5101));
select t.eq('book: an uncovered trip is refused', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5001))$$), 'P0002');
select t.passes('book: the go trip', $$select public.create_my_subscriber_trip_booking(t.u(5101))$$);
select t.as_admin();
select t.eq('book: confirmed, free, paid, linked to the subscription', (select status || '/' || total_amount || '/' || payment_status || '/' || (subscription_id is not null) || '/' || seats_count from public.bookings where trip_id = t.u(5101) and created_by = t.u(5101)), 'confirmed/0.00/paid/true/1');
select t.eq('book: a ticket was issued', t.cnt51($$select count(*) from public.tickets tk join public.bookings b on b.id = tk.booking_id where b.trip_id = t.u(5101) and b.created_by = t.u(5101)$$), 1::bigint);
select t.eq('book: one seat held', t.seats50(t.u(5101)), 1);
select t.eq('book: audited with the subscription and leg', t.cnt51($$select count(*) from public.audit_logs where action = 'booking.created' and metadata->>'leg' = 'go' and metadata->>'subscription_id' is not null and entity_id = (select id from public.bookings where trip_id = t.u(5101) and created_by = t.u(5101))$$), 1::bigint);
select t.as_user(t.u(5101));
select t.eq('limit: a second go trip the same day is refused (double click too)', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5101))$$), '23505');
select t.eq('limit: ...another go trip the same day too', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5103))$$), '23505');
select t.eq('limit: the quote now says so and charges the normal price', (t.q51(t.u(5103), 1)->'subscription'->>'day_limit_reached') || '/' || (t.q51(t.u(5103), 1)->>'total'), 'true/40.00');
select t.eq('limit: the coverage list marks the go trips used, the return still free', (select string_agg(leg || ':' || available, ',' order by leg) from public.my_trip_coverage(array[t.u(5101), t.u(5102), t.u(5103)]) where trip_id in (t.u(5103), t.u(5102))), 'go:false,return:true');
select t.passes('limit: the return trip the same day is still free', $$select public.create_my_subscriber_trip_booking(t.u(5102))$$);
select t.eq('limit: a second return the same day would be refused (none left)', (select count(*) from public.my_trip_coverage(array[t.u(5102)]) where available), 0::bigint);
select t.passes('limit: the next day has its own free go trip', $$select public.create_my_subscriber_trip_booking(t.u(5104))$$);
select t.as_admin();
select t.eq('limit: three free bookings in total for the member', t.cnt51($$select count(*) from public.bookings where subscription_id = (select id from public.route_subscriptions where user_id = t.u(5101))  and status = 'confirmed'$$), 3::bigint);

-- 3. cancelling gives the free seat back -------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5101));
select t.passes('cancel: the member cancels the go booking', format($$select public.cancel_my_booking(%L, null)$$, t.bid51(t.u(5101))));
select t.eq('cancel: the go seat is free again', (t.q51(t.u(5103), 1)->'subscription'->>'free'), 'true');
select t.eq('cancel: seat released', t.seats50(t.u(5101)), 0);

-- 4. capacity and company isolation -------------------------------------------------------------------------------------------------------------
select t.as_admin();
update public.trips set capacity = 1 where id = t.u(5103);
insert into public.customers (company_id, full_name, phone) values (t.u(101), 'Walk In', '+201000051999') on conflict do nothing;
insert into public.bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, payment_status, source)
select t.u(101), 'FILL51', t.u(5103), id, 1, 40, 40, 'EGP', 'confirmed', 'unpaid', 'staff' from public.customers where phone = '+201000051999' and company_id = t.u(101) limit 1;
select t.as_user(t.u(5101));
select t.eq('capacity: a full trip refuses the free seat', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5103))$$), '23514');
select t.as_user(t.u(7));
select t.eq('isolation: company B staff cannot read the member''s free bookings', (select count(*) from public.bookings where subscription_id is not null), 0::bigint);
select t.eq('isolation: staff cannot call the member RPC', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5101))$$), 'P0002');
select t.as_admin();
