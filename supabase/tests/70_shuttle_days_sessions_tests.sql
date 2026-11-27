-- 70: Continuous Shuttle S2 (migration 0075). Harness style. Needs 01 fixtures (company A u(101) professional, B u(102); users u(3) manager,
-- u(4) operations, u(5) booking, u(6) is linked to driver row u(7037) by this suite, u(7) ownerB, u(9) platform support; B bus u(224), B driver u(233)).
-- Own fixtures (ids 70xx): route 7001 with 3 stops in A, A service 7101, 8 buses 7021-7028 (7023 inactive), 7 drivers 7031-7037 (7033 inactive),
-- B route 203 service 7102. Company-local "today" is computed from company_settings.timezone, never from the server clock zone.
select t.as_admin();
delete from t.results where name like 's2: %';
create temp table s2_saved as select
  (select bool_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'feature_shuttle_ops') as feat,
  (select int_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'max_shuttle_vehicles') as vmax;
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = 6 where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');

create table if not exists t.s70 (k text primary key, v jsonb);
alter table t.s70 disable row level security; grant all on t.s70 to anon, authenticated;
delete from t.s70;
create or replace function t.d70(n int) returns date language sql security definer as
  $$ select (now() at time zone coalesce((select timezone from public.company_settings where company_id = t.u(101)), 'UTC'))::date + n $$;
create or replace function t.v70(b int, d int, i int, dir text) returns jsonb language sql immutable as
  $$ select jsonb_build_object('bus_id', t.u(b), 'driver_id', t.u(d), 'start_station_idx', i, 'direction', dir) $$;
create or replace function t.cnt70(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
create or replace function t.imd70(c uuid, s uuid) returns boolean language sql security definer as $$ select app_private.is_my_shuttle_driver(c, s) $$;
grant execute on function t.d70(int), t.v70(int, int, int, text), t.cnt70(text), t.imd70(uuid, uuid) to authenticated, anon;

insert into routes (id, company_id, name, origin_name, destination_name) values (t.u(7001), t.u(101), 'S2 route', 'Campus', 'Port');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(7011), t.u(101), t.u(7001), 'S2 Campus', 1, 'both'), (t.u(7012), t.u(101), t.u(7001), 'S2 Mid', 2, 'both'), (t.u(7013), t.u(101), t.u(7001), 'S2 Port', 3, 'both'),
  (t.u(7014), t.u(102), t.u(203), 'S2 B stop', 60, 'both');
insert into shuttle_services (id, company_id, route_id, name, outbound_direction, hub_stop_id) values
  (t.u(7101), t.u(101), t.u(7001), 'S2 Shuttle', 'forward', t.u(7011)), (t.u(7102), t.u(102), t.u(203), 'S2 B Shuttle', 'forward', null);
insert into buses (id, company_id, plate_number, capacity, status) values
  (t.u(7021), t.u(101), 'S2-1', 10, 'active'), (t.u(7022), t.u(101), 'S2-2', 20, 'active'), (t.u(7023), t.u(101), 'S2-3', 10, 'inactive'),
  (t.u(7024), t.u(101), 'S2-4', 15, 'active'), (t.u(7025), t.u(101), 'S2-5', 12, 'active'), (t.u(7026), t.u(101), 'S2-6', 10, 'active'),
  (t.u(7027), t.u(101), 'S2-7', 10, 'active'), (t.u(7028), t.u(101), 'S2-8', 10, 'active');
insert into drivers (id, company_id, full_name, phone, status) values
  (t.u(7031), t.u(101), 'S2 driver 1', '+201000070031', 'active'), (t.u(7032), t.u(101), 'S2 driver 2', '+201000070032', 'active'),
  (t.u(7033), t.u(101), 'S2 driver 3 off', '+201000070033', 'inactive'), (t.u(7034), t.u(101), 'S2 driver 4', '+201000070034', 'active'),
  (t.u(7035), t.u(101), 'S2 driver 5', '+201000070035', 'active'), (t.u(7036), t.u(101), 'S2 driver 6', '+201000070036', 'active'),
  (t.u(7037), t.u(101), 'S2 driver 7', '+201000070037', 'active');
