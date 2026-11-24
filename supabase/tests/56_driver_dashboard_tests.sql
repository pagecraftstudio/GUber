-- 56: P7b driver dashboard backend (migration 0060). NOT RUN when written. Needs 01 fixtures (company A u(101), route u(201), users u(2) ownerA), 05 (t.err_of).
-- Own fixtures: driver users u(5661) / u(5662) in company A, driver user u(5663) in company B (route u(203)), fresh buses and trips (ids 56xx).
-- Bookings are inserted while the trips are still future 'scheduled' (the booking trigger demands it); the trips are then re-dated and moved.
select t.as_admin();
update subscriptions set plan_id = (select id from plans where code = 'professional') where company_id in (t.u(101), t.u(102));
insert into auth.users (id, email) values (t.u(5661), 'drv56a@test.dev'), (t.u(5662), 'drv56b@test.dev'), (t.u(5663), 'drv56c@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id)
select v.c, t.u(v.u), r.id from (values (t.u(101), 5661), (t.u(101), 5662), (t.u(102), 5663)) v(c, u) join roles r on r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values
  (t.u(5611), t.u(101), 'T56-1', 20), (t.u(5612), t.u(101), 'T56-2', 20), (t.u(5613), t.u(101), 'T56-3', 20), (t.u(5614), t.u(101), 'T56-4', 20),
  (t.u(5615), t.u(101), 'T56-5', 20), (t.u(5616), t.u(101), 'T56-6', 20), (t.u(5617), t.u(102), 'T56-7', 20);
insert into drivers (id, company_id, user_id, full_name, phone, license_number, license_expiry) values
  (t.u(5621), t.u(101), t.u(5661), 'T56 driver one', '+201000056001', 'LIC-56-1', current_date + 10),
  (t.u(5622), t.u(101), t.u(5662), 'T56 driver two', '+201000056002', null, null),
  (t.u(5623), t.u(102), t.u(5663), 'T56 driver B',   '+201000056003', null, null);
-- all trips start as far-future scheduled trips; windows chosen so no driver or bus overlaps itself after re-dating
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(5601), t.u(101), t.u(201), t.u(5611), t.u(5621), now() + interval '200 days', now() + interval '200 days 2 hours', 40, 10, 'scheduled'),   -- not started yet
  (t.u(5602), t.u(101), t.u(201), t.u(5612), t.u(5621), now() + interval '201 days', now() + interval '201 days 2 hours', 40, 10, 'scheduled'),   -- manifest + end trip (driver one)
  (t.u(5603), t.u(101), t.u(201), t.u(5613), t.u(5622), now() + interval '202 days', now() + interval '202 days 2 hours', 40, 10, 'scheduled'),   -- driver two's trip
  (t.u(5604), t.u(102), t.u(203), t.u(5617), t.u(5623), now() + interval '203 days', now() + interval '203 days 2 hours', 40, 10, 'scheduled'),   -- company B
  (t.u(5605), t.u(101), t.u(201), t.u(5614), t.u(5621), now() + interval '204 days', now() + interval '204 days 2 hours', 40, 10, 'scheduled'),   -- boarding, ended by driver
  (t.u(5606), t.u(101), t.u(201), t.u(5615), t.u(5622), now() + interval '205 days', now() + interval '205 days 2 hours', 40, 10, 'scheduled'),   -- staff completes it
  (t.u(5607), t.u(101), t.u(201), t.u(5616), t.u(5621), now() + interval '206 days', now() + interval '206 days 2 hours', 40, 10, 'scheduled'),   -- auto-close: boarding, overdue
  (t.u(5608), t.u(101), t.u(201), t.u(5611), t.u(5622), now() + interval '207 days', now() + interval '207 days 2 hours', 40, 10, 'scheduled'),   -- auto-close: in_progress, overdue
  (t.u(5609), t.u(101), t.u(201), t.u(5612), t.u(5622), now() + interval '208 days', now() + interval '208 days 2 hours', 40, 10, 'scheduled'),   -- auto-close: still scheduled, overdue (must stay)
  (t.u(5610), t.u(101), t.u(201), t.u(5613), t.u(5621), now() + interval '209 days', now() + interval '209 days 2 hours', 40, 10, 'scheduled');   -- auto-close: boarding, NOT overdue (must stay)
