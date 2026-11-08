-- 26: round-trip booking (0030). Requires 01 fixtures, 05 (t.err_of, t.seats), 08 (website published, users 81..83, rate limits seeded).
select t.as_admin();
insert into auth.users (id, email) values (t.u(2601), 'rt1@test.dev'), (t.u(2602), 'rt2@test.dev'), (t.u(2603), 'rt3@test.dev') on conflict do nothing;
update public.plan_entitlements e set int_value = null where e.plan_id in (select plan_id from public.subscriptions where company_id = t.u(101)) and e.key in ('max_trips_per_month', 'max_buses', 'max_drivers', 'max_routes');
insert into routes (id, company_id, name, origin_name, destination_name) values (t.u(2621), t.u(101), 'S26 back', 'Cairo', 'Fayoum');
insert into buses (id, company_id, plate_number, capacity) values (t.u(2631), t.u(101), 'S26-1', 30), (t.u(2632), t.u(101), 'S26-2', 30), (t.u(2633), t.u(101), 'S26-3', 30);
insert into drivers (id, company_id, full_name, phone) values (t.u(2641), t.u(101), 'S26 D', '+201260000001'), (t.u(2642), t.u(101), 'S26 D2', '+201260000002'), (t.u(2643), t.u(101), 'S26 D3', '+201260000003');
-- outbound 60 / return 40 / both 80 ; 2 return options: r1 (cap 3), r2 (cap 1). Plus a return of ANOTHER outbound.
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status, round_trip_price) values
  (t.u(2601), t.u(101), t.u(201), t.u(2631), t.u(2641), now() + interval '60 day', now() + interval '60 day 2 hours', 60, 5, 'scheduled', 80);
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status, outbound_trip_id) values
  (t.u(2611), t.u(101), t.u(2621), t.u(2631), t.u(2641), now() + interval '60 day 5 hours', now() + interval '60 day 7 hours', 40, 3, 'scheduled', t.u(2601)),
  (t.u(2612), t.u(101), t.u(2621), t.u(2631), t.u(2641), now() + interval '60 day 10 hours', now() + interval '60 day 12 hours', 40, 1, 'scheduled', t.u(2601));
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status, round_trip_price) values
  (t.u(2602), t.u(101), t.u(201), t.u(2632), t.u(2642), now() + interval '61 day', now() + interval '61 day 2 hours', 30, 5, 'scheduled', null),
  (t.u(2603), t.u(101), t.u(201), t.u(2633), t.u(2643), now() + interval '62 day', now() + interval '62 day 2 hours', 30, 5, 'scheduled', 50),
  (t.u(2604), t.u(101), t.u(201), t.u(2632), t.u(2642), now() + interval '64 day', now() + interval '64 day 2 hours', 30, 5, 'scheduled', 70);
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status, outbound_trip_id) values
  (t.u(2613), t.u(101), t.u(2621), t.u(2633), t.u(2643), now() + interval '62 day 5 hours', now() + interval '62 day 7 hours', 30, 5, 'scheduled', t.u(2603));

-- ===== search & options =====
select t.as_anon();
select t.eq('search: outbound shows round trip price and 2 return options', (select round_trip_price = 80 and return_options = 2 from public.public_search_trips() where trip_id = t.u(2601)), true);
select t.eq('search: one-way trip shows no round trip price', (select round_trip_price is null and return_options = 0 from public.public_search_trips() where trip_id = t.u(2602)), true);
select t.as_admin();
select t.eq('fixture: that outbound does store a round trip price (hidden only because it has no return)', (select round_trip_price from trips where id = t.u(2604)), 70::numeric);
select t.as_anon();
select t.eq('search: outbound with no bookable return hides the round trip price', (select round_trip_price is null and return_options = 0 from public.public_search_trips() where trip_id = t.u(2604)), true);
select t.eq('return options: 2 for the outbound, in time order', (select array_agg(trip_id order by departure_at) from public.public_trip_return_options(t.u(2601))), array[t.u(2611), t.u(2612)]);
select t.eq('return options: one-way trip has none', (select count(*) from public.public_trip_return_options(t.u(2602))), 0::bigint);
select t.eq('return options: a return trip itself has none', (select count(*) from public.public_trip_return_options(t.u(2611))), 0::bigint);
select t.eq('return options: output has no private columns', (select pg_get_function_result('public.public_trip_return_options(uuid)'::regprocedure) !~* '(bus|driver|plate|notes|created_by|seats_booked|phone)'), true);
select t.eq('anon cannot book a round trip', left(t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'x', '+201000002600')$$, t.u(2601), t.u(2611))), 5), '42501');

-- ===== booking =====
select t.as_user(t.u(2601));
select t.eq('book: total = round trip price x seats, both legs confirmed',
  (select (r->>'total_amount')::numeric = 160 and r->'outbound'->>'status' = 'confirmed' and r->'return'->>'status' = 'confirmed'
     from (select public.create_my_round_trip_booking(t.u(2601), t.u(2611), 2, 'RT One', '+201000026001', p_idempotency_key => 'rt-1') as r) x), true);