-- scheduled trips TOMORROW (company-local noon / 15:00): bus 7026 + driver 7037, and bus 7028 + driver 7036
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(7201), t.u(101), t.u(201), t.u(7026), t.u(7037), ((t.d70(1))::timestamp + interval '12 hours') at time zone (select timezone from company_settings where company_id = t.u(101)),
     ((t.d70(1))::timestamp + interval '14 hours') at time zone (select timezone from company_settings where company_id = t.u(101)), 50, 5, 'scheduled'),
  (t.u(7202), t.u(101), t.u(201), t.u(7028), t.u(7036), ((t.d70(1))::timestamp + interval '15 hours') at time zone (select timezone from company_settings where company_id = t.u(101)),
     ((t.d70(1))::timestamp + interval '17 hours') at time zone (select timezone from company_settings where company_id = t.u(101)), 50, 5, 'scheduled');

-- earlier suites unlink driver 231, so pin the login link: user 6 drives driver 7037 here (restored at the end)
create temp table s2_u6 as select id from drivers where user_id = t.u(6);
update drivers set user_id = null where user_id = t.u(6);
update drivers set user_id = t.u(6) where id = t.u(7037);

-- 1. start a day (manager) -------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s2: manager starts today with 3 vehicles', $$insert into t.s70 select 'today', public.shuttle_start_day(t.u(7101), t.d70(0),
  jsonb_build_array(t.v70(7021, 7031, 0, 'forward'), t.v70(7022, 7032, 2, 'backward'), t.v70(7025, 7037, 1, 'forward')), 'key-today-1')$$);
select t.as_admin();
select t.eq('s2: result has 3 sessions and replayed false', (select jsonb_array_length(v -> 'sessions')::text || '/' || (v ->> 'replayed') from t.s70 where k = 'today'), '3/false');
select t.eq('s2: one open day for the date', (select count(*) from shuttle_operating_days where service_id = t.u(7101) and service_date = t.d70(0) and status = 'open'), 1::bigint);
select t.eq('s2: 3 sessions all ready, 3 runs numbered 1..3', (select count(*) filter (where s.state = 'ready')::text || '/' || string_agg(r.run_no::text, ',' order by r.run_no)
  from shuttle_vehicle_sessions s join shuttle_runs r on r.session_id = s.id where s.day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), '3/1,2,3');
select t.eq('s2: 2 segments per run (3 stations) = 6 rows, capacity = bus capacity', (select count(*)::text || '/' || sum(capacity)::text from shuttle_run_segments sg
  join shuttle_runs r on r.id = sg.run_id where r.day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), '6/84');
