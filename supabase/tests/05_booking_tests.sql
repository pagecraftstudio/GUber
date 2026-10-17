-- 05: booking RPC suite (0010). Requires 01 fixtures. Sequential checks; true concurrency is in the vitest integration suite.
create table if not exists t.marks (name text primary key, id int);
alter table t.marks disable row level security;   -- Supabase enables RLS on new tables by default
grant all on t.marks to anon, authenticated;
delete from t.marks where name = '05';
insert into t.marks select '05', coalesce(max(id), 0) from t.results;
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.seats(p_trip uuid) returns int language sql security definer as $$ select seats_booked::int from public.trips where id = p_trip $$;

select t.as_admin();
-- Fixture trips from 01 are dated relative to the day 01 was RUN. Re-date them so this file works days later too.
update trips set departure_at = date_trunc('day', now()) + interval '1 day 8 hours',
                 arrival_at   = date_trunc('day', now()) + interval '1 day 10 hours'
 where id in (t.u(241), t.u(242), t.u(243));
insert into auth.users (id, email) values (t.u(41), 'bk41@test.dev') on conflict do nothing;
-- trips for this suite: A: T1 capacity 5 (scheduled), T2 draft, T3 cancelled, T4 departed (past, still scheduled), T5 completed
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(501), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '20 day', now() + interval '20 day 2 hours', 30, 5, 'scheduled');
insert into trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(502), t.u(101), t.u(201), now() + interval '21 day', now() + interval '21 day 2 hours', 30, 5, 'draft');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(506), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '30 day', now() + interval '30 day 2 hours', 30, 20, 'scheduled'),
  (t.u(503), t.u(101), t.u(201), t.u(221), t.u(231), now() + interval '22 day', now() + interval '22 day 2 hours', 30, 5, 'cancelled'),
  (t.u(504), t.u(101), t.u(201), t.u(222), t.u(232), now() - interval '2 hours', now() + interval '1 hour', 30, 5, 'scheduled'),
  (t.u(505), t.u(101), t.u(201), t.u(221), t.u(231), now() - interval '2 day', now() - interval '2 day' + interval '1 hour', 30, 5, 'completed');

-- ===== create =====
select t.as_user(t.u(5));   -- booking staff A
select t.eq('create: confirmed booking, price snapshot, total', (select (public.create_booking(t.u(501), 'Sara', '+20 100 000 1111', 2, p_idempotency_key => 'k-1'))->>'total_amount'), '60.00');
select t.eq('create: counter moved by seats', t.seats(t.u(501)), 2);
select t.eq('create: phone normalised on the way in', (select phone from customers where full_name = 'Sara'), '+201000001111');
select t.eq('replay: same key returns same booking', (select (public.create_booking(t.u(501), 'Sara', '+201000001111', 2, p_idempotency_key => 'k-1'))->>'idempotent_replay'), 'true');
select t.eq('replay: counter NOT moved again', t.seats(t.u(501)), 2);
select t.eq('replay: different seats under same key = conflict', left(t.err_of($$select public.create_booking(t.u(501), 'Sara', '+201000001111', 3, p_idempotency_key => 'k-1')$$), 5), '23505');
select t.eq('replay: different phone under same key = conflict', left(t.err_of($$select public.create_booking(t.u(501), 'Other', '+201000009999', 2, p_idempotency_key => 'k-1')$$), 5), '23505');
select t.eq('create: pending also reserves seats', (select (public.create_booking(t.u(501), 'Pat', '+201000002222', 1, p_status => 'pending'))->>'status'), 'pending');
select t.eq('create: counter = 3', t.seats(t.u(501)), 3);
select t.eq('overbooking: 3 seats requested, 2 left', t.err_of($$select public.create_booking(t.u(501), 'Big', '+201000003333', 3)$$), '23514|not enough seats available');
select t.eq('overbooking: nothing changed, no customer leaked', (select count(*) from customers where phone = '+201000003333'), 0::bigint);
select t.eq('fill the last 2 seats', (select (public.create_booking(t.u(501), 'Last', '+201000004444', 2))->>'seats_count'), '2');
select t.eq('full trip: counter = capacity', t.seats(t.u(501)), 5);
select t.eq('full trip rejects one more seat', t.err_of($$select public.create_booking(t.u(501), 'Late', '+201000005555', 1)$$), '23514|not enough seats available');
select t.eq('max_seats_per_booking (4) enforced', t.err_of($$select public.create_booking(t.u(506), 'X', '+201000006666', 5)$$), '23514|seats per booking exceeded');
select t.eq('seats = 0 is invalid input', left(t.err_of($$select public.create_booking(t.u(501), 'X', '+201000006666', 0)$$), 5), '22023');
select t.eq('local number without country is rejected (never guessed)', left(t.err_of($$select public.create_booking(t.u(501), 'X', '01012345678', 1)$$), 5), '22023');
select t.eq('empty name is invalid', left(t.err_of($$select public.create_booking(t.u(501), '   ', '+201000006666', 1)$$), 5), '22023');

