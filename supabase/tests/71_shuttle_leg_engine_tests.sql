-- 71: Continuous Shuttle S3 (migration 0076). Harness style. Needs 01 fixtures (company A professional; users u(2) ownerA, u(3) manager, u(4) operations,
-- u(5) booking, u(6) driver, u(7) ownerB, u(9) platform support).
-- Own fixtures (ids 71xx): route 7301 (4 stops) + service 7401 (allow_reverse), route 7302 (3 stops) + service 7402 (NO reverse), buses 7321-7326, drivers 7331-7336.
-- User 6 is linked to driver 7331 here (restored at the end). "Today" is the company-local date. Calls are separate statements = separate transactions.
select t.as_admin();
delete from t.results where name like 's3: %';
delete from app_private.rate_limit_counters;
create temp table s3_saved as select
  (select bool_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'feature_shuttle_ops') as feat,
  (select int_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'max_shuttle_vehicles') as vmax;
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = 50 where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
create temp table s3_u6 as select id from drivers where user_id = t.u(6);
update drivers set user_id = null where user_id = t.u(6);

create table if not exists t.s71 (k text primary key, v jsonb);
alter table t.s71 disable row level security; grant all on t.s71 to anon, authenticated;
delete from t.s71;
create or replace function t.d71(n int) returns date language sql security definer as
  $$ select (now() at time zone coalesce((select timezone from public.company_settings where company_id = t.u(101)), 'UTC'))::date + n $$;
create or replace function t.v71(b int, d int, i int, dir text) returns jsonb language sql immutable as
  $$ select jsonb_build_object('bus_id', t.u(b), 'driver_id', t.u(d), 'start_station_idx', i, 'direction', dir) $$;
create or replace function t.sid71(b int) returns uuid language sql security definer as
  $$ select id from public.shuttle_vehicle_sessions where vehicle_id = t.u(b) order by created_at desc limit 1 $$;
create or replace function t.cnt71(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
grant execute on function t.d71(int), t.v71(int, int, int, text), t.sid71(int), t.cnt71(text) to authenticated, anon;

insert into routes (id, company_id, name, origin_name, destination_name) values (t.u(7301), t.u(101), 'S3 route four', 'A', 'D'), (t.u(7302), t.u(101), 'S3 route three', 'A', 'C');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(7311), t.u(101), t.u(7301), 'S3 Campus', 1, 'both'), (t.u(7312), t.u(101), t.u(7301), 'S3 Suez', 2, 'both'), (t.u(7313), t.u(101), t.u(7301), 'S3 Sokhna', 3, 'both'), (t.u(7314), t.u(101), t.u(7301), 'S3 Porto', 4, 'both'),
  (t.u(7321), t.u(101), t.u(7302), 'S3 X1', 1, 'both'), (t.u(7322), t.u(101), t.u(7302), 'S3 X2', 2, 'both'), (t.u(7323), t.u(101), t.u(7302), 'S3 X3', 3, 'both');
insert into shuttle_services (id, company_id, route_id, name, allow_reverse) values (t.u(7401), t.u(101), t.u(7301), 'S3 reversing', true), (t.u(7402), t.u(101), t.u(7302), 'S3 one way', false);
insert into buses (id, company_id, plate_number, capacity, status) select t.u(7320 + n), t.u(101), 'S3-' || n, 10 + n, 'active' from generate_series(1, 6) n;
insert into drivers (id, company_id, full_name, phone, status) select t.u(7330 + n), t.u(101), 'S3 driver ' || n, '+20100007133' || n, 'active' from generate_series(1, 6) n;
update drivers set user_id = t.u(6) where id = t.u(7331);

-- 0. setup: two days ----------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s3: start the reversing day (A driver 1, B backward from the last stop, C at position 2, D idle)', $$insert into t.s71 select 'day1', public.shuttle_start_day(t.u(7401), t.d71(0),
  jsonb_build_array(t.v71(7321, 7331, 0, 'forward'), t.v71(7322, 7332, 3, 'backward'), t.v71(7323, 7333, 2, 'forward'), t.v71(7324, 7334, 0, 'forward')), 'day1')$$);
select t.passes('s3: start the one-way day (bus 6 and bus 5)', $$insert into t.s71 select 'day2', public.shuttle_start_day(t.u(7402), t.d71(0),
  jsonb_build_array(t.v71(7326, 7336, 0, 'forward'), t.v71(7325, 7335, 0, 'forward')), 'day2')$$);