select t.eq('s2: counters start at 0', (select max(confirmed_seats) from shuttle_run_segments where company_id = t.u(101)), 0::smallint);
select t.eq('s2: assignments one per session, open', (select count(*) from shuttle_assignments where effective_to is null and reason = 'day_start'
  and session_id in (select id from shuttle_vehicle_sessions where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today'))), 3::bigint);
select t.eq('s2: events: 3 session.started + 1 day.started', (select count(*) filter (where kind = 'session.started')::text || '/' || count(*) filter (where kind = 'day.started')::text
  from shuttle_events where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), '3/1');
select t.eq('s2: event actor role is the manager role', (select distinct actor_role from shuttle_events where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), 'manager');
select t.eq('s2: station snapshot has 3 stations in stop order', (select (stations -> 0 ->> 'name') || '|' || (stations -> 2 ->> 'name') || '|' || jsonb_array_length(stations)::text
  from shuttle_operating_days where id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), 'S2 Campus|S2 Port|3');
select t.eq('s2: config snapshot copies the service settings', (select config ->> 'name' || '/' || (config ->> 'request_ttl_minutes') from shuttle_operating_days
  where id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), 'S2 Shuttle/20');
select t.eq('s2: travel position: backward from the last stop is position 0', (select string_agg(s.station_idx::text, ',' order by r.run_no) from shuttle_vehicle_sessions s
  join shuttle_runs r on r.session_id = s.id where s.day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), '0,0,1');
select t.eq('s2: session capacity is the bus capacity snapshot', (select string_agg(capacity::text, ',' order by capacity) from shuttle_vehicle_sessions
  where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today')), '10,12,20');
select t.eq('s2: audit row written', (select count(*) from audit_logs where action = 'shuttle_day.started' and company_id = t.u(101)), 1::bigint);

-- 2. replay and double start -------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.passes('s2: same key replays', $$insert into t.s70 select 'replay', public.shuttle_start_day(t.u(7101), t.d70(0),
  jsonb_build_array(t.v70(7021, 7031, 0, 'forward')), 'key-today-1')$$);
select t.eq('s2: replay returns the stored day, replayed true', (select ((select v ->> 'day_id' from t.s70 where k = 'replay') = (select v ->> 'day_id' from t.s70 where k = 'today'))::text
  || '/' || (select v ->> 'replayed' from t.s70 where k = 'replay') || '/' || (select jsonb_array_length(v -> 'sessions') from t.s70 where k = 'replay')), 'true/true/3');
select t.raises('s2: a different key for the same date is refused (no double day)', $$select public.shuttle_start_day(t.u(7101), t.d70(0),
  jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'key-today-2')$$, '23505');
select t.as_admin();
select t.eq('s2: still exactly one day, 3 sessions', (select count(*)::text || '/' || (select count(*) from shuttle_vehicle_sessions where company_id = t.u(101) and state <> 'completed')::text
  from shuttle_operating_days where service_id = t.u(7101) and status <> 'cancelled'), '1/3');

-- 3. who may start ---------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5));
select t.raises('s2: booking staff cannot start (no shuttle.operate)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-b')$$, 'P0002');
select t.as_user(t.u(6));
select t.raises('s2: driver cannot start', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-d')$$, 'P0002');
select t.as_admin();
create temp table s2_bplan as select plan_id from subscriptions where company_id = t.u(102);
update subscriptions set plan_id = (select id from plans where code = 'starter') where company_id = t.u(102);
select t.as_user(t.u(7));
select t.raises('s2: owner B cannot start company A service (looks like not found)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-bo')$$, 'P0002');
select t.raises('s2: owner B on own service: plan has no shuttle feature', $$select public.shuttle_start_day(t.u(7102), t.d70(1), jsonb_build_array(t.v70(224, 233, 0, 'forward')), 'k-bs')$$, '42501');
select t.as_admin();
update subscriptions set plan_id = (select plan_id from s2_bplan) where company_id = t.u(102);
select t.as_anon();
select t.raises('s2: anon cannot start', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-a')$$, '42501');
select t.as_user(t.u(4));
select t.passes('s2: operations may start (yesterday, one bus)', $$insert into t.s70 select 'yday', public.shuttle_start_day(t.u(7101), t.d70(-1), jsonb_build_array(t.v70(7024, 7034, 0, 'forward')), 'key-yday')$$);
select t.as_admin();
select t.eq('s2: ops event role is operations', (select distinct actor_role from shuttle_events where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday')), 'operations');

-- 4. validation ------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3));
select t.raises('s2: date two days ahead', $$select public.shuttle_start_day(t.u(7101), t.d70(2), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k')$$, '22023');
select t.raises('s2: date three days back', $$select public.shuttle_start_day(t.u(7101), t.d70(-3), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k')$$, '22023');
select t.raises('s2: null date', $$select public.shuttle_start_day(t.u(7101), null, jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k')$$, '22023');
select t.raises('s2: blank key', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), '  ')$$, '22023');
select t.raises('s2: null key', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), null)$$, '22023');
select t.raises('s2: empty vehicle list', $$select public.shuttle_start_day(t.u(7101), t.d70(1), '[]'::jsonb, 'k')$$, '22023');
select t.raises('s2: vehicle list not an array', $$select public.shuttle_start_day(t.u(7101), t.d70(1), '{"a":1}'::jsonb, 'k')$$, '22023');
select t.raises('s2: 51 vehicles', $$select public.shuttle_start_day(t.u(7101), t.d70(1), (select jsonb_agg(t.v70(7027, 7035, 0, 'forward')) from generate_series(1, 51)), 'k')$$, '22023');
select t.raises('s2: same bus twice', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward'), t.v70(7027, 7037, 0, 'forward')), 'k')$$, '22023');
select t.raises('s2: same driver twice', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward'), t.v70(7026, 7035, 0, 'forward')), 'k')$$, '22023');
select t.raises('s2: bad direction', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'sideways')), 'k')$$, '22023');
select t.raises('s2: start on the last position (forward, last stop)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 2, 'forward')), 'k')$$, '22023');
select t.raises('s2: start on the last position (backward, first stop)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'backward')), 'k')$$, '22023');
select t.raises('s2: station index past the route', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 3, 'forward')), 'k')$$, '22023');
select t.raises('s2: negative station index', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(jsonb_build_object('bus_id', t.u(7027), 'driver_id', t.u(7035), 'start_station_idx', -1, 'direction', 'forward')), 'k')$$, '22023');
select t.raises('s2: bus id not a uuid', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(jsonb_build_object('bus_id', 'x', 'driver_id', t.u(7035), 'start_station_idx', 0, 'direction', 'forward')), 'k')$$, '22023');
select t.raises('s2: inactive bus', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7023, 7035, 0, 'forward')), 'k')$$, '23514');
select t.raises('s2: inactive driver', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7033, 0, 'forward')), 'k')$$, '23514');
select t.raises('s2: bus of another company', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(224, 7035, 0, 'forward')), 'k')$$, 'P0002');
select t.raises('s2: driver of another company', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 233, 0, 'forward')), 'k')$$, 'P0002');
select t.raises('s2: unknown bus', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7999, 7035, 0, 'forward')), 'k')$$, 'P0002');
select t.raises('s2: bus already in a live session (other date)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7021, 7035, 0, 'forward')), 'k')$$, '23505');
select t.raises('s2: driver already in a live session (other date)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7031, 0, 'forward')), 'k')$$, '23505');
select t.raises('s2: bus with a scheduled trip that day', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7026, 7035, 0, 'forward')), 'k')$$, '23514');
select t.raises('s2: driver with a scheduled trip that day', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7036, 0, 'forward')), 'k')$$, '23514');
select t.as_admin();
select t.eq('s2: every refused start left nothing behind (days for tomorrow)', (select count(*) from shuttle_operating_days where service_id = t.u(7101) and service_date = t.d70(1)), 0::bigint);

