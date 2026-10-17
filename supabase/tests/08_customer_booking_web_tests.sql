-- 08: customer web booking (0013). Requires 01 fixtures + 05 (t.err_of, trip fixtures) + 07.
-- Companies: A u(101) active, B u(102) active but website NOT published, C u(103) suspended.
select t.as_admin();
insert into auth.users (id, email) values
  (t.u(81), 'web81@test.dev'), (t.u(82), 'web82@test.dev'), (t.u(83), 'web83@test.dev') on conflict do nothing;
insert into website_settings (company_id, is_published) values (t.u(101), true), (t.u(102), false)
  on conflict (company_id) do update set is_published = excluded.is_published;

-- A: 801 open cap 3 (+50d) | 802 draft | 803 departs in 30 min (inside 60 min cutoff) | 804 departs in 4h (open, inside 24h cancel window)
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(801), t.u(101), t.u(201), t.u(221), t.u(231), now() + interval '50 day', now() + interval '50 day 2 hours', 40, 3, 'scheduled'),
  (t.u(803), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '30 minutes', now() + interval '150 minutes', 40, 5, 'scheduled'),
  (t.u(804), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '4 hours', now() + interval '6 hours', 40, 5, 'scheduled');
insert into trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(802), t.u(101), t.u(201), now() + interval '51 day', now() + interval '51 day 2 hours', 40, 3, 'draft');

-- ===== P1: public search =====
select t.as_anon();
select t.eq('search: anon sees open A trip', (select count(*) from public.public_search_trips() where trip_id = t.u(801)), 1::bigint);
select t.eq('search: draft hidden', (select count(*) from public.public_search_trips() where trip_id = t.u(802)), 0::bigint);
select t.eq('search: inside booking cutoff hidden', (select count(*) from public.public_search_trips() where trip_id = t.u(803)), 0::bigint);
select t.eq('search: unpublished company B hidden', (select count(*) from public.public_search_trips() where company_id = t.u(102)), 0::bigint);
select t.eq('search: suspended company C hidden', (select count(*) from public.public_search_trips() where company_id = t.u(103)), 0::bigint);
select t.eq('search: departed trip hidden', (select count(*) from public.public_search_trips() where trip_id = t.u(504)), 0::bigint);
select t.eq('search: origin filter', (select count(*) from public.public_search_trips(p_origin => 'fayoum', p_destination => 'cairo') where trip_id = t.u(801)), 1::bigint);
select t.eq('search: wrong destination filter', (select count(*) from public.public_search_trips(p_destination => 'nowhere')), 0::bigint);
select t.eq('search: limit is capped at 100', (select count(*) <= 100 from public.public_search_trips(p_limit => 100000)), true);
select t.eq('search: output has NO private columns',
  (select pg_get_function_result('public.public_search_trips(text,text,date,uuid,integer,integer)'::regprocedure) !~* '(bus|driver|plate|notes|created_by|seats_booked|license|phone)'), true);
select t.eq('stops: open trip shows its own route stop only', (select array_agg(name) from public.public_trip_stops(t.u(801))), array['A stop 1']);
select t.eq('stops: hidden trip answers empty', (select count(*) from public.public_trip_stops(t.u(802))), 0::bigint);