-- ===== invalid trip states =====
select t.eq('draft trip not bookable', t.err_of($$select public.create_booking(t.u(502), 'X', '+201000007777', 1)$$), '23514|trip is not open for booking');
select t.eq('cancelled trip not bookable', t.err_of($$select public.create_booking(t.u(503), 'X', '+201000007777', 1)$$), '23514|trip is not open for booking');
select t.eq('completed trip not bookable', t.err_of($$select public.create_booking(t.u(505), 'X', '+201000007777', 1)$$), '23514|trip is not open for booking');
select t.eq('departed (still scheduled) trip not bookable', t.err_of($$select public.create_booking(t.u(504), 'X', '+201000007777', 1)$$), '23514|trip already departed');
select t.eq('pickup stop from another route rejected', t.err_of($$select public.create_booking(t.u(504), 'X', '+201000007777', 1, p_pickup_stop_id => t.u(212))$$) like '23514|%', true);

-- ===== cancel: releases capacity exactly once =====
select t.as_user(t.u(5));
select t.eq('cancel: releases the pending 1-seat booking', (select (public.cancel_booking((select id from bookings where trip_id = t.u(501) and status = 'pending'), 'changed mind'))->>'seats_released'), '1');
select t.eq('cancel: counter back to 4', t.seats(t.u(501)), 4);
select t.eq('cancel again: already_cancelled, nothing released', (select (public.cancel_booking((select id from bookings where trip_id = t.u(501) and status = 'cancelled')))->>'already_cancelled'), 'true');
select t.eq('cancel again x3: still a no-op', (select count(*) from (select public.cancel_booking((select id from bookings where trip_id = t.u(501) and status = 'cancelled' limit 1)) from generate_series(1, 3)) q), 3::bigint);
select t.eq('...counter still 4', t.seats(t.u(501)), 4);
select t.eq('freed seat can be booked again', (select (public.create_booking(t.u(501), 'Again', '+201000008888', 1))->>'status'), 'confirmed');
select t.eq('counter = capacity again', t.seats(t.u(501)), 5);
select t.eq('cancelled booking cannot be revived (DB)', (select left(t.err_of(format('update bookings set status = ''confirmed'' where id = %L', (select id from bookings where status = 'cancelled' and trip_id = t.u(501) limit 1))), 5)), '42501');
select t.as_admin();
select t.eq('revive blocked even for the table owner (state machine)', left(t.err_of(format('update bookings set status = ''confirmed'' where id = %L', (select id from bookings where status = 'cancelled' and trip_id = t.u(501) limit 1))), 5), '23514');
select t.eq('delete blocked even for the table owner', left(t.err_of($$delete from bookings where trip_id = t.u(501)$$), 5), '23514');
select t.eq('seats_count immutable', left(t.err_of($$update bookings set seats_count = 1, total_amount = 30 where trip_id = t.u(501) and status = 'confirmed'$$), 5), '23514');
select t.eq('direct table cancel (owner SQL, not the RPC) succeeds at table level', t.err_of($$update bookings set status = 'cancelled' where id = (select id from bookings where status = 'confirmed' and trip_id = t.u(501) order by created_at limit 1)$$), 'NO ERROR');
select t.eq('...and the trigger released exactly that booking''s seats', t.seats(t.u(501)), (select coalesce(sum(seats_count), 0)::int from bookings where trip_id = t.u(501) and status <> 'cancelled'));
select t.eq('no drift anywhere after all of the above', (select count(*) from app_private.seat_drift()), 0::bigint);