-- 1. driver runs bus A: open, close, depart, arrive ----------------------------------------------------------------------------------------
select t.as_user(t.u(6));
select t.raises('s3: blank key', $$select public.shuttle_open_loading(t.sid71(7321), 'ready', '  ')$$, '22023');
select t.raises('s3: null key', $$select public.shuttle_open_loading(t.sid71(7321), 'ready', null)$$, '22023');
select t.raises('s3: wrong expected state is stale (P0001)', $$select public.shuttle_open_loading(t.sid71(7321), 'loading', 'a1')$$, 'P0001');
select t.raises('s3: null expected state is stale', $$select public.shuttle_open_loading(t.sid71(7321), null, 'a1')$$, 'P0001');
select t.raises('s3: unknown session', $$select public.shuttle_open_loading(t.u(7999), 'ready', 'a1')$$, 'P0002');
select t.raises('s3: depart before loading is not allowed in ready', $$select public.shuttle_depart(t.sid71(7321), 'ready', 'a0')$$, '23514');
select t.raises('s3: arrive before departing is not allowed in ready', $$select public.shuttle_arrive(t.sid71(7321), 'ready', 'a0')$$, '23514');
select t.passes('s3: driver opens loading at the start station', $$insert into t.s71 select 'a_open', public.shuttle_open_loading(t.sid71(7321), 'ready', 'a-open')$$);
select t.as_admin();
select t.eq('s3: loading, position 0 = Campus, visit created, not replayed', (select v ->> 'state' || '|' || (v ->> 'station_name') || '|' || (v ->> 'replayed') || '|' || (v ->> 'reversed') from t.s71 where k = 'a_open'), 'loading|S3 Campus|false|false');
select t.eq('s3: one visit with loading started', (select count(*) from shuttle_station_visits where session_id = t.sid71(7321) and loading_started_at is not null and loading_closed_at is null and departed_at is null), 1::bigint);
select t.eq('s3: event actor role is driver', (select actor_role from shuttle_events where session_id = t.sid71(7321) and kind = 'session.loading_opened'), 'driver');
select t.as_user(t.u(6));
select t.passes('s3: same key replays the stored result', $$insert into t.s71 select 'a_open2', public.shuttle_open_loading(t.sid71(7321), 'ready', 'a-open')$$);
select t.as_admin();
select t.eq('s3: replay: same visit, replayed true, still one visit and one event', (select ((select v ->> 'visit_id' from t.s71 where k = 'a_open2') = (select v ->> 'visit_id' from t.s71 where k = 'a_open'))::text || '|' || (select v ->> 'replayed' from t.s71 where k = 'a_open2')
  || '|' || (select count(*) from shuttle_station_visits where session_id = t.sid71(7321)) || '|' || (select count(*) from shuttle_events where session_id = t.sid71(7321) and kind = 'session.loading_opened')), 'true|true|1|1');
select t.as_user(t.u(6));
select t.raises('s3: same key on another action is refused', $$select public.shuttle_close_loading(t.sid71(7321), 'loading', 'a-open')$$, '22023');
select t.raises('s3: a new key while already loading: stale', $$select public.shuttle_open_loading(t.sid71(7321), 'ready', 'a-open-b')$$, 'P0001');
select t.raises('s3: a new key, honest state, but loading again is not allowed', $$select public.shuttle_open_loading(t.sid71(7321), 'loading', 'a-open-c')$$, '23514');
select t.passes('s3: close loading', $$insert into t.s71 select 'a_close', public.shuttle_close_loading(t.sid71(7321), 'loading', 'a-close')$$);
select t.passes('s3: closing again with a new key is harmless (already_closed)', $$insert into t.s71 select 'a_close2', public.shuttle_close_loading(t.sid71(7321), 'loading', 'a-close-2')$$);
select t.as_admin();
select t.eq('s3: close flags', (select (select v ->> 'already_closed' from t.s71 where k = 'a_close') || '|' || (select v ->> 'already_closed' from t.s71 where k = 'a_close2')), 'false|true');
select t.as_user(t.u(6));
select t.passes('s3: depart creates the leg', $$insert into t.s71 select 'a_dep', public.shuttle_depart(t.sid71(7321), 'loading', 'a-dep')$$);
select t.as_admin();
select t.eq('s3: leg 1 from Campus to Suez, in transit', (select v ->> 'seq' || '|' || (v ->> 'from_name') || '|' || (v ->> 'to_name') || '|' || (v ->> 'state') from t.s71 where k = 'a_dep'), '1|S3 Campus|S3 Suez|in_transit');
select t.eq('s3: leg carries the bus and driver snapshot', (select (vehicle_id = t.u(7321))::text || '|' || (driver_id = t.u(7331))::text || '|' || status from shuttle_legs where session_id = t.sid71(7321) and seq = 1), 'true|true|in_transit');
select t.eq('s3: visit departed, run active', (select (select (departed_at is not null and loading_closed_at is not null)::text from shuttle_station_visits where session_id = t.sid71(7321))
  || '|' || (select status from shuttle_runs where session_id = t.sid71(7321))), 'true|active');
