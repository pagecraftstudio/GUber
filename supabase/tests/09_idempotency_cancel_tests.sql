-- 09: create_my_booking idempotency (0013b) + customer cancellation semantics (0013). Requires 01 fixtures, 05 (t.err_of, t.seats), 08.
-- Trips: 901 cap 4 (+60d)   902 cap 2 (+62d)   903 cap 3 (+61d, other stop tests)   904 (+2h from now+? inside cutoff-free, window test)
-- lookup helper: customers cannot SELECT bookings directly (by design), so tests resolve ids as the table owner
create or replace function t.bid(k text) returns uuid language sql security definer as $$ select id from public.bookings where idempotency_key = k $$;
grant execute on function t.bid(text) to authenticated, anon;
select t.as_admin();
insert into auth.users (id, email) values (t.u(84), 'web84@test.dev'), (t.u(85), 'web85@test.dev') on conflict do nothing;
-- dedicated bus + driver: fixture trips sit at fixed clock times, so reusing their bus/driver makes this suite time-of-day dependent
insert into buses (id, company_id, plate_number, capacity) values (t.u(929), t.u(101), 'T9-BUS', 20);
insert into drivers (id, company_id, full_name, phone) values (t.u(939), t.u(101), 'T9 driver', '+201000009999');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(901), t.u(101), t.u(201), t.u(929), t.u(939), now() + interval '90 day', now() + interval '90 day 2 hours', 40, 4, 'scheduled'),
  (t.u(902), t.u(101), t.u(201), t.u(929), t.u(939), now() + interval '92 day', now() + interval '92 day 2 hours', 40, 2, 'scheduled'),
  (t.u(903), t.u(101), t.u(201), t.u(929), t.u(939), now() + interval '91 day', now() + interval '91 day 2 hours', 40, 3, 'scheduled'),
    (t.u(905), t.u(101), t.u(201), t.u(929), t.u(939), now() + interval '23 hours', now() + interval '25 hours', 40, 5, 'scheduled'),
  (t.u(906), t.u(101), t.u(201), t.u(929), t.u(939), now() + interval '30 hours', now() + interval '32 hours', 40, 5, 'scheduled');

-- ===== idempotency: replay =====
select t.as_user(t.u(84));
select t.eq('idem: first call creates', (select (public.create_my_booking(t.u(901), 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => ' hi '))->>'idempotent_replay'), 'false');
select t.eq('idem: replay returns original id', (select (public.create_my_booking(t.u(901), 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'hi'))->>'id'),
  t.bid('i-1')::text);
select t.eq('idem: replay flagged', (select (public.create_my_booking(t.u(901), 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'hi'))->>'idempotent_replay'), 'true');
select t.as_admin();
select t.eq('idem: exactly one booking row', (select count(*) from bookings where idempotency_key = 'i-1'), 1::bigint);
select t.eq('idem: counter moved once', t.seats(t.u(901)), 2);