-- ===== authorization =====
select t.as_user(t.u(4));   -- operations: bookings.read only
select t.eq('operations cannot create booking', t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), 'P0002|trip not found');
select t.as_user(t.u(6));   -- driver
select t.eq('driver cannot create booking', t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), 'P0002|trip not found');
select t.as_user(t.u(7));   -- owner of company B
select t.eq('other tenant cannot book A trip (same answer as a ghost trip)', t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), t.err_of($$select public.create_booking(gen_random_uuid(), 'X', '+201000009001', 1)$$));
select t.eq('other tenant: not found', t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), 'P0002|trip not found');
select t.as_admin();
create table if not exists t.ids (name text primary key, id uuid);
alter table t.ids disable row level security;   -- Supabase enables RLS on new tables by default
grant all on t.ids to anon, authenticated;
delete from t.ids where name = 'a_booking';
insert into t.ids select 'a_booking', id from bookings where trip_id = t.u(501) and status = 'confirmed' limit 1;
select t.as_user(t.u(7));
select t.eq('other tenant cancel of A booking == ghost booking answer', t.err_of(format('select public.cancel_booking(%L)', (select id from t.ids where name = 'a_booking'))), t.err_of($$select public.cancel_booking(gen_random_uuid())$$));
select t.eq('...and it is plain not-found', t.err_of(format('select public.cancel_booking(%L)', (select id from t.ids where name = 'a_booking'))), 'P0002|booking not found');
select t.eq('other tenant cannot change A booking payment status', left(t.err_of(format('select public.set_booking_payment_status(%L, ''paid'')', (select id from t.ids where name = 'a_booking'))), 5), 'P0002');
select t.eq('other tenant cannot change booking status', left(t.err_of($$select public.set_booking_status(gen_random_uuid(), 'confirmed')$$), 5), 'P0002');
select t.as_user(t.u(8));   -- suspended company C
select t.eq('suspended company cannot book', left(t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), 5), 'P0002');
select t.as_anon();
select t.eq('anon cannot call create_booking', left(t.err_of($$select public.create_booking(t.u(501), 'X', '+201000009001', 1)$$), 5), '42501');
select t.eq('anon cannot call cancel_booking', left(t.err_of($$select public.cancel_booking(gen_random_uuid())$$), 5), '42501');

-- ===== no direct writes for anybody, platform staff included =====
select t.as_user(t.u(2));
select t.eq('owner cannot INSERT bookings directly', left(t.err_of($$insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values (t.u(101), 'MB-DIRECT', t.u(501), t.u(251), 1, 30, 30, 'EGP', 'confirmed', 'staff')$$), 5), '42501');
select t.eq('owner cannot UPDATE bookings directly', left(t.err_of($$update bookings set status = 'cancelled' where trip_id = t.u(501)$$), 5), '42501');
select t.eq('owner cannot DELETE bookings', left(t.err_of($$delete from bookings where trip_id = t.u(501)$$), 5), '42501');
select t.eq('owner cannot write seats_booked', left(t.err_of($$update trips set seats_booked = 0 where id = t.u(501)$$), 5), '42501');
select t.as_user(t.u(1));   -- platform super_admin
select t.eq('super_admin cannot UPDATE bookings directly', left(t.err_of($$update bookings set status = 'cancelled' where trip_id = t.u(501)$$), 5), '42501');
select t.eq('super_admin cannot write seats_booked', left(t.err_of($$update trips set seats_booked = 0 where id = t.u(501)$$), 5), '42501');
select t.eq('super_admin cannot write booking_payments directly', left(t.err_of($$insert into booking_payments (company_id, booking_id, amount, currency, method, status) values (t.u(101), t.u(261), 1, 'EGP', 'cash', 'succeeded')$$), 5), '42501');