select t.as_user(t.u(6));
select t.passes('s3: depart replay returns the same leg', $$insert into t.s71 select 'a_dep2', public.shuttle_depart(t.sid71(7321), 'loading', 'a-dep')$$);
select t.raises('s3: a second depart press (new key, old state) is stale', $$select public.shuttle_depart(t.sid71(7321), 'loading', 'a-dep-b')$$, 'P0001');
select t.raises('s3: a second depart press (new key, true state) is not allowed in transit', $$select public.shuttle_depart(t.sid71(7321), 'in_transit', 'a-dep-c')$$, '23514');
select t.as_admin();
select t.eq('s3: still exactly one leg', (select count(*) from shuttle_legs where session_id = t.sid71(7321)), 1::bigint);
select t.eq('s3: replay same leg id', (select (v ->> 'leg_id') = (select v ->> 'leg_id' from t.s71 where k = 'a_dep') from t.s71 where k = 'a_dep2'), true);
select t.as_user(t.u(6));
select t.raises('s3: open loading while in transit is not allowed', $$select public.shuttle_open_loading(t.sid71(7321), 'in_transit', 'a-x')$$, '23514');
select t.passes('s3: arrive', $$insert into t.s71 select 'a_arr', public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a-arr')$$);
select t.as_admin();
select t.eq('s3: arrived at position 1 = Suez, not late, not the last station', (select v ->> 'state' || '|' || (v ->> 'station_name') || '|' || (v ->> 'late') || '|' || (v ->> 'last_station') from t.s71 where k = 'a_arr'), 'arrived|S3 Suez|false|false');
select t.eq('s3: leg arrived, visit at Suez created', (select (select status from shuttle_legs where session_id = t.sid71(7321) and seq = 1) || '|' || (select count(*) from shuttle_station_visits where session_id = t.sid71(7321) and station_idx = 1)), 'arrived|1');
select t.as_user(t.u(6));
select t.raises('s3: arrive replay-less second press is stale', $$select public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a-arr-b')$$, 'P0001');
select t.passes('s3: arrive replay returns stored', $$select public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a-arr')$$);
select t.as_admin();
select t.eq('s3: still one visit at Suez', (select count(*) from shuttle_station_visits where session_id = t.sid71(7321) and station_idx = 1), 1::bigint);

-- 2. who may act ----------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(6));
select t.raises('s3: driver cannot act on another driver''s session', $$select public.shuttle_open_loading(t.sid71(7322), 'ready', 'x1')$$, 'P0002');
select t.raises('s3: driver cannot set out of service (manager side)', $$select public.shuttle_set_out_of_service(t.sid71(7321), 'arrived', 'x2', 'engine noise')$$, 'P0002');
select t.raises('s3: driver cannot end a session (manager side)', $$select public.shuttle_end_session(t.sid71(7321), 'arrived', 'x3')$$, 'P0002');
select t.as_user(t.u(5));
select t.raises('s3: booking staff cannot depart (no shuttle.operate / drive)', $$select public.shuttle_open_loading(t.sid71(7322), 'ready', 'x4')$$, 'P0002');
select t.as_user(t.u(7));
select t.raises('s3: owner B cannot touch company A session', $$select public.shuttle_open_loading(t.sid71(7322), 'ready', 'x5')$$, 'P0002');
select t.as_anon();
select t.raises('s3: anon cannot act', $$select public.shuttle_open_loading(t.sid71(7322), 'ready', 'x6')$$, '42501');
select t.as_user(t.u(4));
select t.passes('s3: operations may act (opens bus B)', $$insert into t.s71 select 'b_open', public.shuttle_open_loading(t.sid71(7322), 'ready', 'b-open')$$);
select t.as_admin();
select t.eq('s3: ops event role', (select actor_role from shuttle_events where session_id = t.sid71(7322) and kind = 'session.loading_opened'), 'operations');
select t.eq('s3: backward bus B opens at the LAST stop name (position 0 of its run)', (select v ->> 'station_name' || '|' || (v ->> 'direction') from t.s71 where k = 'b_open'), 'S3 Porto|backward');

-- 3. late arrival (bus B) ------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.passes('s3: bus B departs', $$insert into t.s71 select 'b_dep', public.shuttle_depart(t.sid71(7322), 'loading', 'b-dep')$$);
select t.as_admin();
set session_replication_role = replica;
update shuttle_legs set departed_at = now() - interval '30 minutes' where session_id = t.sid71(7322) and seq = 1;
update shuttle_station_visits set arrived_at = now() - interval '40 minutes', loading_started_at = now() - interval '35 minutes', loading_closed_at = now() - interval '31 minutes', departed_at = now() - interval '30 minutes' where session_id = t.sid71(7322);
set session_replication_role = origin;
select t.as_user(t.u(4));
select t.raises('s3: occurred_at before the departure', $$select public.shuttle_arrive(t.sid71(7322), 'in_transit', 'b-a1', now() - interval '45 minutes', 'forgot to press')$$, '22023');
select t.raises('s3: occurred_at in the future', $$select public.shuttle_arrive(t.sid71(7322), 'in_transit', 'b-a2', now() + interval '1 hour', 'clock')$$, '22023');
select t.raises('s3: late arrival needs a reason', $$select public.shuttle_arrive(t.sid71(7322), 'in_transit', 'b-a3', now() - interval '10 minutes')$$, '22023');
select t.raises('s3: reason too short', $$select public.shuttle_arrive(t.sid71(7322), 'in_transit', 'b-a4', now() - interval '10 minutes', 'x')$$, '22023');
select t.passes('s3: late arrival with a reason', $$insert into t.s71 select 'b_arr', public.shuttle_arrive(t.sid71(7322), 'in_transit', 'b-a5', now() - interval '10 minutes', 'driver forgot to press')$$);
select t.as_admin();
select t.eq('s3: late flagged on result, visit and event; leg arrived_at is the real time', (select (v ->> 'late') || '|' || (select late_recorded::text from shuttle_station_visits where session_id = t.sid71(7322) and station_idx = 1)
  || '|' || (select (arrived_at < now() - interval '9 minutes' and arrived_at > now() - interval '11 minutes')::text from shuttle_legs where session_id = t.sid71(7322) and seq = 1)
  || '|' || (select payload ->> 'reason' from shuttle_events where session_id = t.sid71(7322) and kind = 'leg.arrived') from t.s71 where k = 'b_arr'), 'true|true|true|driver forgot to press');
select t.eq('s3: refused arrivals left the leg untouched until the good one (one arrived leg, one visit at position 1)', (select count(*) from shuttle_station_visits where session_id = t.sid71(7322) and station_idx = 1), 1::bigint);

-- 4. forward to the last station, reversal (bus A, manager) --------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s3: A loads at Suez', $$select public.shuttle_open_loading(t.sid71(7321), 'arrived', 'a2-open')$$);
select t.passes('s3: A departs Suez', $$select public.shuttle_depart(t.sid71(7321), 'loading', 'a2-dep')$$);
select t.passes('s3: A arrives Sokhna', $$select public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a2-arr')$$);
select t.passes('s3: A loads at Sokhna', $$select public.shuttle_open_loading(t.sid71(7321), 'arrived', 'a3-open')$$);
select t.passes('s3: A departs Sokhna', $$select public.shuttle_depart(t.sid71(7321), 'loading', 'a3-dep')$$);
select t.passes('s3: A arrives Porto (last)', $$insert into t.s71 select 'a_last', public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a3-arr')$$);
select t.as_admin();
select t.eq('s3: last station flagged', (select v ->> 'station_name' || '|' || (v ->> 'last_station') from t.s71 where k = 'a_last'), 'S3 Porto|true');
select t.eq('s3: 3 legs, seq 1..3, each snapshot is bus A and driver 1', (select string_agg(seq::text, ',' order by seq) || '|' || bool_and(vehicle_id = t.u(7321) and driver_id = t.u(7331))::text from shuttle_legs where session_id = t.sid71(7321)), '1,2,3|true');
select t.as_user(t.u(3));
select t.raises('s3: depart is impossible from the arrived state', $$select public.shuttle_depart(t.sid71(7321), 'arrived', 'a4-x')$$, '23514');
select t.passes('s3: open loading at the last station reverses the bus', $$insert into t.s71 select 'a_rev', public.shuttle_open_loading(t.sid71(7321), 'arrived', 'a4-open')$$);
select t.as_admin();
select t.eq('s3: reversed: loading at position 0 = Porto of a backward run', (select v ->> 'state' || '|' || (v ->> 'reversed') || '|' || (v ->> 'direction') || '|' || (v ->> 'station_pos') || '|' || (v ->> 'station_name') from t.s71 where k = 'a_rev'), 'loading|true|backward|0|S3 Porto');
select t.eq('s3: old run finished, new run planned with the next run number', (select string_agg(r.run_no::text || ':' || r.direction || ':' || r.status, ',' order by r.run_no) from shuttle_runs r where r.session_id = t.sid71(7321)), '1:forward:finished,5:backward:planned');
select t.eq('s3: new run has 3 fresh segments at bus capacity, counters 0', (select count(*)::text || '|' || sum(capacity)::text || '|' || max(confirmed_seats)::text from shuttle_run_segments where run_id = (select current_run_id from shuttle_vehicle_sessions where id = t.sid71(7321))), '3|33|0');
select t.eq('s3: session now on the new run at position 0', (select (current_run_id = (v ->> 'run_id')::uuid)::text || '|' || station_idx::text || '|' || state from shuttle_vehicle_sessions s, t.s71 where k = 'a_rev' and s.id = t.sid71(7321)), 'true|0|loading');
select t.eq('s3: run.reversed event logged', (select count(*) from shuttle_events where session_id = t.sid71(7321) and kind = 'run.reversed'), 1::bigint);
select t.eq('s3: bookings of the old run are not carried: old run segments untouched (3 rows)', (select count(*) from shuttle_run_segments where run_id = (select id from shuttle_runs where session_id = t.sid71(7321) and run_no = 1)), 3::bigint);
select t.as_user(t.u(3));
select t.passes('s3: the reversed bus departs: leg 4, from 0 to 1 of the backward run', $$insert into t.s71 select 'a_dep4', public.shuttle_depart(t.sid71(7321), 'loading', 'a4-dep')$$);
select t.as_admin();
select t.eq('s3: leg 4 names run backwards (Porto -> Sokhna)', (select v ->> 'seq' || '|' || (v ->> 'from_name') || '|' || (v ->> 'to_name') from t.s71 where k = 'a_dep4'), '4|S3 Porto|S3 Sokhna');
select t.eq('s3: new run is active', (select status from shuttle_runs where id = (select (v ->> 'run_id')::uuid from t.s71 where k = 'a_dep4')), 'active');

-- 5. bus C starts at position 2, no reversal needed to reach the end -------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s3: C opens loading at position 2 (Sokhna)', $$insert into t.s71 select 'c_open', public.shuttle_open_loading(t.sid71(7323), 'ready', 'c-open')$$);
select t.passes('s3: C departs', $$select public.shuttle_depart(t.sid71(7323), 'loading', 'c-dep')$$);
select t.passes('s3: C arrives at the last station', $$select public.shuttle_arrive(t.sid71(7323), 'in_transit', 'c-arr')$$);
select t.passes('s3: C reverses', $$insert into t.s71 select 'c_rev', public.shuttle_open_loading(t.sid71(7323), 'arrived', 'c-rev')$$);
select t.as_admin();
select t.eq('s3: run numbers stay unique across buses of one day', (select count(distinct run_no) = count(*) from shuttle_runs where day_id = (select (v ->> 'day_id')::uuid from t.s71 where k = 'day1')), true);

-- 6. one-way service: the last station ends the session ---------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s3: bus 6 loads', $$select public.shuttle_open_loading(t.sid71(7326), 'ready', 'o-open')$$);
select t.passes('s3: bus 6 departs', $$select public.shuttle_depart(t.sid71(7326), 'loading', 'o-dep')$$);
select t.passes('s3: bus 6 arrives at X2', $$select public.shuttle_arrive(t.sid71(7326), 'in_transit', 'o-arr')$$);
select t.passes('s3: bus 6 loads at X2', $$select public.shuttle_open_loading(t.sid71(7326), 'arrived', 'o-open2')$$);
select t.passes('s3: bus 6 departs X2', $$select public.shuttle_depart(t.sid71(7326), 'loading', 'o-dep2')$$);
select t.passes('s3: bus 6 arrives at X3 (last)', $$select public.shuttle_arrive(t.sid71(7326), 'in_transit', 'o-arr2')$$);
select t.passes('s3: no reversal allowed: opening loading at the end completes the session', $$insert into t.s71 select 'o_end', public.shuttle_open_loading(t.sid71(7326), 'arrived', 'o-end')$$);
select t.as_admin();
select t.eq('s3: completed, run finished, no new run, assignment closed', (select (v ->> 'state') || '|' || (v ->> 'reversed') || '|' || (select string_agg(status, ',') from shuttle_runs where session_id = t.sid71(7326))
  || '|' || (select count(*) from shuttle_assignments where session_id = t.sid71(7326) and effective_to is null) from t.s71 where k = 'o_end'), 'completed|false|finished|0');
select t.eq('s3: the bus is free again (no live session for bus 6)', (select count(*) from shuttle_vehicle_sessions where vehicle_id = t.u(7326) and state <> 'completed'), 0::bigint);

-- 7. out of service / return / end (bus D, idle) ---------------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.raises('s3: out of service needs a reason', $$select public.shuttle_set_out_of_service(t.sid71(7324), 'ready', 'd1', '  ')$$, '22023');
select t.raises('s3: out of service reason too short', $$select public.shuttle_set_out_of_service(t.sid71(7324), 'ready', 'd1', 'x')$$, '22023');
select t.passes('s3: D out of service while ready', $$insert into t.s71 select 'd_oos', public.shuttle_set_out_of_service(t.sid71(7324), 'ready', 'd-oos', 'flat tyre')$$);
select t.raises('s3: no loading while out of service', $$select public.shuttle_open_loading(t.sid71(7324), 'out_of_service', 'd-x')$$, '23514');
select t.raises('s3: cannot be out of service twice', $$select public.shuttle_set_out_of_service(t.sid71(7324), 'out_of_service', 'd-oos2', 'again please')$$, '23514');
select t.passes('s3: D returns to service', $$insert into t.s71 select 'd_ret', public.shuttle_return_to_service(t.sid71(7324), 'out_of_service', 'd-ret')$$);
select t.as_admin();
select t.eq('s3: resumes ready, reason stored on the event', (select (v ->> 'state') || '|' || (select payload ->> 'reason' from shuttle_events where session_id = t.sid71(7324) and kind = 'session.out_of_service') from t.s71 where k = 'd_ret'), 'ready|flat tyre');
select t.eq('s3: out_of_service_from cleared', (select out_of_service_from is null from shuttle_vehicle_sessions where id = t.sid71(7324)), true);
select t.as_user(t.u(3));
select t.passes('s3: D loads', $$select public.shuttle_open_loading(t.sid71(7324), 'ready', 'd-open')$$);
select t.passes('s3: D out of service while loading', $$select public.shuttle_set_out_of_service(t.sid71(7324), 'loading', 'd-oos3', 'door jammed')$$);
select t.passes('s3: D returns: resumes as arrived (visit kept)', $$insert into t.s71 select 'd_ret2', public.shuttle_return_to_service(t.sid71(7324), 'out_of_service', 'd-ret2')$$);
select t.as_admin();
select t.eq('s3: back as arrived', (select v ->> 'state' from t.s71 where k = 'd_ret2'), 'arrived');
select t.as_user(t.u(3));
select t.passes('s3: D opens loading again: same visit, loading reopened', $$insert into t.s71 select 'd_open2', public.shuttle_open_loading(t.sid71(7324), 'arrived', 'd-open2')$$);
select t.as_admin();
select t.eq('s3: still one visit for D', (select count(*) from shuttle_station_visits where session_id = t.sid71(7324)), 1::bigint);
select t.as_user(t.u(3));
select t.passes('s3: D departs', $$select public.shuttle_depart(t.sid71(7324), 'loading', 'd-dep')$$);
select t.raises('s3: cannot go out of service while in transit', $$select public.shuttle_set_out_of_service(t.sid71(7324), 'in_transit', 'd-oos4', 'engine fire')$$, '23514');
select t.raises('s3: cannot end a session in transit', $$select public.shuttle_end_session(t.sid71(7324), 'in_transit', 'd-end0')$$, '23514');
select t.passes('s3: D arrives', $$select public.shuttle_arrive(t.sid71(7324), 'in_transit', 'd-arr')$$);
select t.passes('s3: manager ends the session', $$insert into t.s71 select 'd_end', public.shuttle_end_session(t.sid71(7324), 'arrived', 'd-end')$$);
select t.as_admin();
select t.eq('s3: ended: completed, run finished, assignment closed, event', (select (v ->> 'state') || '|' || (select status from shuttle_runs where session_id = t.sid71(7324)) || '|' || (select count(*) from shuttle_assignments where session_id = t.sid71(7324) and effective_to is null)
  || '|' || (select count(*) from shuttle_events where session_id = t.sid71(7324) and kind = 'session.ended') from t.s71 where k = 'd_end'), 'completed|finished|0|1');
select t.as_user(t.u(3));
select t.raises('s3: nothing can be done to a completed session', $$select public.shuttle_open_loading(t.sid71(7324), 'completed', 'd-z')$$, '23514');
select t.passes('s3: ending a never-started session aborts its run (bus 5, day 2)', $$select public.shuttle_end_session(t.sid71(7325), 'ready', 'f-end')$$);
select t.as_admin();
select t.eq('s3: that run is aborted', (select status from shuttle_runs where session_id = t.sid71(7325)), 'aborted');

-- 8. immutability and integrity -----------------------------------------------------------------------------------------------------
select t.raises('s3: a leg''s bus cannot change', $$update shuttle_legs set vehicle_id = t.u(7325) where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: a leg''s driver cannot change', $$update shuttle_legs set driver_id = t.u(7335) where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: a leg''s stations cannot change', $$update shuttle_legs set from_station_idx = 1, to_station_idx = 2 where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: a leg''s departure cannot change', $$update shuttle_legs set departed_at = now() - interval '1 day' where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: an arrived leg cannot go back in transit', $$update shuttle_legs set status = 'in_transit', arrived_at = null where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: an arrived leg cannot be interrupted', $$update shuttle_legs set status = 'interrupted', arrived_at = null where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: an arrived leg keeps its arrival', $$update shuttle_legs set arrived_at = arrived_at + interval '1 minute' where session_id = t.sid71(7321) and seq = 1$$, '23514');
select t.raises('s3: arrived status needs an arrival time (CHECK)', $$insert into shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id, status)
  select company_id, current_run_id, id, 92, 0, 1, vehicle_id, current_driver_id, 'arrived' from shuttle_vehicle_sessions where id = t.sid71(7322)$$, '23514');
select t.raises('s3: legs cannot be deleted', $$delete from shuttle_legs$$, null);
select t.raises('s3: legs cannot be truncated', $$truncate shuttle_legs$$, null);
select t.raises('s3: visits cannot be deleted', $$delete from shuttle_station_visits$$, null);
select t.raises('s3: a leg must hop to the next neighbour (CHECK)', $$insert into shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id)
  select company_id, current_run_id, id, 90, 0, 2, vehicle_id, current_driver_id from shuttle_vehicle_sessions where id = t.sid71(7322)$$, '23514');
select t.raises('s3: a second in-transit leg for one session is impossible (partial unique)', $$insert into shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id)
  select company_id, current_run_id, id, 91, 0, 1, vehicle_id, current_driver_id from shuttle_vehicle_sessions where id = t.sid71(7321)$$, '23505');
select t.raises('s3: a repeated leg seq for one session is impossible', $$insert into shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id, status, arrived_at)
  select company_id, current_run_id, id, 1, 0, 1, vehicle_id, current_driver_id, 'arrived', now() from shuttle_vehicle_sessions where id = t.sid71(7321)$$, '23505');