-- anon cannot write
select t.as_anon();
select t.eq('create_my_booking: anon has no execute', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000000555')$$, t.u(801))), 5), '42501');
select t.eq('cancel_my_booking: anon has no execute', left(t.err_of(format($$select public.cancel_my_booking(%L)$$, t.u(801))), 5), '42501');
select t.eq('my_booking_details: anon has no execute', left(t.err_of($$select * from public.my_booking_details()$$), 5), '42501');

-- ===== P2/P3/P4: create =====
select t.as_user(t.u(81));
select t.eq('create: happy path total = price * seats', (select (public.create_my_booking(t.u(801), 2, 'Web 81', '+20 100 000 8181', p_idempotency_key => 'w-1'))->>'total_amount'), '80.00');
select t.as_admin();
select t.eq('create: counter moved by seats', t.seats(t.u(801)), 2);
select t.eq('create: booking is web source, created_by = caller', (select (source = 'web' and created_by = t.u(81)) from bookings where idempotency_key = 'w-1'), true);
select t.eq('create: customer row is linked to caller', (select user_id from customers where phone = '+201000008181' and company_id = t.u(101)), t.u(81));
select t.eq('create: audit row written as customer', (select count(*) from audit_logs where action = 'booking.created' and actor_type = 'customer' and actor_id = t.u(81)), 1::bigint);
select t.as_user(t.u(81));
select t.eq('replay: same key returns same booking', (select (public.create_my_booking(t.u(801), 2, 'Web 81', '+201000008181', p_idempotency_key => 'w-1'))->>'idempotent_replay'), 'true');
select t.eq('replay: different seats = conflict', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 81', '+201000008181', p_idempotency_key => 'w-1')$$, t.u(801))), 5), '23505');
select t.as_admin();
select t.eq('replay: counter not moved again', t.seats(t.u(801)), 2);

-- another user cannot replay MY key (key is scoped to the caller's own bookings)
select t.as_user(t.u(82));
select t.eq('overbooking: 2 seats requested, 1 left', t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 82', '+201000008282')$$, t.u(801))), '23514|not enough seats available');
select t.as_admin();
select t.eq('overbooking: no customer row leaked', (select count(*) from customers where phone = '+201000008282'), 0::bigint);
select t.as_user(t.u(82));
select t.eq('takeover: phone of an existing row is NOT attached', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 82', '+201000008181')$$, t.u(801))), 5), '23505');
select t.eq('create: second customer takes the last seat', (select (public.create_my_booking(t.u(801), 1, 'Web 82', '+201000008282'))->>'status'), 'confirmed');
select t.as_admin();
select t.eq('create: trip now full', t.seats(t.u(801)), 3);
select t.as_user(t.u(83));
select t.eq('overbooking: full trip', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 83', '+201000008383')$$, t.u(801))), '23514|not enough seats available');

-- hidden / foreign / unknown trips all look the same
select t.as_user(t.u(83));
select t.eq('create: draft trip', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008383')$$, t.u(802))), 21), 'P0002|trip not found');
select t.eq('create: inside cutoff', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008383')$$, t.u(803))), 21), 'P0002|trip not found');
select t.eq('create: unpublished company B trip', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008383')$$, t.u(243))), 21), 'P0002|trip not found');
select t.eq('create: unknown trip', left(t.err_of($$select public.create_my_booking(gen_random_uuid(), 1, 'x', '+201000008383')$$), 21), 'P0002|trip not found');
select t.eq('create: seats < 1', left(t.err_of(format($$select public.create_my_booking(%L, 0, 'x', '+201000008383')$$, t.u(804))), 5), '22023');
select t.eq('create: bad phone', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '12')$$, t.u(804))), 5), '22023');
select t.eq('create: seats above company max', t.err_of(format($$select public.create_my_booking(%L, 99, 'x', '+201000008383')$$, t.u(804))), '23514|seats per booking exceeded');
select t.eq('create: stop of another route rejected', t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008383', p_pickup_stop_id => %L)$$, t.u(804), t.u(212))), '23514|pickup stop does not belong to the trip route');
select t.eq('create: stop of another company rejected', t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008383', p_pickup_stop_id => %L)$$, t.u(804), t.u(213))), '23514|pickup stop does not belong to the trip route');

-- ===== read own =====
select t.as_user(t.u(81));
select t.eq('details: sees own booking with trip data', (select count(*) from public.my_booking_details() where origin_name = 'Fayoum' and destination_name = 'Cairo' and reference like 'MB-%'), 1::bigint);
select t.eq('details: can_cancel true far from departure', (select can_cancel from public.my_booking_details() limit 1), true);
select t.as_user(t.u(83));
select t.eq('details: stranger sees none', (select count(*) from public.my_booking_details()), 0::bigint);
select t.eq('details: no direct bookings select', (select t.rows('select 1 from bookings')), 0::bigint);

-- ===== P6: cancel =====
select t.as_user(t.u(83));
select t.eq('cancel: stranger gets not found', (select t.err_of(format($$select public.cancel_my_booking(%L)$$, (select id from bookings where idempotency_key = 'w-1'))) like 'P0002|%'), true);
select t.as_user(t.u(82));
select t.eq('cancel: other customer cannot cancel mine', (select t.err_of(format($$select public.cancel_my_booking(%L)$$, (select id from bookings where idempotency_key = 'w-1'))) like 'P0002|%'), true);
select t.as_admin();
select t.eq('cancel: counter untouched by failed attempts', t.seats(t.u(801)), 3);
select t.as_user(t.u(81));
select t.eq('cancel: owner cancels, seats released', (select (public.cancel_my_booking((select id from public.my_booking_details() limit 1), 'plans changed'))->>'seats_released'), '2');
select t.as_admin();
select t.eq('cancel: counter = 1', t.seats(t.u(801)), 1);
select t.as_user(t.u(81));
select t.eq('cancel: repeat is a harmless no-op', (select (public.cancel_my_booking((select id from public.my_booking_details() limit 1)))->>'already_cancelled'), 'true');
select t.as_admin();
select t.eq('cancel: counter still 1 after repeat', t.seats(t.u(801)), 1);
select t.eq('cancel: seat_drift empty', (select count(*) from app_private.seat_drift()), 0::bigint);

-- inside the cancellation window (24h) the customer can book but not self-cancel
select t.as_user(t.u(81));
select t.eq('window: booking inside window is allowed', (select (public.create_my_booking(t.u(804), 1, 'Web 81', '+201000008181'))->>'status'), 'confirmed');
select t.eq('window: can_cancel false', (select can_cancel from public.my_booking_details() where trip_id = t.u(804)), false);
select t.eq('window: cancel refused', t.err_of(format($$select public.cancel_my_booking(%L)$$, (select id from public.my_booking_details() where trip_id = t.u(804)))), '23514|cancellation window closed');

-- ===== suspension / switches =====
select t.as_admin();
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 't' where id = t.u(101);
select t.as_anon();
select t.eq('suspended: search empty', (select count(*) from public.public_search_trips(p_company_id => t.u(101))), 0::bigint);
select t.as_user(t.u(81));
select t.eq('suspended: create refused', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008181')$$, t.u(801))), 21), 'P0002|trip not found');
select t.eq('suspended: own booking list empty', (select count(*) from public.my_booking_details(t.u(101))), 0::bigint);
select t.as_admin();
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(101);

update company_settings set booking_enabled = false where company_id = t.u(101);
select t.as_anon();
select t.eq('booking_enabled=false: search empty', (select count(*) from public.public_search_trips(p_company_id => t.u(101))), 0::bigint);
select t.as_admin();
update company_settings set booking_enabled = true where company_id = t.u(101);

update website_settings set is_published = false where company_id = t.u(101);
select t.as_anon();
select t.eq('website unpublished: search empty', (select count(*) from public.public_search_trips(p_company_id => t.u(101))), 0::bigint);
select t.as_admin();
update website_settings set is_published = true where company_id = t.u(101);
select t.as_anon();
select t.eq('restored: search works again', (select count(*) from public.public_search_trips(p_company_id => t.u(101)) where trip_id = t.u(801)), 1::bigint);

-- ===== structural guards still hold =====
select t.as_admin();
select t.eq('tenant_guard: no unguarded tables', (select count(*) from app_private.tenant_guard_problems()), 0::bigint);
select t.eq('seat_drift: none', (select count(*) from app_private.seat_drift()), 0::bigint);