insert into customers (id, company_id, full_name, phone) values
  (t.u(5631), t.u(101), 'Manifest Alpha', '+201000056101'), (t.u(5632), t.u(101), 'Manifest Beta', '+201000056102'),
  (t.u(5633), t.u(101), 'Manifest Pending', '+201000056103'), (t.u(5634), t.u(101), 'Manifest Cancelled', '+201000056104');
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values
  (t.u(5641), t.u(101), 'T56-B1', t.u(5602), t.u(5631), 2, 40, 80, 'EGP', 'confirmed', 'staff'),
  (t.u(5642), t.u(101), 'T56-B2', t.u(5602), t.u(5632), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5643), t.u(101), 'T56-B3', t.u(5602), t.u(5633), 1, 40, 40, 'EGP', 'pending',   'staff'),
  (t.u(5644), t.u(101), 'T56-B4', t.u(5602), t.u(5634), 1, 40, 40, 'EGP', 'confirmed', 'staff');
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source, cancelled_at) values
  (t.u(5645), t.u(101), 'T56-B5', t.u(5602), t.u(5634), 1, 40, 40, 'EGP', 'cancelled', 'staff', now());
insert into tickets (id, company_id, booking_id, trip_id, ticket_index, token_hash, status, boarded_at, boarded_driver_id) values
  (t.u(5651), t.u(101), t.u(5641), t.u(5602), 1, decode(md5('56a') || md5('56a'), 'hex'), 'boarded', now(), t.u(5621)),
  (t.u(5652), t.u(101), t.u(5641), t.u(5602), 2, decode(md5('56b') || md5('56b'), 'hex'), 'valid', null, null),
  (t.u(5653), t.u(101), t.u(5642), t.u(5602), 1, decode(md5('56c') || md5('56c'), 'hex'), 'valid', null, null);
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values
  (t.u(5646), t.u(101), 'T56-B6', t.u(5605), t.u(5631), 1, 40, 40, 'EGP', 'confirmed', 'staff');
-- re-date and move the trips to their test states
update trips set departure_at = now() - interval '3 hours',  arrival_at = now() + interval '1 hour',  status = 'in_progress' where id = t.u(5602);
update trips set departure_at = now() - interval '3 hours',  arrival_at = now() + interval '1 hour' where id = t.u(5603);
update trips set status = 'in_progress' where id = t.u(5603);
update trips set departure_at = now() - interval '3 hours',  arrival_at = now() + interval '1 hour' where id = t.u(5604);
update trips set departure_at = now() - interval '2 hours',  arrival_at = now() + interval '2 hours', status = 'boarding' where id = t.u(5605);
update trips set departure_at = now() - interval '2 hours',  arrival_at = now() + interval '2 hours', status = 'in_progress' where id = t.u(5606);
update trips set departure_at = now() - interval '12 hours', arrival_at = now() - interval '9 hours', status = 'boarding' where id = t.u(5607);
update trips set departure_at = now() - interval '12 hours', arrival_at = now() - interval '9 hours', status = 'in_progress' where id = t.u(5608);
update trips set departure_at = now() - interval '12 hours', arrival_at = now() - interval '9 hours' where id = t.u(5609);
update trips set departure_at = now() - interval '2 hours',  arrival_at = now() - interval '30 minutes', status = 'boarding' where id = t.u(5610);
create or replace function t.cnt56(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
grant execute on function t.cnt56(text) to authenticated, anon;
create or replace function t.st56(p_trip uuid) returns text language sql security definer as $$ select status from public.trips where id = p_trip $$;
grant execute on function t.st56(uuid) to authenticated, anon;

-- 1. manifest -------------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5661));
select t.eq('manifest: the assigned driver sees the two confirmed bookings, not the pending, cancelled or other-status ones',
  (select count(*) from public.driver_trip_manifest(t.u(5602))), 3::bigint);   -- B1, B2 and B4 (confirmed); B3 pending and B5 cancelled are out