-- 5. plan limit and feature ------------------------------------------------------------------------------------------------------------
update plan_entitlements set int_value = (select count(*) from shuttle_vehicle_sessions where company_id = t.u(101) and state <> 'completed')
  where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
select t.as_user(t.u(3));
select t.raises('s2: live vehicle limit reached (53400)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-lim')$$, '53400');
select t.as_admin();
select t.eq('s2: the refused start created no day', (select count(*) from shuttle_operating_days where service_id = t.u(7101) and service_date = t.d70(1)), 0::bigint);
update plan_entitlements set int_value = 6 where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set bool_value = false where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
select t.as_user(t.u(3));
select t.raises('s2: feature off refuses a start (42501)', $$select public.shuttle_start_day(t.u(7101), t.d70(1), jsonb_build_array(t.v70(7027, 7035, 0, 'forward')), 'k-off')$$, '42501');
select t.as_admin();
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');

-- 6. cancel ----------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5));
select t.raises('s2: booking staff cannot cancel', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday'), 'wrong day')$$, 'P0002');
select t.as_user(t.u(7));
select t.raises('s2: owner B cannot cancel an A day', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday'), 'wrong day')$$, 'P0002');
select t.as_user(t.u(3));
select t.raises('s2: cancel needs a reason', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday'), 'x')$$, '22023');
select t.raises('s2: unknown day', $$select public.shuttle_cancel_day(t.u(7999), 'wrong day')$$, 'P0002');
select t.passes('s2: manager cancels the untouched day', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday'), 'started by mistake')$$);
select t.as_admin();
select t.eq('s2: day cancelled with the reason', (select status || '/' || cancelled_reason from shuttle_operating_days where id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday')), 'cancelled/started by mistake');
select t.eq('s2: its session completed, run aborted, assignment closed', (select s.state || '/' || r.status || '/' || (a.effective_to is not null)::text from shuttle_vehicle_sessions s
  join shuttle_runs r on r.session_id = s.id join shuttle_assignments a on a.session_id = s.id where s.day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday')), 'completed/aborted/true');
select t.eq('s2: cancel logged', (select count(*) from shuttle_events where kind = 'day.cancelled'), 1::bigint);
select t.as_user(t.u(3));
select t.raises('s2: a cancelled day cannot be cancelled again', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday'), 'again please')$$, '23514');
select t.passes('s2: the freed bus and driver can start the same date again', $$insert into t.s70 select 'yday2', public.shuttle_start_day(t.u(7101), t.d70(-1), jsonb_build_array(t.v70(7024, 7034, 0, 'forward')), 'key-yday-2')$$);
select t.as_admin();
update shuttle_vehicle_sessions set state = 'loading' where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday2');
select t.as_user(t.u(3));
select t.raises('s2: a day whose bus has started cannot be cancelled', $$select public.shuttle_cancel_day((select (v ->> 'day_id')::uuid from t.s70 where k = 'yday2'), 'too late now')$$, '23514');
select t.as_admin();
update shuttle_vehicle_sessions set state = 'completed' where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday2');
select t.eq('s2: completing a session closes its assignment (trigger)', (select count(*) from shuttle_assignments where effective_to is null
  and session_id in (select id from shuttle_vehicle_sessions where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'yday2'))), 0::bigint);

-- 7. state machine, immutability, integrity -------------------------------------------------------------------------------------------
select t.eq('s2: pick a today session', (select count(*) from shuttle_vehicle_sessions where day_id = (select (v ->> 'day_id')::uuid from t.s70 where k = 'today') and state = 'ready'), 3::bigint);
create temp table s2_ids as select (select id from shuttle_vehicle_sessions where vehicle_id = t.u(7021) and state = 'ready') as s1, (select id from shuttle_vehicle_sessions where vehicle_id = t.u(7022) and state = 'ready') as s2,
  (select id from shuttle_assignments where reason = 'day_start' and vehicle_id = t.u(7022)) as a2, (select id from shuttle_runs where session_id = (select id from shuttle_vehicle_sessions where vehicle_id = t.u(7021) and state = 'ready')) as r1;
select t.raises('s2: ready -> in_transit is illegal', format($$update shuttle_vehicle_sessions set state = 'in_transit' where id = %L$$, (select s1 from s2_ids)), '23514');
select t.raises('s2: ready -> arrived is illegal', format($$update shuttle_vehicle_sessions set state = 'arrived' where id = %L$$, (select s1 from s2_ids)), '23514');
select t.raises('s2: unknown state refused by CHECK', format($$update shuttle_vehicle_sessions set state = 'flying' where id = %L$$, (select s1 from s2_ids)), '23514');
select t.passes('s2: ready -> loading', format($$update shuttle_vehicle_sessions set state = 'loading' where id = %L$$, (select s1 from s2_ids)));
select t.raises('s2: loading -> ready is illegal', format($$update shuttle_vehicle_sessions set state = 'ready' where id = %L$$, (select s1 from s2_ids)), '23514');
select t.passes('s2: loading -> in_transit -> arrived -> loading', format($$update shuttle_vehicle_sessions set state = 'in_transit' where id = %1$L; update shuttle_vehicle_sessions set state = 'arrived' where id = %1$L; update shuttle_vehicle_sessions set state = 'loading' where id = %1$L$$, (select s1 from s2_ids)));
select t.passes('s2: arrived/loading -> out_of_service -> ready', format($$update shuttle_vehicle_sessions set state = 'out_of_service' where id = %1$L; update shuttle_vehicle_sessions set state = 'ready' where id = %1$L$$, (select s1 from s2_ids)));
select t.raises('s2: bus of a session cannot change', format($$update shuttle_vehicle_sessions set vehicle_id = t.u(7027) where id = %L$$, (select s1 from s2_ids)), '23514');
select t.raises('s2: day of a session cannot change', format($$update shuttle_vehicle_sessions set day_id = (select id from shuttle_operating_days where status = 'cancelled' limit 1) where id = %L$$, (select s1 from s2_ids)), '23514');
select t.raises('s2: a second live session for the same bus (unique index)', $$insert into shuttle_vehicle_sessions (company_id, day_id, vehicle_id, station_idx, current_driver_id, capacity)
  select company_id, day_id, vehicle_id, 0, t.u(7037), 10 from shuttle_vehicle_sessions where vehicle_id = t.u(7021) and state <> 'completed'$$, '23505');
select t.raises('s2: a second live session for the same driver (unique index)', $$insert into shuttle_vehicle_sessions (company_id, day_id, vehicle_id, station_idx, current_driver_id, capacity)
  select company_id, day_id, t.u(7027), 0, current_driver_id, 10 from shuttle_vehicle_sessions where vehicle_id = t.u(7021) and state <> 'completed'$$, '23505');
select t.passes('s2: completed is terminal: complete session 2 first', format($$update shuttle_vehicle_sessions set state = 'completed' where id = %L$$, (select s2 from s2_ids)));
select t.raises('s2: completed -> ready is illegal', format($$update shuttle_vehicle_sessions set state = 'ready' where id = %L$$, (select s2 from s2_ids)), '23514');
select t.raises('s2: completed -> loading is illegal', format($$update shuttle_vehicle_sessions set state = 'loading' where id = %L$$, (select s2 from s2_ids)), '23514');
select t.eq('s2: that completion closed its assignment', (select (effective_to is not null)::text from shuttle_assignments where id = (select a2 from s2_ids)), 'true');
select t.raises('s2: a closed assignment cannot be re-opened', format($$update shuttle_assignments set effective_to = null where id = %L$$, (select a2 from s2_ids)), '23514');
select t.raises('s2: a closed assignment cannot be closed again', format($$update shuttle_assignments set effective_to = now() + interval '1 day' where id = %L$$, (select a2 from s2_ids)), '23514');
select t.raises('s2: an assignment cannot change its driver', $$update shuttle_assignments set driver_id = t.u(7037) where effective_to is null$$, '23514');
select t.raises('s2: assignments cannot be deleted', $$delete from shuttle_assignments$$, null);
select t.raises('s2: overlapping assignment for a driver is refused (exclusion)', $$insert into shuttle_assignments (company_id, session_id, vehicle_id, driver_id, reason)
  select company_id, session_id, t.u(7027), driver_id, 'dup' from shuttle_assignments where effective_to is null and driver_id = t.u(7031)$$, '23P01');
select t.raises('s2: overlapping assignment for a bus is refused (exclusion)', $$insert into shuttle_assignments (company_id, session_id, vehicle_id, driver_id, reason)
  select company_id, session_id, vehicle_id, t.u(7037), 'dup' from shuttle_assignments where effective_to is null and vehicle_id = t.u(7021)$$, '23P01');
select t.raises('s2: events cannot be updated', $$update shuttle_events set kind = 'x.y.z'$$, null);
select t.raises('s2: events cannot be deleted', $$delete from shuttle_events$$, null);
select t.raises('s2: events cannot be truncated', $$truncate shuttle_events$$, null);
select t.raises('s2: event kind shape enforced', $$insert into shuttle_events (company_id, day_id, kind, actor_role) select company_id, id, 'BAD KIND', 'x' from shuttle_operating_days limit 1$$, '23514');
select t.raises('s2: segment above capacity refused', format($$update shuttle_run_segments set confirmed_seats = capacity + 1 where run_id = %L$$, (select r1 from s2_ids)), '23514');
select t.raises('s2: negative segment counter refused', format($$update shuttle_run_segments set confirmed_seats = -1 where run_id = %L$$, (select r1 from s2_ids)), '23514');
select t.passes('s2: segment can be filled to capacity', format($$update shuttle_run_segments set confirmed_seats = capacity where run_id = %L and seg_idx = 0$$, (select r1 from s2_ids)));
select t.raises('s2: day snapshot (stations) cannot change', $$update shuttle_operating_days set stations = '[]'::jsonb where status = 'open'$$, null);
select t.raises('s2: day snapshot (date) cannot change', $$update shuttle_operating_days set service_date = service_date + 1 where status = 'open'$$, '23514');
select t.raises('s2: open -> reconciled is illegal', $$update shuttle_operating_days set status = 'reconciled' where status = 'open'$$, '23514');
select t.raises('s2: cancelled needs a reason (CHECK)', $$update shuttle_operating_days set status = 'cancelled' where status = 'open'$$, '23514');
select t.raises('s2: cancelled -> open is illegal', $$update shuttle_operating_days set status = 'open', cancelled_reason = null where status = 'cancelled'$$, '23514');
select t.raises('s2: run_no is unique per day', $$insert into shuttle_runs (company_id, day_id, run_no, direction, session_id) select company_id, day_id, 1, 'forward', session_id from shuttle_runs where run_no = 1 limit 1$$, '23505');
select t.eq('s2: tenant guard covers every new table', (select count(*) from app_private.tenant_guard_problems() where table_name like 'shuttle_%'), 0::bigint);
select t.eq('s2: guard fires first on every new table', (select count(*) from (select c.relname, min(tg.tgname) as first_trigger from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
  where c.relname in ('shuttle_operating_days','shuttle_vehicle_sessions','shuttle_runs','shuttle_run_segments','shuttle_assignments','shuttle_events') and not tg.tgisinternal and (tg.tgtype & 2) = 2 group by c.relname) x
  where first_trigger <> '000_tenant_guard'), 0::bigint);

-- 8. reads: RLS + overview + driver helper --------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.eq('s2: operations reads days, sessions, runs, segments, assignments, events', (select (select count(*) > 0 from shuttle_operating_days)::text || (select count(*) > 0 from shuttle_vehicle_sessions)::text
  || (select count(*) > 0 from shuttle_runs)::text || (select count(*) > 0 from shuttle_run_segments)::text || (select count(*) > 0 from shuttle_assignments)::text || (select count(*) > 0 from shuttle_events)::text), 'truetruetruetruetruetrue');
select t.as_user(t.u(6));
select t.eq('s2: driver reads none of the day tables', (select (select count(*) from shuttle_operating_days) + (select count(*) from shuttle_vehicle_sessions) + (select count(*) from shuttle_runs) + (select count(*) from shuttle_events)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('s2: owner B sees none of company A', (select (select count(*) from shuttle_operating_days) + (select count(*) from shuttle_vehicle_sessions) + (select count(*) from shuttle_run_segments) + (select count(*) from shuttle_assignments)), 0::bigint);
select t.as_user(t.u(9));
select t.eq('s2: platform support can read days', (select count(*) > 0 from shuttle_operating_days), true);
select t.as_anon();
select t.raises('s2: anon cannot read days', $$select count(*) from shuttle_operating_days$$, '42501');
select t.as_user(t.u(2));
select t.raises('s2: owner cannot insert a day directly', $$insert into shuttle_operating_days (company_id, service_id, service_date, tz, stations, config, start_key) values (t.u(101), t.u(7101), current_date, 'UTC', '[1,2]', '{}', 'x')$$, '42501');
select t.raises('s2: owner cannot update a session directly', $$update shuttle_vehicle_sessions set state = 'completed'$$, '42501');
select t.raises('s2: owner cannot touch a segment counter', $$update shuttle_run_segments set confirmed_seats = 1$$, '42501');
select t.raises('s2: owner cannot insert an event', $$insert into shuttle_events (company_id, day_id, kind, actor_role) select company_id, id, 'a.b.c', 'x' from shuttle_operating_days limit 1$$, '42501');

select t.as_user(t.u(5));
select t.passes('s2: booking staff reads the overview (shuttle.read)', $$insert into t.s70 select 'ov', public.shuttle_overview(t.u(7101), t.d70(0))$$);
select t.as_admin();
select t.eq('s2: overview: open day, 2 live sessions (one completed above is still listed)', (select (v -> 'day' ->> 'status') || '/' || jsonb_array_length(v -> 'sessions') from t.s70 where k = 'ov'), 'open/3');
select t.eq('s2: overview names: plate, driver, station of the backward bus at position 0 = last stop',
  (select s ->> 'plate' || '|' || (s ->> 'driver_name') || '|' || (s ->> 'station_name') || '|' || (s ->> 'direction') from t.s70, jsonb_array_elements(v -> 'sessions') s where k = 'ov' and s ->> 'plate' = 'S2-2'), 'S2-2|S2 driver 2|S2 Port|backward');
select t.eq('s2: overview: forward bus at the first stop', (select s ->> 'station_name' from t.s70, jsonb_array_elements(v -> 'sessions') s where k = 'ov' and s ->> 'plate' = 'S2-1'), 'S2 Campus');
select t.as_user(t.u(5));
select t.passes('s2: overview of a date with no day', $$insert into t.s70 select 'ov2', public.shuttle_overview(t.u(7101), t.d70(1))$$);
select t.as_admin();
select t.eq('s2: ... has a null day and no sessions', (select (v -> 'day')::text || '/' || jsonb_array_length(v -> 'sessions') from t.s70 where k = 'ov2'), 'null/0');
select t.as_user(t.u(7));
select t.raises('s2: owner B cannot read the overview of company A', $$select public.shuttle_overview(t.u(7101), t.d70(0))$$, 'P0002');
select t.as_user(t.u(6));
select t.raises('s2: driver cannot read the overview (no shuttle.read)', $$select public.shuttle_overview(t.u(7101), t.d70(0))$$, 'P0002');
select t.as_anon();
select t.raises('s2: anon cannot read the overview', $$select public.shuttle_overview(t.u(7101), t.d70(0))$$, '42501');

select t.as_admin();
create temp table s2_drv as select s.id as sid, s.company_id from shuttle_vehicle_sessions s where s.current_driver_id = t.u(7037) and s.state <> 'completed';
grant select on s2_drv to authenticated, anon;
select t.eq('s2: the day has a live session for driver 7037', (select count(*) from s2_drv), 1::bigint);
select t.as_user(t.u(6));
select t.eq('s2: is_my_shuttle_driver true for the signed-in driver', t.imd70((select company_id from s2_drv), (select sid from s2_drv)), true);
select t.eq('s2: ... false for a session of another driver', t.imd70(t.u(101), (select id from shuttle_vehicle_sessions where vehicle_id = t.u(7021) and state <> 'completed')), false);
select t.as_user(t.u(3));
select t.eq('s2: ... false for a manager who is not the driver', t.imd70((select company_id from s2_drv), (select sid from s2_drv)), false);
select t.as_admin();

-- restore shared plan values and the login links
update drivers set user_id = null where id = t.u(7037);
update drivers set user_id = t.u(6) where id in (select id from s2_u6);
update plan_entitlements set bool_value = (select feat from s2_saved) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = (select vmax from s2_saved) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