-- ===== customer handling =====
select t.as_user(t.u(5));
select t.eq('existing customer keeps the original name', (select (public.create_booking(t.u(506), 'Different Name', '+201111111111', 1, p_customer_email => 'cust.a@x.dev'))->>'status'), 'confirmed');
select t.eq('...name not overwritten', (select full_name from customers where id = t.u(251)), 'Cust A');
select t.eq('...empty email filled in', (select email::text from customers where id = t.u(251)), 'cust.a@x.dev');
select t.eq('same phone as a B customer creates a separate A customer', (select count(*) from customers where phone = '+201222222222'), 0::bigint);
select t.eq('create with that phone', (select (public.create_booking(t.u(506), 'Phone Twin', '+201222222222', 1))->>'status'), 'confirmed');
select t.as_admin();
select t.eq('two customers (A and B) now share the phone, isolated by company', (select count(distinct company_id) from customers where phone = '+201222222222'), 2::bigint);
select t.as_user(t.u(5));
select t.eq('Arabic-Indic digits accepted', (select (public.create_booking(t.u(506), 'Arabic', '+٢٠١٠٠٠٠٠٣٣٣٣', 1))->>'status'), 'confirmed');
select t.as_admin();
select t.eq('...stored as ASCII E.164', (select count(*) from customers where phone = '+201000003333' and company_id = t.u(101)), 1::bigint);

-- ===== status + payment =====
select t.as_user(t.u(5));
select t.eq('pending -> confirmed', (select (public.set_booking_status(((public.create_booking(t.u(506), 'Pend', '+201000011111', 1, p_status => 'pending'))->>'id')::uuid, 'confirmed'))->>'status'), 'confirmed');
select t.eq('confirm again is a no-op', (select (public.set_booking_status((select id from bookings where trip_id = t.u(501) and status = 'confirmed' limit 1), 'confirmed'))->>'changed'), 'false');
select t.eq('complete before the trip starts is refused', t.err_of(format('select public.set_booking_status(%L, ''completed'')', (select id from bookings where trip_id = t.u(501) and status = 'confirmed' limit 1))), '23514|trip has not started');
select t.eq('payment toggle works', (select (public.set_booking_payment_status((select id from bookings where trip_id = t.u(501) and status = 'confirmed' limit 1), 'paid'))->>'payment_status'), 'paid');
select t.eq('cannot mark a cancelled booking paid', left(t.err_of(format('select public.set_booking_payment_status(%L, ''paid'')', (select id from bookings where trip_id = t.u(501) and status = 'cancelled' limit 1))), 5), '23514');
select t.eq('invalid payment status', left(t.err_of($$select public.set_booking_payment_status(gen_random_uuid(), 'bogus')$$), 5), '22023');

-- ===== audit + plan limit =====
select t.as_admin();
select t.eq('booking.created and booking.cancelled are audited', (select count(distinct action) from audit_logs where action in ('booking.created', 'booking.cancelled')), 2::bigint);
update plan_entitlements set int_value = 3 where key = 'max_bookings_per_month' and plan_id = (select id from plans where code = 'starter');
select t.as_user(t.u(7));
select t.eq('B booking 1 ok', (select (public.create_booking(t.u(243), 'Bee', '+201000010001', 1))->>'status'), 'confirmed');
select t.eq('B booking 2 ok', (select (public.create_booking(t.u(243), 'Bee2', '+201000010002', 1))->>'status'), 'confirmed');
select t.eq('B booking 3 blocked by monthly plan limit', left(t.err_of($$select public.create_booking(t.u(243), 'Bee3', '+201000010003', 1)$$), 5), '53400');
select t.as_admin();
update plan_entitlements set int_value = 2000 where key = 'max_bookings_per_month' and plan_id = (select id from plans where code = 'starter');
select t.eq('final: no seat drift anywhere', (select count(*) from app_private.seat_drift()), 0::bigint);

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '05');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '05') order by id;