select t.eq('manifest: boarded count per booking', (select seats_boarded from public.driver_trip_manifest(t.u(5602)) where reference = 'T56-B1'), 1::bigint);
select t.eq('manifest: seats and name come from the booking and customer', (select seats::int || ':' || passenger_name from public.driver_trip_manifest(t.u(5602)) where reference = 'T56-B1'), '2:Manifest Alpha');
select t.eq('manifest: NO phone, email, price or payment column is returned',
  (select proargnames::text from pg_proc where proname = 'driver_trip_manifest' and pronamespace = 'public'::regnamespace),
  '{p_trip_id,booking_id,reference,passenger_name,seats,seats_boarded,is_subscriber,pickup_stop,dropoff_stop}');
select t.eq('manifest: P0002 for a colleague''s trip', left(t.err_of(format($q$select * from public.driver_trip_manifest(%L)$q$, t.u(5603))), 5), 'P0002');
select t.eq('manifest: P0002 for another company''s trip', left(t.err_of(format($q$select * from public.driver_trip_manifest(%L)$q$, t.u(5604))), 5), 'P0002');
select t.as_user(t.u(2));
select t.eq('manifest: an owner who is not the assigned driver gets nothing either', left(t.err_of(format($q$select * from public.driver_trip_manifest(%L)$q$, t.u(5602))), 5), 'P0002');
select t.as_anon();
select t.eq('manifest: anon is refused', left(t.err_of(format($q$select * from public.driver_trip_manifest(%L)$q$, t.u(5602))), 5), '42501');

-- 2. end trip -------------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5661));
select t.eq('end: a trip that has not started is refused', left(t.err_of(format($q$select public.driver_end_trip(%L)$q$, t.u(5601))), 5), '23514');
select t.eq('end: status unchanged after the refusal', t.st56(t.u(5601)), 'scheduled');
select t.eq('end: colleague''s trip is P0002', left(t.err_of(format($q$select public.driver_end_trip(%L)$q$, t.u(5603))), 5), 'P0002');
select t.eq('end: other company''s trip is P0002', left(t.err_of(format($q$select public.driver_end_trip(%L)$q$, t.u(5604))), 5), 'P0002');
select t.eq('end: the colleague''s trip is still in progress', t.st56(t.u(5603)), 'in_progress');
select t.eq('end: the assigned driver ends an in_progress trip', (public.driver_end_trip(t.u(5602)))->>'changed', 'true');
select t.eq('end: status is completed', t.st56(t.u(5602)), 'completed');
select t.eq('end: ended_at is set', t.cnt56(format('select count(*) from public.trips where id = %L and ended_at is not null', t.u(5602))), 1::bigint);
select t.eq('end: confirmed bookings are completed by the existing trip effects', t.cnt56(format($q$select count(*) from public.bookings where trip_id = %L and status = 'completed'$q$, t.u(5602))), 3::bigint);
select t.eq('end: pending booking became no_show', t.cnt56(format($q$select count(*) from public.bookings where trip_id = %L and status = 'no_show'$q$, t.u(5602))), 1::bigint);
select t.eq('end: a second press is a harmless no-op', (public.driver_end_trip(t.u(5602)))->>'changed', 'false');
select t.eq('end: the no-op keeps the first ended_at', t.cnt56(format('select count(distinct ended_at) from public.trips where id = %L', t.u(5602))), 1::bigint);
select t.eq('end: exactly one audit row, by = driver', t.cnt56(format($q$select count(*) from public.audit_logs where entity_id = %L and action = 'trip.completed' and metadata->>'by' = 'driver'$q$, t.u(5602))), 1::bigint);
select t.eq('end: a boarding trip passes through in_progress and completes', (public.driver_end_trip(t.u(5605)))->>'status', 'completed');
select t.eq('end: boarding trip is now completed with ended_at', t.cnt56(format($q$select count(*) from public.trips where id = %L and status = 'completed' and ended_at is not null$q$, t.u(5605))), 1::bigint);
select t.as_anon();
select t.eq('end: anon is refused', left(t.err_of(format($q$select public.driver_end_trip(%L)$q$, t.u(5601))), 5), '42501');