select t.as_admin();
select t.eq('split: 80 * 60/100 = 48 outbound, 32 return per seat', (select count(*) from bookings where idempotency_key in ('rt-1', 'rt-1:return') and ((trip_leg = 'outbound' and unit_price = 48 and total_amount = 96) or (trip_leg = 'return' and unit_price = 32 and total_amount = 64))), 2::bigint);
select t.eq('split: legs add up to the round trip price exactly', (select sum(total_amount) from bookings where round_trip_group_id = (select round_trip_group_id from bookings where idempotency_key = 'rt-1')), 160::numeric);
select t.eq('seats moved on BOTH trips', t.seats(t.u(2601)) * 100 + t.seats(t.u(2611)), 202);
select t.eq('same customer, source web, created_by caller', (select count(distinct customer_id) = 1 and bool_and(source = 'web' and created_by = t.u(2601)) from bookings where round_trip_group_id is not null and idempotency_key like 'rt-1%'), true);
select t.eq('tickets issued for both legs (2 + 2)', (select count(*) from tickets where booking_id in (select id from bookings where idempotency_key like 'rt-1%')), 4::bigint);
select t.eq('audit: one row per leg', (select count(*) from audit_logs where action = 'booking.created' and actor_id = t.u(2601)), 2::bigint);

-- replay / conflict
select t.as_user(t.u(2601));
select t.eq('replay: same key returns same group, not new', (select public.create_my_round_trip_booking(t.u(2601), t.u(2611), 2, 'RT One', '+201000026001', p_idempotency_key => 'rt-1'))->>'idempotent_replay', 'true');
select t.eq('replay: other return trip = conflict', left(t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 2, 'RT One', '+201000026001', p_idempotency_key => 'rt-1')$$, t.u(2601), t.u(2612))), 5), '23505');
select t.eq('replay: other seats = conflict', left(t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'RT One', '+201000026001', p_idempotency_key => 'rt-1')$$, t.u(2601), t.u(2611))), 5), '23505');
select t.as_admin();
select t.eq('replay moved no seats', t.seats(t.u(2601)) * 100 + t.seats(t.u(2611)), 202);

-- validation: wrong pairing, one-way outbound, same trip twice
select t.as_user(t.u(2602));
select t.eq('refused: return belongs to another outbound', t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'RT Two', '+201000026002')$$, t.u(2601), t.u(2613))), 'P0002|trip not found');
select t.eq('refused: outbound without round trip price', t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'RT Two', '+201000026002')$$, t.u(2602), t.u(2611))), 'P0002|trip not found');
select t.eq('refused: same trip twice', t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'RT Two', '+201000026002')$$, t.u(2601), t.u(2601))), 'P0002|trip not found');

-- atomic: return leg full => nothing booked on the outbound either, no customer row left behind
select t.as_user(t.u(2602));
select t.eq('return full for 2 seats: whole booking refused', t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 2, 'RT Two', '+201000026002')$$, t.u(2601), t.u(2612))), '23514|not enough seats available');
select t.as_admin();
select t.eq('atomic: outbound seats unchanged (2 booked)', t.seats(t.u(2601)), 2);
select t.eq('atomic: no customer row for the failed attempt', (select count(*) from customers where phone = '+201000026002'), 0::bigint);

-- last seats on the return, then it is sold out for the next person
select t.as_user(t.u(2602));
select t.eq('book 1 seat on the 1-seat return', (select (public.create_my_round_trip_booking(t.u(2601), t.u(2612), 1, 'RT Two', '+201000026002'))->'return'->>'status'), 'confirmed');
select t.as_user(t.u(2603));
select t.eq('sold out return refuses the next round trip', t.err_of(format($$select public.create_my_round_trip_booking(%L, %L, 1, 'RT Three', '+201000026003')$$, t.u(2601), t.u(2612))), '23514|not enough seats available');
select t.as_admin();
select t.eq('search: seats_available on outbound reflects 3 booked of 5', (select seats_available from public.public_search_trips() where trip_id = t.u(2601)), 2);

-- single-leg booking of the return trip still works on its own (return-only price)
select t.as_user(t.u(2603));
select t.eq('return only: normal booking at the return price', (select (public.create_my_booking(t.u(2611), 1, 'RT Three', '+201000026003'))->>'total_amount'), '40.00');
-- the outbound alone at the go-only price
select t.eq('go only: normal booking at the go price', (select (public.create_my_booking(t.u(2601), 1, 'RT Three', '+201000026003'))->>'total_amount'), '60.00');

-- tenant isolation: another company's customer cannot be affected; company B route trip cannot be paired
select t.as_admin();
select t.eq('booking rows carry the trip company only', (select count(*) from bookings where round_trip_group_id is not null and company_id <> t.u(101)), 0::bigint);

-- ===== cancel both legs =====
select t.as_admin();
create temp table s26_ids as select (select id from bookings where idempotency_key = 'rt-1') as out1, (select id from bookings where round_trip_group_id is not null and trip_leg = 'outbound' and created_by = t.u(2602) and status = 'confirmed') as out2;
grant all on s26_ids to authenticated;
select t.as_user(t.u(2601));
select t.eq('cancel outbound leg also cancels the return leg', (select (public.cancel_my_booking((select out1 from s26_ids)))->>'also_cancelled') is not null, true);
select t.as_admin();
select t.eq('both legs cancelled', (select count(*) from bookings where idempotency_key like 'rt-1%' and status = 'cancelled'), 2::bigint);
select t.eq('seats released on both trips (1 + 1 left booked by RT Two / RT Three)', t.seats(t.u(2601)) * 100 + t.seats(t.u(2611)), 201);
select t.as_user(t.u(2601));
select t.eq('cancelling again is a harmless no-op', (select (public.cancel_my_booking((select out1 from s26_ids)))->>'already_cancelled'), 'true');
-- someone else cannot cancel my legs
select t.as_user(t.u(2602));
select t.eq('other customer cannot cancel a leg of mine', t.err_of(format($$select public.cancel_my_booking(%L)$$, (select out1 from s26_ids))), 'P0002|booking not found');
select t.as_admin();
select t.eq('and my second booking is untouched', (select status from bookings where id = (select out2 from s26_ids)), 'confirmed');
