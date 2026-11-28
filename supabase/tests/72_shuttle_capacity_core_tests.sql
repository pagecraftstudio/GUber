-- 72: Continuous Shuttle S4a (migration 0077): bookings, decision log, the one segment writer, decide / reject / cancel, drift check. Harness style.
-- Users: u(2) ownerA, u(3) managerA, u(4) operations (NO shuttle.confirm), u(5) booking (shuttle.confirm), u(6) driver, u(7) ownerB, u(9) platform support.
-- Own fixtures (ids 72xx): route 7401 (3 stops), service 7501, buses 7421/7422 (capacity 4), customers 7441-7444 (+ 7449 in company B).
-- Drift is read for THIS suite's day only: suite 70 leaves a deliberately corrupted counter on its own run.
-- Bookings are inserted as admin (S4a has no customer entry point). Every RPC call hits a rate-limit bucket, so counters are cleared between sections.
select t.as_admin();
delete from t.results where name like 's4a: %';
create temp table s4a_saved as select
  (select bool_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'feature_shuttle_ops') as feat,
  (select int_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'max_shuttle_vehicles') as vmax;
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = 10 where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');

create or replace function t.cnt72(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
create or replace function t.msg72(stmt text) returns text language plpgsql as $$ begin execute stmt; return 'no error'; exception when others then return sqlerrm; end $$;
create or replace function t.day72() returns uuid language sql security definer as $$ select id from public.shuttle_operating_days where service_id = t.u(7501) order by created_at desc limit 1 $$;
create or replace function t.run72(n int) returns uuid language sql security definer as $$ select id from public.shuttle_runs where day_id = t.day72() and run_no = n $$;
create or replace function t.sess72(b int) returns uuid language sql security definer as $$ select id from public.shuttle_vehicle_sessions where vehicle_id = t.u(b) order by created_at desc limit 1 $$;
create or replace function t.seg72(n int) returns text language sql security definer as $$ select string_agg(confirmed_seats::text, ',' order by seg_idx) from public.shuttle_run_segments where run_id = t.run72(n) $$;
create or replace function t.bk72(k text) returns uuid language sql security definer as $$ select id from public.shuttle_bookings where request_key = k $$;
create or replace function t.st72(k text) returns text language sql security definer as $$ select status from public.shuttle_bookings where request_key = k $$;
create or replace function t.drift72() returns bigint language sql security definer as $$ select count(*) from app_private.shuttle_segment_drift() d where d.run_id in (select id from public.shuttle_runs where day_id = t.day72()) $$;
grant execute on function t.cnt72(text), t.msg72(text), t.day72(), t.run72(int), t.sess72(int), t.seg72(int), t.bk72(text), t.st72(text), t.drift72() to authenticated, anon;

insert into routes (id, company_id, name, origin_name, destination_name) values (t.u(7401), t.u(101), 'S4a route', 'Campus', 'Port');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(7411), t.u(101), t.u(7401), 'S4a Campus', 1, 'both'), (t.u(7412), t.u(101), t.u(7401), 'S4a Mid', 2, 'both'), (t.u(7413), t.u(101), t.u(7401), 'S4a Port', 3, 'both');
insert into shuttle_services (id, company_id, route_id, name, outbound_direction, allow_reverse, hub_stop_id) values (t.u(7501), t.u(101), t.u(7401), 'S4a Shuttle', 'forward', true, t.u(7411));
insert into buses (id, company_id, plate_number, capacity, status) values (t.u(7421), t.u(101), 'S4A-1', 4, 'active'), (t.u(7422), t.u(101), t.u(7422), 4, 'active');
update buses set plate_number = 'S4A-2' where id = t.u(7422);
insert into drivers (id, company_id, full_name, phone, status) values (t.u(7431), t.u(101), 'S4a driver 1', '+201000074031', 'active'), (t.u(7432), t.u(101), 'S4a driver 2', '+201000074032', 'active');
insert into customers (id, company_id, full_name, phone) values
  (t.u(7441), t.u(101), 'S4a cust 1', '+201000074411'), (t.u(7442), t.u(101), 'S4a cust 2', '+201000074412'), (t.u(7443), t.u(101), 'S4a cust 3', '+201000074413'),
  (t.u(7444), t.u(101), 'S4a cust 4', '+201000074414'), (t.u(7449), t.u(102), 'S4a B cust', '+201000074419');