-- 3. every completion path sets ended_at ---------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.passes('staff: the owner completes a trip with transition_trip', format($q$select public.transition_trip(%L, 'completed')$q$, t.u(5606)));
select t.eq('staff: transition_trip also set ended_at (one trigger for every path)', t.cnt56(format('select count(*) from public.trips where id = %L and ended_at is not null', t.u(5606))), 1::bigint);
select t.as_admin();
select t.eq('constraint: ended_at on a trip that is not completed is refused', left(t.err_of(format($q$update public.trips set ended_at = now() where id = %L$q$, t.u(5601))), 5), '23514');

-- 4. profile --------------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5661));
select t.eq('profile: own name', (public.driver_my_profile())->>'full_name', 'T56 driver one');
select t.eq('profile: licence expiry warning counts days (10 days away, one day of timezone slack)', ((public.driver_my_profile())->>'license_days_left')::int between 9 and 10, true);
select t.eq('profile: trips completed counts only own completed trips', ((public.driver_my_profile())->>'trips_completed')::int, 2);
select t.eq('profile: no rating key until P7c', (public.driver_my_profile()) ? 'rating', false);
select t.as_user(t.u(5662));
select t.eq('profile: driver without a licence expiry gets null days', (public.driver_my_profile())->>'license_days_left', null);
select t.as_user(t.u(2));
select t.eq('profile: a user who is not a driver gets P0002', left(t.err_of('select public.driver_my_profile()'), 5), 'P0002');
select t.as_anon();
select t.eq('profile: anon is refused', left(t.err_of('select public.driver_my_profile()'), 5), '42501');

-- 5. auto-close (D16) -----------------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
select t.as_user(t.u(5661));
select t.eq('auto-close: the internal function is not callable by a signed-in user', left(t.err_of('select app_private.close_overdue_trips()'), 5), '42501');
select t.as_admin();
select app_private.close_overdue_trips();
select t.eq('auto-close: overdue boarding trip is completed', t.st56(t.u(5607)), 'completed');
select t.eq('auto-close: overdue in_progress trip is completed', t.st56(t.u(5608)), 'completed');
select t.eq('auto-close: ended_at is arrival + 2 h, not now', t.cnt56(format('select count(*) from public.trips where id = %L and ended_at = arrival_at + interval ''2 hours''', t.u(5607))), 1::bigint);
select t.eq('auto-close: a trip that is only scheduled is left for a person', t.st56(t.u(5609)), 'scheduled');
select t.eq('auto-close: a boarding trip that is not overdue is untouched', t.st56(t.u(5610)), 'boarding');
select t.eq('auto-close: audited as system / auto_close', t.cnt56(format($q$select count(*) from public.audit_logs where entity_id = %L and action = 'trip.completed' and actor_type = 'system' and metadata->>'by' = 'auto_close'$q$, t.u(5607))), 1::bigint);
select t.eq('auto-close: idempotent (second run closes nothing more)', app_private.close_overdue_trips(), 0);
select t.eq('auto-close: heartbeat row written', t.cnt56($q$select count(*) from app_private.job_heartbeats where job = 'close-overdue-trips' and last_run_at > now() - interval '1 minute'$q$), 1::bigint);