select t.raises('s3: a repeated visit for the same station and run is impossible', $$insert into shuttle_station_visits (company_id, session_id, run_id, station_idx)
  select company_id, session_id, run_id, station_idx from shuttle_station_visits where session_id = t.sid71(7322) limit 1$$, '23505');
select t.raises('s3: visit: loading cannot start before arrival (CHECK)', $$update shuttle_station_visits set loading_started_at = arrived_at - interval '1 minute' where session_id = t.sid71(7322) and station_idx = 0$$, '23514');
select t.raises('s3: visit: departed needs closed loading (CHECK)', $$update shuttle_station_visits set loading_closed_at = null where session_id = t.sid71(7322) and station_idx = 0$$, '23514');
select t.raises('s3: a finished run cannot be re-activated', $$update shuttle_runs set status = 'active' where session_id = t.sid71(7324)$$, '23514');
select t.raises('s3: a planned run cannot jump to finished', $$update shuttle_runs set status = 'finished' where id = (select current_run_id from shuttle_vehicle_sessions where id = t.sid71(7321)) and status = 'planned' and false or id = (select current_run_id from shuttle_vehicle_sessions where id = t.sid71(7323)) and status = 'planned'$$, '23514');
select t.raises('s3: a run''s direction cannot change', $$update shuttle_runs set direction = 'forward' where session_id = t.sid71(7322)$$, '23514');
select t.raises('s3: event idempotency key is unique per session', $$insert into shuttle_events (company_id, day_id, session_id, kind, actor_role, idempotency_key)
  select company_id, day_id, session_id, 'a.b.c', 'x', idempotency_key from shuttle_events where idempotency_key = 'a-open' limit 1$$, '23505');