-- ===== idempotency: materially different input is rejected (and moves nothing) =====
select t.as_user(t.u(84));
select t.eq('idem: other seats', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(901))), 5), '23505');
select t.eq('idem: other trip', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(903))), 5), '23505');
select t.eq('idem: other pickup stop', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_pickup_stop_id => %L, p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(901), t.u(211))), 5), '23505');
select t.eq('idem: other dropoff stop', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_dropoff_stop_id => %L, p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(901), t.u(211))), 5), '23505');
select t.eq('idem: other notes', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'different')$$, t.u(901))), 5), '23505');
select t.eq('idem: notes dropped', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_idempotency_key => 'i-1')$$, t.u(901))), 5), '23505');
select t.eq('idem: conflict message is neutral', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 84', '+201000008484', p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(901))), '23505|idempotency key reused with a different request');
select t.as_admin();
select t.eq('idem: rejected reuse did not move counter', t.seats(t.u(901)), 2);
select t.eq('idem: rejected reuse did not add rows', (select count(*) from bookings where idempotency_key = 'i-1'), 1::bigint);

-- same key + same input + stop both ways (stop equality incl. non-null)
select t.as_user(t.u(85));
select t.eq('idem: stops, first call', (select (public.create_my_booking(t.u(903), 1, 'Web 85', '+201000008585', p_pickup_stop_id => t.u(211), p_dropoff_stop_id => t.u(211), p_idempotency_key => 'i-2'))->>'idempotent_replay'), 'false');
select t.eq('idem: stops, replay', (select (public.create_my_booking(t.u(903), 1, 'Web 85', '+201000008585', p_pickup_stop_id => t.u(211), p_dropoff_stop_id => t.u(211), p_idempotency_key => 'i-2'))->>'idempotent_replay'), 'true');
select t.eq('idem: stops, dropped pickup is a different request', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 85', '+201000008585', p_dropoff_stop_id => %L, p_idempotency_key => 'i-2')$$, t.u(903), t.u(211))), 5), '23505');

-- ===== idempotency: ownership / tenant isolation of keys =====
select t.as_user(t.u(83));
select t.eq('idem: another customer cannot replay my key', t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 83', '+201000008383', p_idempotency_key => 'i-1', p_notes => 'hi')$$, t.u(901))), '23505|idempotency key reused with a different request');
select t.as_admin();
select t.eq('idem: foreign replay attempt created nothing', (select count(*) from customers where phone = '+201000008383' and company_id = t.u(101)), 0::bigint);
select t.eq('idem: foreign replay attempt did not move counter', t.seats(t.u(901)), 2);
-- a staff booking holds a key in the same company: customer gets the same neutral conflict, never the staff booking
select t.as_user(t.u(5));
select t.eq('idem: staff booking with key', (select (public.create_booking(t.u(902), 'Staff Cust', '+201000007777', 1, p_idempotency_key => 'i-staff'))->>'idempotent_replay'), 'false');
select t.as_user(t.u(83));
select t.eq('idem: customer cannot replay staff key', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 83', '+201000008383', p_idempotency_key => 'i-staff')$$, t.u(902))), '23505|idempotency key reused with a different request');
-- the same key text is independent per company: an empty key means "no idempotency"
select t.as_user(t.u(84));
select t.eq('idem: blank key is not a key (two bookings allowed)', (select count(*) from (select public.create_my_booking(t.u(903), 1, 'Web 84', '+201000008484', p_idempotency_key => '  ') union all select public.create_my_booking(t.u(903), 1, 'Web 84', '+201000008484', p_idempotency_key => '  ')) q), 2::bigint);
select t.as_admin();
select t.eq('idem: blank key rows have null key', (select count(*) from bookings where trip_id = t.u(903) and customer_id = (select id from customers where user_id = t.u(84) and company_id = t.u(101)) and idempotency_key is null), 2::bigint);
select t.eq('idem: seat_drift none', (select count(*) from app_private.seat_drift()), 0::bigint);

-- replay of a booking that capacity would now refuse must still return the original (no new capacity check)
select t.as_user(t.u(81));
select t.eq('idem: fill trip 902 (staff 1 + customer 1)', (select (public.create_my_booking(t.u(902), 1, 'Web 81', '+201000008181', p_idempotency_key => 'i-3'))->>'idempotent_replay'), 'false');
select t.eq('idem: trip 902 is full for new keys', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 81', '+201000008181', p_idempotency_key => 'i-3b')$$, t.u(902))), '23514|not enough seats available');
select t.eq('idem: replay on a full trip still returns the original', (select (public.create_my_booking(t.u(902), 1, 'Web 81', '+201000008181', p_idempotency_key => 'i-3'))->>'idempotent_replay'), 'true');

-- ===== cancellation semantics =====
-- 906 departs in 30h (outside 24h window): cancellable. 905 departs in 23h (inside): booking allowed, cancel refused.
select t.as_user(t.u(84));
select t.eq('cancel: book 906 x2', (select (public.create_my_booking(t.u(906), 2, 'Web 84', '+201000008484', p_idempotency_key => 'c-1'))->>'status'), 'confirmed');
select t.eq('cancel: details say can_cancel', (select can_cancel from public.my_booking_details() where trip_id = t.u(906)), true);
select t.as_admin();
select t.eq('cancel: counter 2 before cancel', t.seats(t.u(906)), 2);
select t.as_user(t.u(85));
select t.eq('cancel: other customer refused (P0002)', left(t.err_of(format($$select public.cancel_my_booking(%L)$$, t.bid('c-1'))), 6), 'P0002|');
select t.as_anon();
select t.eq('cancel: anon refused (42501)', left(t.err_of(format($$select public.cancel_my_booking(%L)$$, t.bid('c-1'))), 5), '42501');
select t.as_user(t.u(5));
select t.eq('cancel: booking staff is not the owner (P0002)', left(t.err_of(format($$select public.cancel_my_booking(%L)$$, t.bid('c-1'))), 6), 'P0002|');
select t.as_admin();
select t.eq('cancel: failed attempts moved nothing', t.seats(t.u(906)), 2);
select t.as_user(t.u(84));
select t.eq('cancel: owner cancels, releases 2', (select (public.cancel_my_booking(t.bid('c-1'), 'r'))->>'seats_released'), '2');
select t.eq('cancel: repeat releases 0', (select (public.cancel_my_booking(t.bid('c-1')))->>'seats_released'), '0');
select t.eq('cancel: repeat flagged already_cancelled', (select (public.cancel_my_booking(t.bid('c-1')))->>'already_cancelled'), 'true');
select t.as_admin();
select t.eq('cancel: counter back to 0, released exactly once', t.seats(t.u(906)), 0);
select t.eq('cancel: audit written once', (select count(*) from audit_logs where action = 'booking.cancelled' and entity_id = t.bid('c-1')), 1::bigint);
select t.eq('cancel: row records who/when/reason', (select (cancelled_by = t.u(84) and cancelled_at is not null and cancellation_reason = 'r') from bookings where idempotency_key = 'c-1'), true);
select t.eq('cancel: seat_drift none', (select count(*) from app_private.seat_drift()), 0::bigint);
-- cancelled booking replay keeps the truth (status) and does not re-consume seats
select t.as_user(t.u(84));
select t.eq('cancel: replay of cancelled booking does not re-book', (select (public.create_my_booking(t.u(906), 2, 'Web 84', '+201000008484', p_idempotency_key => 'c-1'))->>'status'), 'cancelled');
select t.as_admin();
select t.eq('cancel: still 0 seats used after replay', t.seats(t.u(906)), 0);

-- window enforcement
select t.as_user(t.u(85));
select t.eq('window: book 905 (23h) allowed', (select (public.create_my_booking(t.u(905), 1, 'Web 85', '+201000008585', p_idempotency_key => 'c-2'))->>'status'), 'confirmed');
select t.eq('window: can_cancel false', (select can_cancel from public.my_booking_details() where trip_id = t.u(905)), false);
select t.eq('window: cancel refused', t.err_of(format($$select public.cancel_my_booking(%L)$$, t.bid('c-2'))), '23514|cancellation window closed');
select t.as_admin();
select t.eq('window: refused cancel kept the seat', t.seats(t.u(905)), 1);
update company_settings set cancellation_window_hours = 22 where company_id = t.u(101);
select t.as_user(t.u(85));
select t.eq('window: shorter company window (22h) makes 23h-out cancellable', (select can_cancel from public.my_booking_details() where trip_id = t.u(905)), true);
select t.eq('window: cancel now succeeds', (select (public.cancel_my_booking(t.bid('c-2')))->>'seats_released'), '1');
select t.as_admin();
update company_settings set cancellation_window_hours = 24 where company_id = t.u(101);
select t.eq('window: released once', t.seats(t.u(905)), 0);

-- closed / departed / completed states
select t.as_admin();
select t.eq('seat_drift: none at end', (select count(*) from app_private.seat_drift()), 0::bigint);