select t.as_user(t.u(3));
select t.passes('s4a: manager starts the day (2 buses, capacity 4, both forward from the first station)', $$select public.shuttle_start_day(t.u(7501),
  (select (now() at time zone coalesce((select timezone from public.company_settings where company_id = t.u(101)), 'UTC'))::date),
  jsonb_build_array(jsonb_build_object('bus_id', t.u(7421), 'driver_id', t.u(7431), 'start_station_idx', 0, 'direction', 'forward'),
                    jsonb_build_object('bus_id', t.u(7422), 'driver_id', t.u(7432), 'start_station_idx', 0, 'direction', 'forward')), 's4a-start-1')$$);
select t.as_admin();

-- 0. catalog -----------------------------------------------------------------------------------------------------------------------------------
select t.eq('s4a: tenant guard covers bookings and decisions', (select count(*) from app_private.tenant_guard_problems() where table_name like 'shuttle_%'), 0::bigint);
select t.eq('s4a: no client write grant on bookings or decisions', (select count(*) from information_schema.role_table_grants where table_schema = 'public'
  and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT' and table_name in ('shuttle_bookings', 'shuttle_booking_decisions')), 0::bigint);
select t.eq('s4a: the two RPCs are granted to authenticated, not anon', (select count(*) filter (where grantee = 'authenticated') || '/' || count(*) filter (where grantee in ('anon', 'PUBLIC'))
  from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('shuttle_decide_booking', 'shuttle_cancel_booking')), '2/0');
select t.eq('s4a: segments start at zero, 2 per run, drift empty', t.seg72(1) || '|' || t.seg72(2) || '|' || t.drift72()::text, '0,0|0,0|0');

-- 1. bookings must lie inside the run ----------------------------------------------------------------------------------------------------------
select t.raises('s4a: destination outside the run is refused (23514)', format($f$insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
  values (t.u(101), %L, %L, t.u(7441), 0, 3, 1, 'k72-out')$f$, t.day72(), t.run72(1)), '23514');
select t.raises('s4a: zero-length trip is refused', format($f$insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
  values (t.u(101), %L, %L, t.u(7441), 1, 1, 1, 'k72-zero')$f$, t.day72(), t.run72(1)), '23514');
select t.raises('s4a: zero seats are refused', format($f$insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
  values (t.u(101), %L, %L, t.u(7441), 0, 1, 0, 'k72-seats')$f$, t.day72(), t.run72(1)), '23514');
select t.raises('s4a: a customer of another company cannot be on the booking (FK)', format($f$insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
  values (t.u(101), %L, %L, t.u(7449), 0, 1, 1, 'k72-xcust')$f$, t.day72(), t.run72(1)), '23503');
select t.raises('s4a: a run of another day cannot be used', format($f$insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
  values (t.u(101), t.u(7599), %L, t.u(7441), 0, 1, 1, 'k72-xday')$f$, t.run72(1)), '23514');
insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key)
select t.u(101), t.day72(), t.run72(1), t.u(7441 + (n % 4)), f, tt, s, k from (values
  (0, 2, 2, 'k72-b1'), (0, 1, 2, 'k72-b2'), (1, 2, 3, 'k72-b3'), (1, 2, 2, 'k72-b3b'), (0, 2, 1, 'k72-b4'), (0, 2, 2, 'k72-b5')) v(f, tt, s, k), lateral (select ascii(right(k, 1)) as n) q;
select t.eq('s4a: a request holds no seat (counters untouched by 6 requests)', t.seg72(1) || '/' || t.drift72()::text, '0,0/0');

-- 2. who may decide --------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.raises('s4a: operations (no shuttle.confirm) cannot decide', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-x-ops')$$, 'P0002');
select t.as_user(t.u(6));
select t.raises('s4a: a driver cannot decide', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-x-drv')$$, 'P0002');
select t.as_user(t.u(7));
select t.raises('s4a: owner B cannot decide on an A booking (looks like not found)', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-x-ownb')$$, 'P0002');
select t.raises('s4a: owner B cannot cancel an A booking', $$select public.shuttle_cancel_booking(t.bk72('k72-b1'), 'k72-x-ownb2', 'no')$$, 'P0002');
select t.as_user(t.u(9));
select t.raises('s4a: platform support (not acting) cannot decide', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-x-plat')$$, 'P0002');
select t.as_anon();
select t.raises('s4a: anon cannot decide', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-x-anon')$$, '42501');
select t.as_user(t.u(5));
select t.raises('s4a: unknown decision word is 22023', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'maybe', 'k72-x-word')$$, '22023');
select t.raises('s4a: empty key is 22023', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', '  ')$$, '22023');
select t.raises('s4a: unknown booking looks like not found', $$select public.shuttle_decide_booking('00000000-0000-4000-8000-0000000fffff', 'confirm', 'k72-x-ghost')$$, 'P0002');
select t.as_admin();
select t.eq('s4a: nothing changed by refused calls', t.seg72(1) || '/' || t.cnt72('select count(*) from public.shuttle_booking_decisions')::text, '0,0/0');

-- 3. confirm: first wins, losers are logged, replays are stored --------------------------------------------------------------------------------------------
select t.as_user(t.u(5));
select t.eq('s4a: booking staff confirms b1 (0>2, 2 seats)', (public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-d-b1')) ->> 'outcome', 'confirmed');
select t.as_admin();
select t.eq('s4a: both segments hold 2, booking confirmed by u5, drift empty', t.seg72(1) || '/' || t.st72('k72-b1') || '/' || (select (decided_by = t.u(5))::text from shuttle_bookings where request_key = 'k72-b1') || '/' || t.drift72()::text, '2,2/confirmed/true/0');
select t.eq('s4a: decision, event and audit rows written', (select count(*) from shuttle_booking_decisions where outcome = 'confirmed') || '/' || (select count(*) from shuttle_events where kind = 'booking.confirmed') || '/'
  || (select count(*) from audit_logs where action = 'shuttle_booking.confirmed'), '1/1/1');
select t.as_user(t.u(5));
select t.eq('s4a: same key replays the stored answer', (public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-d-b1')) ->> 'replayed', 'true');
select t.raises('s4a: the same key for another action is 22023', $$select public.shuttle_decide_booking(t.bk72('k72-b1'), 'reject', 'k72-d-b1')$$, '22023');
select t.as_user(t.u(3));
select t.eq('s4a: a second staff member deciding the same booking gets already_processed + who + status',
  (public.shuttle_decide_booking(t.bk72('k72-b1'), 'confirm', 'k72-d-b1-late')) ->> 'outcome', 'already_processed');
select t.eq('s4a: ...and is told who won', (public.shuttle_decide_booking(t.bk72('k72-b1'), 'reject', 'k72-d-b1-late2')) ->> 'decided_by_name', (select full_name from profiles where id = t.u(5)));
select t.as_admin();
select t.eq('s4a: the losers are in the log, counters untouched, still confirmed', (select count(*) from shuttle_booking_decisions where booking_id = t.bk72('k72-b1')) || '/' || t.seg72(1) || '/' || t.st72('k72-b1'), '3/2,2/confirmed');

-- 4. capacity -------------------------------------------------------------------------------------------------------------------------------------------
delete from app_private.rate_limit_counters;
select t.as_user(t.u(3));
select t.eq('s4a: b2 (0>1, 2 seats) fills segment 0 to 4', (public.shuttle_decide_booking(t.bk72('k72-b2'), 'confirm', 'k72-d-b2')) ->> 'outcome', 'confirmed');
select t.eq('s4a: b3 (1>2, 3 seats) would make segment 1 = 5 > 4: no_capacity', (public.shuttle_decide_booking(t.bk72('k72-b3'), 'confirm', 'k72-d-b3')) ->> 'outcome', 'no_capacity');
select t.as_admin();
select t.eq('s4a: no_capacity leaves the request open and the counters alone, and is logged', t.st72('k72-b3') || '/' || t.seg72(1) || '/' || (select count(*) from shuttle_booking_decisions where booking_id = t.bk72('k72-b3') and outcome = 'no_capacity'), 'requested/4,2/1');
select t.as_user(t.u(3));
select t.eq('s4a: b3b (1>2, 2 seats) fits exactly: segment 1 = 4', (public.shuttle_decide_booking(t.bk72('k72-b3b'), 'confirm', 'k72-d-b3b')) ->> 'outcome', 'confirmed');
select t.eq('s4a: b5 (0>2) now has no room in either segment', (public.shuttle_decide_booking(t.bk72('k72-b5'), 'confirm', 'k72-d-b5')) ->> 'outcome', 'no_capacity');
select t.eq('s4a: staff rejects b3 with a reason', (public.shuttle_decide_booking(t.bk72('k72-b3'), 'reject', 'k72-d-b3r', 'no seats left')) ->> 'outcome', 'rejected');
select t.eq('s4a: confirming a rejected request is already_processed', (public.shuttle_decide_booking(t.bk72('k72-b3'), 'confirm', 'k72-d-b3c')) ->> 'outcome', 'already_processed');
select t.as_admin();
select t.eq('s4a: counters = 4,4 and equal the recompute (drift empty)', t.seg72(1) || '/' || t.drift72()::text, '4,4/0');
select t.eq('s4a: reject reason stored', (select decision_reason from shuttle_bookings where request_key = 'k72-b3'), 'no seats left');

-- 5. cancel releases exactly its segments ----------------------------------------------------------------------------------------------------------------
delete from app_private.rate_limit_counters;
select t.as_user(t.u(5));
select t.raises('s4a: cancel needs a reason (22023)', $$select public.shuttle_cancel_booking(t.bk72('k72-b1'), 'k72-c-b1', '  ')$$, '22023');
select t.eq('s4a: staff cancels confirmed b1', (public.shuttle_cancel_booking(t.bk72('k72-b1'), 'k72-c-b1', 'customer called')) ->> 'outcome', 'cancelled');
select t.eq('s4a: replay of the cancel', (public.shuttle_cancel_booking(t.bk72('k72-b1'), 'k72-c-b1', 'customer called')) ->> 'replayed', 'true');
select t.eq('s4a: cancelling again with a new key is already_processed', (public.shuttle_cancel_booking(t.bk72('k72-b1'), 'k72-c-b1x', 'again')) ->> 'outcome', 'already_processed');
select t.as_admin();
select t.eq('s4a: b1 released: segment 0 = 2 (b2), segment 1 = 2 (b3b); drift empty', t.seg72(1) || '/' || t.drift72()::text || '/' || t.st72('k72-b1'), '2,2/0/cancelled');
select t.as_user(t.u(5));
select t.eq('s4a: cancelling a request (no seat held) leaves counters alone', (public.shuttle_cancel_booking(t.bk72('k72-b4'), 'k72-c-b4', 'duplicate')) ->> 'outcome', 'cancelled');
select t.eq('s4a: the freed room is usable: b5 (0>2, 2 seats) confirms', (public.shuttle_decide_booking(t.bk72('k72-b5'), 'confirm', 'k72-d-b5b')) ->> 'outcome', 'confirmed');
select t.as_admin();
select t.eq('s4a: counters 4,4, drift empty, audit has the cancels', t.seg72(1) || '/' || t.drift72()::text || '/' || (select count(*) from audit_logs where action = 'shuttle_booking.cancelled'), '4,4/0/2');
select t.eq('s4a: decision log kept every attempt (confirm x6 attempts incl. losers, reject x2 (one is the loser on b1), cancel x3)',
  (select count(*) filter (where action = 'confirm') || '/' || count(*) filter (where action = 'reject') || '/' || count(*) filter (where action = 'cancel') from shuttle_booking_decisions), '8/2/3');

-- 6. run closed / too late (run 2, bus 2) -------------------------------------------------------------------------------------------------------------
insert into shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, request_key) values
  (t.u(101), t.day72(), t.run72(2), t.u(7441), 0, 2, 1, 'k72-t1'), (t.u(101), t.day72(), t.run72(2), t.u(7442), 1, 2, 1, 'k72-t2'), (t.u(101), t.day72(), t.run72(2), t.u(7443), 1, 2, 1, 'k72-t3');
delete from app_private.rate_limit_counters;
select t.as_user(t.u(3));
select t.passes('s4a: bus 2 opens loading', $$select public.shuttle_open_loading(t.sess72(7422), 'ready', 'k72-s-ol')$$);
select t.passes('s4a: bus 2 departs from the first station', $$select public.shuttle_depart(t.sess72(7422), 'loading', 'k72-s-dep')$$);
select t.eq('s4a: a request for the station the bus already left is too_late', (public.shuttle_decide_booking(t.bk72('k72-t1'), 'confirm', 'k72-d-t1')) ->> 'outcome', 'too_late');
select t.eq('s4a: a request for a station still ahead can be confirmed', (public.shuttle_decide_booking(t.bk72('k72-t2'), 'confirm', 'k72-d-t2')) ->> 'outcome', 'confirmed');
select t.passes('s4a: bus 2 arrives at the second station', $$select public.shuttle_arrive(t.sess72(7422), 'in_transit', 'k72-s-arr')$$);
select t.passes('s4a: bus 2 ends its session (run finished)', $$select public.shuttle_end_session(t.sess72(7422), 'arrived', 'k72-s-end')$$);
select t.eq('s4a: a request on a finished run is run_closed', (public.shuttle_decide_booking(t.bk72('k72-t3'), 'confirm', 'k72-d-t3')) ->> 'outcome', 'run_closed');
select t.as_admin();
select t.eq('s4a: too_late and run_closed changed nothing', t.seg72(2) || '/' || t.st72('k72-t1') || '/' || t.st72('k72-t3') || '/' || t.drift72()::text, '0,1/requested/requested/0');

-- 7. guards ---------------------------------------------------------------------------------------------------------------------------------------------
select t.raises('s4a: a confirmed booking cannot go back to requested', $$update shuttle_bookings set status = 'requested' where request_key = 'k72-b5'$$, '23514');
select t.raises('s4a: seats cannot change', $$update shuttle_bookings set seats = 1 where request_key = 'k72-b5'$$, '23514');
select t.raises('s4a: stations cannot change', $$update shuttle_bookings set to_pos = 1 where request_key = 'k72-b5'$$, '23514');
select t.raises('s4a: run cannot change', format($$update shuttle_bookings set run_id = %L where request_key = 'k72-b5'$$, t.run72(2)), '23514');
select t.raises('s4a: bookings cannot be deleted', $$delete from shuttle_bookings$$, null);
select t.raises('s4a: bookings cannot be truncated', $$truncate shuttle_bookings$$, null);
select t.raises('s4a: decisions cannot be updated', $$update shuttle_booking_decisions set outcome = 'confirmed'$$, null);
select t.raises('s4a: decisions cannot be deleted', $$delete from shuttle_booking_decisions$$, null);
select t.raises('s4a: decisions cannot be truncated', $$truncate shuttle_booking_decisions$$, null);
select t.raises('s4a: the segment CHECK is the backstop (counter above capacity)', format($$update shuttle_run_segments set confirmed_seats = 5 where run_id = %L and seg_idx = 0$$, t.run72(1)), '23514');
select t.raises('s4a: the segment CHECK is the backstop (counter below zero)', format($$update shuttle_run_segments set confirmed_seats = -1 where run_id = %L and seg_idx = 0$$, t.run72(2)), '23514');
select t.raises('s4a: the writer refuses a missing segment range', format($$select app_private.shuttle_apply_segments(%L, 0, 9, 1, 1)$$, t.run72(2)), '55000');
select t.raises('s4a: the writer refuses a nonsense sign', format($$select app_private.shuttle_apply_segments(%L, 0, 1, 1, 2)$$, t.run72(2)), '22023');
-- drift check really detects drift
update shuttle_run_segments set confirmed_seats = 1 where run_id = t.run72(2) and seg_idx = 0;
select t.eq('s4a: drift check catches a corrupted counter', t.drift72(), 1::bigint);
update shuttle_run_segments set confirmed_seats = 0 where run_id = t.run72(2) and seg_idx = 0;
select t.eq('s4a: ...and is empty again once repaired', t.drift72(), 0::bigint);

-- 8. reads -----------------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5));
select t.eq('s4a: booking staff reads bookings and decisions', (select count(*) from shuttle_bookings) > 0 and (select count(*) from shuttle_booking_decisions) > 0, true);
select t.as_user(t.u(4));
select t.eq('s4a: operations (shuttle.read) can read bookings but not decide', (select count(*) from shuttle_bookings) > 0, true);
select t.as_user(t.u(6));
select t.eq('s4a: driver reads none', (select count(*) from shuttle_bookings) + (select count(*) from shuttle_booking_decisions), 0::bigint);
select t.as_user(t.u(7));
select t.eq('s4a: owner B sees none', (select count(*) from shuttle_bookings) + (select count(*) from shuttle_booking_decisions), 0::bigint);
select t.as_user(t.u(9));
select t.eq('s4a: platform support can read', (select count(*) from shuttle_bookings) > 0, true);
select t.as_anon();
select t.raises('s4a: anon cannot select bookings', $$select count(*) from shuttle_bookings$$, '42501');
select t.as_user(t.u(2));
select t.raises('s4a: owner cannot insert a booking directly', $$insert into shuttle_bookings (company_id, day_id, run_id, from_pos, to_pos, seats) select company_id, day_id, id, 0, 1, 1 from shuttle_runs limit 1$$, '42501');
select t.raises('s4a: owner cannot confirm by updating the row', $$update shuttle_bookings set status = 'confirmed'$$, '42501');
select t.raises('s4a: owner cannot touch segment counters', $$update shuttle_run_segments set confirmed_seats = 0$$, '42501');

-- 9. cleanup ----------------------------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
delete from app_private.rate_limit_counters;
update plan_entitlements set bool_value = (select feat from s4a_saved) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = (select vmax from s4a_saved) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