select t.eq('s3: tenant guard covers visits and legs', (select count(*) from app_private.tenant_guard_problems() where table_name in ('shuttle_station_visits', 'shuttle_legs')), 0::bigint);
select t.eq('s3: guard fires first on visits and legs', (select count(*) from (select c.relname, min(tg.tgname) as first_trigger from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  where c.relname in ('shuttle_station_visits', 'shuttle_legs') and not tg.tgisinternal and (tg.tgtype & 2) = 2 group by c.relname) x where first_trigger <> '000_tenant_guard'), 0::bigint);

-- 9. day must be open --------------------------------------------------------------------------------------------------------------
select t.as_admin();
update shuttle_operating_days set status = 'closed', closed_at = now() where id = (select (v ->> 'day_id')::uuid from t.s71 where k = 'day2');
select t.as_user(t.u(3));
select t.raises('s3: nothing runs on a closed day', $$select public.shuttle_open_loading(t.sid71(7325), 'ready', 'closed-1')$$, '23514');
select t.as_admin();

-- 10. reads: RLS + vehicle detail -----------------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.eq('s3: operations reads visits and legs', (select (select count(*) > 0 from shuttle_station_visits)::text || (select count(*) > 0 from shuttle_legs)::text), 'truetrue');
select t.as_user(t.u(6));
select t.eq('s3: driver reads none of them', (select (select count(*) from shuttle_station_visits) + (select count(*) from shuttle_legs)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('s3: owner B reads none of them', (select (select count(*) from shuttle_station_visits) + (select count(*) from shuttle_legs)), 0::bigint);
select t.as_user(t.u(9));
select t.eq('s3: platform support reads legs', (select count(*) > 0 from shuttle_legs), true);
select t.as_anon();
select t.raises('s3: anon cannot read legs', $$select count(*) from shuttle_legs$$, '42501');
select t.as_user(t.u(2));
select t.raises('s3: owner cannot insert a leg', $$insert into shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id) select company_id, current_run_id, id, 99, 0, 1, vehicle_id, current_driver_id from shuttle_vehicle_sessions limit 1$$, '42501');
select t.raises('s3: owner cannot update a visit', $$update shuttle_station_visits set late_recorded = true$$, '42501');
select t.as_user(t.u(5));
select t.passes('s3: booking staff reads the vehicle detail (shuttle.read): bus B in the middle of its run', $$insert into t.s71 select 'det', public.shuttle_vehicle_detail(t.sid71(7322))$$);
select t.as_admin();
select t.eq('s3: detail: session, backward stations in travel order, visit at position 1', (select (v -> 'session' ->> 'state') || '|' || (v -> 'session' ->> 'plate') || '|' || (v -> 'session' ->> 'station_name') || '|' || (v -> 'stations' ->> 0) || '>' || (v -> 'stations' ->> 3)
  || '|' || (v -> 'visit' ->> 'station_pos') || '|' || (v -> 'visit' ->> 'late_recorded') || '|' || (v -> 'run' ->> 'direction') from t.s71 where k = 'det'), 'arrived|S3-2|S3 Sokhna|S3 Porto>S3 Campus|1|true|backward');
select t.eq('s3: detail: no leg in transit, one finished leg listed, events listed with the late reason', (select ((v -> 'leg')::text) || '|' || jsonb_array_length(v -> 'legs') || '|' || (select count(*) from jsonb_array_elements(v -> 'events') e where e ->> 'reason' = 'driver forgot to press') from t.s71 where k = 'det'), 'null|1|1');
select t.as_user(t.u(3));
select t.passes('s3: detail of a bus in transit shows the leg', $$insert into t.s71 select 'det2', public.shuttle_vehicle_detail(t.sid71(7321))$$);
select t.as_admin();
select t.eq('s3: ... leg 4 Porto -> Sokhna in transit, not overdue', (select (v -> 'leg' ->> 'seq') || '|' || (v -> 'leg' ->> 'overdue') || '|' || (v -> 'legs' -> 0 ->> 'from_name') || '>' || (v -> 'legs' -> 0 ->> 'to_name') from t.s71 where k = 'det2'), '4|false|S3 Porto>S3 Sokhna');
select t.as_user(t.u(7));
select t.raises('s3: owner B cannot read the detail', $$select public.shuttle_vehicle_detail(t.sid71(7322))$$, 'P0002');
select t.as_user(t.u(6));
select t.raises('s3: driver cannot read the staff detail', $$select public.shuttle_vehicle_detail(t.sid71(7321))$$, 'P0002');
select t.as_anon();
select t.raises('s3: anon cannot read the detail', $$select public.shuttle_vehicle_detail(t.sid71(7321))$$, '42501');

-- 11. overdue job ------------------------------------------------------------------------------------------------------------------
select t.as_admin();
select t.eq('s3: the job is registered and its function exists', (select (to_regprocedure('app_private.' || fn || '()') is not null)::text || '|' || enabled::text from app_private.jobs where name = 'shuttle-overdue-legs'), 'true|true');
select app_private.shuttle_flag_overdue_legs();
select t.eq('s3: a fresh leg is not flagged', (select count(*) from shuttle_legs where overdue_flagged_at is not null), 0::bigint);
set session_replication_role = replica;
update shuttle_legs set departed_at = now() - interval '15 minutes' where session_id = t.sid71(7321) and seq = 4;
update shuttle_station_visits set departed_at = now() - interval '15 minutes', loading_closed_at = now() - interval '16 minutes', loading_started_at = now() - interval '17 minutes', arrived_at = now() - interval '18 minutes' where session_id = t.sid71(7321) and run_id = (select run_id from shuttle_legs where session_id = t.sid71(7321) and seq = 4);
set session_replication_role = origin;
select app_private.shuttle_flag_overdue_legs();
select t.eq('s3: 15 minutes with a 20 minute default is not overdue', (select count(*) from shuttle_legs where overdue_flagged_at is not null), 0::bigint);
set session_replication_role = replica;
update shuttle_legs set departed_at = now() - interval '50 minutes' where session_id = t.sid71(7321) and seq = 4;
update shuttle_station_visits set departed_at = now() - interval '50 minutes', loading_closed_at = now() - interval '51 minutes', loading_started_at = now() - interval '52 minutes', arrived_at = now() - interval '53 minutes' where session_id = t.sid71(7321) and run_id = (select run_id from shuttle_legs where session_id = t.sid71(7321) and seq = 4);
set session_replication_role = origin;
select app_private.shuttle_flag_overdue_legs();
select t.eq('s3: 50 minutes (> 2 x 20) is flagged once, with a system event', (select (select count(*) from shuttle_legs where overdue_flagged_at is not null and session_id = t.sid71(7321))::text
  || '|' || (select count(*) from shuttle_events where kind = 'leg.overdue' and session_id = t.sid71(7321))::text || '|' || (select actor_role from shuttle_events where kind = 'leg.overdue' and session_id = t.sid71(7321))), '1|1|system');
select app_private.shuttle_flag_overdue_legs();
select t.eq('s3: the job does not flag it twice', (select count(*) from shuttle_events where kind = 'leg.overdue' and session_id = t.sid71(7321)), 1::bigint);
select t.as_user(t.u(3));
select t.passes('s3: detail shows overdue', $$insert into t.s71 select 'det3', public.shuttle_vehicle_detail(t.sid71(7321))$$);
select t.as_admin();
select t.eq('s3: ... overdue true', (select v -> 'leg' ->> 'overdue' from t.s71 where k = 'det3'), 'true');
select t.passes('s3: the flagged leg can still arrive normally', $$select 1$$);
select t.as_user(t.u(3));
select t.passes('s3: ... arrive after the flag', $$select public.shuttle_arrive(t.sid71(7321), 'in_transit', 'a5-arr')$$);

-- 12. rate limit -------------------------------------------------------------------------------------------------------------------
select t.as_admin();
delete from app_private.rate_limit_counters;
select t.as_user(t.u(3));
select t.raises('s3: more than 30 actions a minute by one user are refused (PT429)', $$do $b$ begin for i in 1..40 loop perform public.shuttle_open_loading(t.sid71(7321), 'ready', 'a-open'); end loop; end $b$$, null);
select t.as_admin();
delete from app_private.rate_limit_counters;

-- restore shared values
update drivers set user_id = null where id = t.u(7331);
update drivers set user_id = t.u(6) where id in (select id from s3_u6);
update plan_entitlements set bool_value = (select feat from s3_saved) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = (select vmax from s3_saved) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
