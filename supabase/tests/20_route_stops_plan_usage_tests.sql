-- 20: route stop management + plan usage (migration 0024). Requires 01 fixtures. Run alone or after 02-19.
-- Users: 2 ownerA, 3 managerA, 4 opsA (routes.write), 5 bookingA (no routes.write), 6 driverA, 7 ownerB (starter), 8 ownerC (suspended).
-- Routes: 201/202 company A, 203 company B, 204 company C (suspended). Stops: 211 (route 201), 212 (route 202), 213 (route 203).
-- Booking 261 (company A) points at NO stop in the fixtures; this file adds one that does.
create table if not exists t.marks (name text primary key, id int);
alter table t.marks disable row level security;
grant all on t.marks to anon, authenticated;
delete from t.marks where name = '20';
insert into t.marks select '20', coalesce(max(id), 0) from t.results;
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.stop_names(p_route uuid) returns text language sql security definer as
  $$ select coalesce(string_agg(name, ',' order by stop_order), '') from public.route_stops where route_id = p_route $$;
create or replace function t.stop_orders(p_route uuid) returns text language sql security definer as
  $$ select coalesce(string_agg(stop_order::text, ',' order by stop_order), '') from public.route_stops where route_id = p_route $$;

select t.as_admin();
-- extra fixtures: a stop that a booking points at (route 202) and an inactive route for A
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type, offset_minutes) values
  (t.u(2701), t.u(101), t.u(202), 'Booked stop', 2, 'both', 10),
  (t.u(2702), t.u(101), t.u(202), 'Last stop', 3, 'both', 30);
insert into bookings (id, company_id, reference, trip_id, customer_id, pickup_stop_id, seats_count, unit_price, total_amount, currency, status, source)
  values (t.u(2703), t.u(101), 'MB-STOPPP', t.u(242), t.u(251), t.u(2701), 1, 50, 50, 'EGP', 'confirmed', 'staff');

-- ===================== save_route_stops: who may call it =====================
select t.as_user(t.u(5));   -- booking staff: no routes.write
select t.eq('booking staff cannot save stops (not found)', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$), 'P0002|route not found');
select t.as_user(t.u(6));   -- driver
select t.eq('driver cannot save stops', left(t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$), 5), 'P0002');
select t.as_user(t.u(7));   -- owner of company B
select t.eq('Company B cannot save stops on Company A route', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$),
            t.err_of($$select public.save_route_stops(gen_random_uuid(), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$));
select t.as_user(t.u(2));
select t.eq('Company A cannot save stops on Company B route', left(t.err_of($$select public.save_route_stops(t.u(203), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$), 5), 'P0002');
select t.as_user(t.u(8));   -- owner of the suspended company C
select t.eq('suspended company cannot save stops', left(t.err_of($$select public.save_route_stops(t.u(204), '[{"name":"X1","offsetMinutes":0},{"name":"X2","offsetMinutes":5}]'::jsonb)$$), 5), 'P0002');
select t.as_anon();
select t.eq('anon cannot call save_route_stops', left(t.err_of($$select public.save_route_stops(t.u(201), '[]'::jsonb)$$), 5), '42501');
select t.as_admin();
select t.eq('Company B route stops untouched by the attempts', t.stop_names(t.u(203)), 'B stop 1');
select t.eq('Company A route 201 stops untouched by the attempts', t.stop_names(t.u(201)), 'A stop 1');

-- ===================== validation (operations staff, routes.write) =====================
select t.as_user(t.u(4));
select t.eq('not a list', t.err_of($$select public.save_route_stops(t.u(201), '{"a":1}'::jsonb)$$), '22023|route stops invalid: stops_not_a_list');
select t.eq('empty list', t.err_of($$select public.save_route_stops(t.u(201), '[]'::jsonb)$$), '22023|route stops invalid: stops_min_two');
select t.eq('one stop is not a route', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Only","offsetMinutes":0}]'::jsonb)$$), '22023|route stops invalid: stops_min_two');
select t.eq('more than 200 stops', t.err_of($$select public.save_route_stops(t.u(201), (select jsonb_agg(jsonb_build_object('name','S'||g,'offsetMinutes',g)) from generate_series(1,201) g))$$), '22023|route stops invalid: stops_too_many');
select t.eq('name too short', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"A","offsetMinutes":0},{"name":"Bb","offsetMinutes":1}]'::jsonb)$$), '22023|route stops invalid: stop_name_invalid');
select t.eq('name missing', t.err_of($$select public.save_route_stops(t.u(201), '[{"offsetMinutes":0},{"name":"Bb","offsetMinutes":1}]'::jsonb)$$), '22023|route stops invalid: stop_name_invalid');
select t.eq('name only spaces', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"    ","offsetMinutes":0},{"name":"Bb","offsetMinutes":1}]'::jsonb)$$), '22023|route stops invalid: stop_name_invalid');
select t.eq('duplicate name (case-insensitive, trimmed)', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Mall","offsetMinutes":0},{"name":" mall ","offsetMinutes":1}]'::jsonb)$$), '22023|route stops invalid: stop_name_duplicate');
select t.eq('offset decreasing along the order', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":10},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_offset_order');
select t.eq('offset missing', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa"},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_offset_invalid');
select t.eq('offset negative', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":-1},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_offset_invalid');
select t.eq('offset fractional', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":1.5},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_offset_invalid');
select t.eq('offset as text', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":"1"},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_offset_invalid');
select t.eq('offset too large', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":40000},{"name":"Bb","offsetMinutes":40001}]'::jsonb)$$), '22023|route stops invalid: stop_offset_invalid');
select t.eq('latitude without longitude', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"latitude":30.1},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_coords_invalid');
select t.eq('latitude out of range', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"latitude":91,"longitude":30},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_coords_invalid');
select t.eq('longitude out of range', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"latitude":30,"longitude":181},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_coords_invalid');
select t.eq('coordinates as text', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"latitude":"30","longitude":"30"},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_coords_invalid');
select t.eq('bad stop type', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"stopType":"teleport"},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_type_invalid');
select t.eq('address too long', t.err_of($$select public.save_route_stops(t.u(201), jsonb_build_array(jsonb_build_object('name','Aa','offsetMinutes',0,'address',repeat('x',301)), jsonb_build_object('name','Bb','offsetMinutes',5)))$$), '22023|route stops invalid: stop_address_invalid');
select t.eq('isActive must be boolean', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"isActive":"yes"},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_invalid');
select t.eq('unknown stop id', t.err_of($$select public.save_route_stops(t.u(201), jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name','Aa','offsetMinutes',0), jsonb_build_object('name','Bb','offsetMinutes',5)))$$), '22023|route stops invalid: stop_unknown_id');
select t.eq('malformed stop id', t.err_of($$select public.save_route_stops(t.u(201), '[{"id":"not-a-uuid","name":"Aa","offsetMinutes":0},{"name":"Bb","offsetMinutes":5}]'::jsonb)$$), '22023|route stops invalid: stop_unknown_id');
select t.eq('stop id of ANOTHER route of the same company is refused', t.err_of($$select public.save_route_stops(t.u(201), jsonb_build_array(jsonb_build_object('id', t.u(212), 'name','Aa','offsetMinutes',0), jsonb_build_object('name','Bb','offsetMinutes',5)))$$), '22023|route stops invalid: stop_unknown_id');
select t.eq('stop id of ANOTHER TENANT is refused', t.err_of($$select public.save_route_stops(t.u(201), jsonb_build_array(jsonb_build_object('id', t.u(213), 'name','Aa','offsetMinutes',0), jsonb_build_object('name','Bb','offsetMinutes',5)))$$), '22023|route stops invalid: stop_unknown_id');
select t.eq('same stop id twice', t.err_of($$select public.save_route_stops(t.u(201), jsonb_build_array(jsonb_build_object('id', t.u(211), 'name','Aa','offsetMinutes',0), jsonb_build_object('id', t.u(211), 'name','Bb','offsetMinutes',5)))$$), '22023|route stops invalid: stop_unknown_id');
select t.eq('two pickup-only stops: nobody can get off', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"stopType":"pickup"},{"name":"Bb","offsetMinutes":5,"stopType":"pickup"}]'::jsonb)$$), '22023|route stops invalid: stops_need_pickup_and_dropoff');
select t.eq('dropoff first, nothing to board: two dropoff-only stops', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0,"stopType":"dropoff"},{"name":"Bb","offsetMinutes":5,"stopType":"dropoff"}]'::jsonb)$$), '22023|route stops invalid: stops_need_pickup_and_dropoff');
select t.eq('only one ACTIVE stop', t.err_of($$select public.save_route_stops(t.u(201), '[{"name":"Aa","offsetMinutes":0},{"name":"Bb","offsetMinutes":5,"isActive":false}]'::jsonb)$$), '22023|route stops invalid: stops_min_two_active');
select t.as_admin();
select t.eq('every failed attempt wrote nothing (route 201 unchanged)', t.stop_names(t.u(201)), 'A stop 1');
select t.eq('no audit row for failed attempts', (select count(*) from audit_logs where action = 'route.stops_saved')::int, 0);

-- ===================== happy path: create, update, reorder, remove =====================
select t.as_user(t.u(4));
select t.eq('create: keep 211, add two new', (public.save_route_stops(t.u(201), jsonb_build_array(
    jsonb_build_object('id', t.u(211), 'name', 'Fayoum Terminal', 'offsetMinutes', 0, 'stopType', 'pickup', 'address', '  Main st  ', 'latitude', 29.3, 'longitude', 30.84),
    jsonb_build_object('name', 'Beni Suef Exit', 'offsetMinutes', 40),
    jsonb_build_object('name', 'Cairo Univ', 'offsetMinutes', 120, 'stopType', 'dropoff'))))::text,
  ('{"count": 3, "added": 2, "removed": 0, "updated": 1, "route_id": "' || t.u(201) || '"}')::jsonb::text);
select t.as_admin();
select t.eq('order persisted 1..3', t.stop_orders(t.u(201)), '1,2,3');
select t.eq('names in order', t.stop_names(t.u(201)), 'Fayoum Terminal,Beni Suef Exit,Cairo Univ');
select t.eq('existing stop id kept (updated in place)', (select name from route_stops where id = t.u(211)), 'Fayoum Terminal');
select t.eq('address trimmed', (select address from route_stops where id = t.u(211)), 'Main st');
select t.eq('new stops belong to the route owner company', (select count(*) from route_stops where route_id = t.u(201) and company_id = t.u(101))::int, 3);
select t.eq('stop_type stored', (select stop_type from route_stops where name = 'Cairo Univ'), 'dropoff');
select t.eq('audit row written with counts', (select (metadata->>'added')::int from audit_logs where action = 'route.stops_saved' and entity_id = t.u(201) order by created_at desc limit 1), 2);

-- reorder: reverse the offsets-compatible order by moving the middle stop to the end (offsets must stay non-decreasing)
select t.as_user(t.u(3));   -- manager also has routes.write
select t.eq('reorder + rename in one save', (public.save_route_stops(t.u(201), jsonb_build_array(
    jsonb_build_object('id', t.u(211), 'name', 'Fayoum Terminal', 'offsetMinutes', 0, 'stopType', 'pickup'),
    (select jsonb_build_object('id', id, 'name', 'Cairo Univ', 'offsetMinutes', 100, 'stopType', 'dropoff') from route_stops where name = 'Cairo Univ'),
    (select jsonb_build_object('id', id, 'name', 'Beni Suef Exit', 'offsetMinutes', 130) from route_stops where name = 'Beni Suef Exit'))))->>'updated', '3');
select t.as_admin();
select t.eq('new order persisted', t.stop_names(t.u(201)), 'Fayoum Terminal,Cairo Univ,Beni Suef Exit');
select t.eq('orders still 1..3 without gaps or duplicates', t.stop_orders(t.u(201)), '1,2,3');
select t.eq('ids unchanged by reorder (same 3 rows)', (select count(*) from route_stops where route_id = t.u(201))::int, 3);

select t.as_user(t.u(4));
select t.eq('remove one stop by leaving it out', (public.save_route_stops(t.u(201), jsonb_build_array(
    jsonb_build_object('id', t.u(211), 'name', 'Fayoum Terminal', 'offsetMinutes', 0, 'stopType', 'pickup'),
    (select jsonb_build_object('id', id, 'name', 'Cairo Univ', 'offsetMinutes', 100, 'stopType', 'dropoff') from route_stops where name = 'Cairo Univ'))))->>'removed', '1');
select t.as_admin();
select t.eq('two stops left, orders renumbered', t.stop_orders(t.u(201)) || '|' || t.stop_names(t.u(201)), '1,2|Fayoum Terminal,Cairo Univ');
select t.eq('a deactivated stop is kept, not deleted', (select count(*) from route_stops where route_id = t.u(201))::int, 2);
select t.as_user(t.u(4));
select t.passes('deactivating a stop keeps it', $$select public.save_route_stops(t.u(201), jsonb_build_array(
    jsonb_build_object('id', t.u(211), 'name', 'Fayoum Terminal', 'offsetMinutes', 0),
    (select jsonb_build_object('id', id, 'name', 'Cairo Univ', 'offsetMinutes', 100) from route_stops where name = 'Cairo Univ'),
    jsonb_build_object('name', 'Parked', 'offsetMinutes', 110, 'isActive', false)))$$);
select t.as_admin();
select t.eq('inactive stop persisted as inactive', (select is_active from route_stops where name = 'Parked'), false);

-- ===================== a stop that has bookings cannot be removed =====================
select t.as_user(t.u(4));
select t.eq('removing a stop that has a booking is refused',
  t.err_of($$select public.save_route_stops(t.u(202), '[{"id":"00000000-0000-4000-8000-000000000212","name":"A stop 2","offsetMinutes":0},{"id":"00000000-0000-4000-8000-000000002702","name":"Last stop","offsetMinutes":30}]'::jsonb)$$),
  '23514|route stop has bookings');
select t.as_admin();
select t.eq('refused removal left all three stops in place', t.stop_names(t.u(202)), 'A stop 2,Booked stop,Last stop');
select t.as_user(t.u(4));
select t.passes('the booked stop can be kept and reordered', $$select public.save_route_stops(t.u(202), '[{"id":"00000000-0000-4000-8000-000000002702","name":"Last stop","offsetMinutes":0},{"id":"00000000-0000-4000-8000-000000002701","name":"Booked stop","offsetMinutes":10},{"id":"00000000-0000-4000-8000-000000000212","name":"A stop 2","offsetMinutes":30}]'::jsonb)$$);
select t.as_admin();
select t.eq('booking still points at its stop after the reorder', (select pickup_stop_id from bookings where id = t.u(2703)), t.u(2701));
select t.eq('reorder with a booked stop persisted', t.stop_names(t.u(202)), 'Last stop,Booked stop,A stop 2');

-- ===================== direct writes stay as before: stop_order is not client-writable in bulk =====================
select t.as_user(t.u(4));
select t.eq('company A staff still cannot touch company B stops directly', t.affected($$update route_stops set name = 'hacked' where id = t.u(213)$$)::int, 0);
select t.eq('company A staff cannot delete company B stops directly', t.affected($$delete from route_stops where id = t.u(213)$$)::int, 0);

-- ===================== my_plan_usage =====================
select t.as_user(t.u(2));
select t.eq('usage: A is professional (max_buses 20)', (public.my_plan_usage(t.u(101))->'limits'->'max_buses'->>'limit')::int, 20);
select t.eq('usage: counts buses like the trigger does (all rows)', (public.my_plan_usage(t.u(101))->'limits'->'max_buses'->>'used')::int, (select count(*) from public.buses where company_id = t.u(101))::int);
select t.eq('usage: routes exclude soft-deleted', (public.my_plan_usage(t.u(101))->'limits'->'max_routes'->>'used')::int, (select count(*) from public.routes where company_id = t.u(101) and deleted_at is null)::int);
select t.eq('usage: users count every membership row', (public.my_plan_usage(t.u(101))->'limits'->'max_users'->>'used')::int, (select count(*) from public.company_users where company_id = t.u(101))::int);
select t.eq('usage: status ok', public.my_plan_usage(t.u(101))->>'status', 'ok');
select t.eq('usage: four months of trips', (select count(*) from jsonb_object_keys(public.my_plan_usage(t.u(101))->'trip_months'))::int, 4);
select t.eq('usage: current month equals the limits entry', (public.my_plan_usage(t.u(101))->'trip_months'->>to_char(now(), 'YYYY-MM'))::int, (public.my_plan_usage(t.u(101))->'limits'->'max_trips_per_month'->>'used')::int);
select t.as_user(t.u(5));   -- booking staff may read the numbers (no billing data in the answer)
select t.eq('usage readable by any active member', public.my_plan_usage(t.u(101))->>'status', 'ok');
select t.eq('usage carries no plan name or price', (public.my_plan_usage(t.u(101)) ? 'plan')::text || (public.my_plan_usage(t.u(101)) ? 'price')::text, 'falsefalse');
select t.as_admin();   -- earlier cumulative suites may have re-assigned B's plan: pin it to starter for these assertions
update subscriptions set plan_id = (select id from plans where code = 'starter'), status = 'active',
       current_period_start = now(), current_period_end = now() + interval '30 days' where company_id = t.u(102);
delete from buses where company_id = t.u(102) and plate_number like 'B-FILL-%';
select t.as_user(t.u(7));
select t.eq('B is starter: max_buses 5', (public.my_plan_usage(t.u(102))->'limits'->'max_buses'->>'limit')::int, 5);
select t.eq('Company B cannot read Company A usage', t.err_of($$select public.my_plan_usage(t.u(101))$$), 'P0002|company not found');
select t.eq('unknown company: same answer', t.err_of($$select public.my_plan_usage(gen_random_uuid())$$), 'P0002|company not found');
select t.eq('null company: same answer', t.err_of($$select public.my_plan_usage(null)$$), 'P0002|company not found');
select t.as_user(t.u(8));
select t.eq('suspended company gets nothing', t.err_of($$select public.my_plan_usage(t.u(103))$$), 'P0002|company not found');
select t.as_user(t.u(1));   -- platform staff are not tenant members
select t.eq('platform super_admin without membership: not found', t.err_of($$select public.my_plan_usage(t.u(101))$$), 'P0002|company not found');
select t.as_anon();
select t.eq('anon cannot call my_plan_usage', left(t.err_of($$select public.my_plan_usage(t.u(101))$$), 5), '42501');

-- missing entitlement => limit 0 (not granted); unlimited => null; expired subscription => no_subscription
select t.as_admin();
delete from plan_entitlements where plan_id = (select id from plans where code = 'starter') and key = 'max_drivers';
select t.as_user(t.u(7));
select t.eq('missing entitlement key is NOT granted (limit 0)', (public.my_plan_usage(t.u(102))->'limits'->'max_drivers'->>'limit')::int, 0);
select t.as_admin();
insert into plan_entitlements (plan_id, key, int_value) select id, 'max_drivers', 5 from plans where code = 'starter';
update plan_entitlements set int_value = null where key = 'max_buses' and plan_id = (select id from plans where code = 'starter');
select t.as_user(t.u(7));
select t.eq('unlimited is a JSON null limit', (public.my_plan_usage(t.u(102))->'limits'->'max_buses'->'limit')::text, 'null');
select t.as_admin();
update plan_entitlements set int_value = 5 where key = 'max_buses' and plan_id = (select id from plans where code = 'starter');
update subscriptions set current_period_end = now() - interval '1 hour', current_period_start = now() - interval '30 days' where company_id = t.u(102);
select t.as_user(t.u(7));
select t.eq('ended subscription => no_subscription (no numbers shown)', public.my_plan_usage(t.u(102)), '{"status": "no_subscription"}'::jsonb);
select t.as_admin();
update subscriptions set current_period_start = now(), current_period_end = now() + interval '30 days' where company_id = t.u(102);
select t.as_user(t.u(7));
select t.eq('renewed subscription => ok again', public.my_plan_usage(t.u(102))->>'status', 'ok');

-- the numbers match what the triggers enforce: fill B's buses to the limit and watch both agree
select t.as_admin();
insert into buses (company_id, plate_number, capacity, status)
  select t.u(102), 'B-FILL-' || g, 30, 'active' from generate_series(1, 5 - (select count(*) from buses where company_id = t.u(102))::int) g;   -- fill exactly to the starter limit of 5
select t.as_user(t.u(7));
select t.eq('B usage equals the real bus count (earlier suites left B at or above the limit)', (public.my_plan_usage(t.u(102))->'limits'->'max_buses'->>'used')::int, (select count(*) from public.buses where company_id = t.u(102))::int);
select t.eq('B is at or over its limit of 5', (public.my_plan_usage(t.u(102))->'limits'->'max_buses'->>'used')::int >= 5, true);
select t.eq('trigger refuses the 6th bus with the plan_limit code', left(t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(102), 'B-OVER', 30)$$), 5), '53400');
select t.as_admin();
delete from buses where plate_number like 'B-FILL-%' and company_id = t.u(102);

select t.as_admin();
select 'suite 20: ' || count(*) filter (where ok and id > (select id from t.marks where name = '20')) || ' passed, '
       || count(*) filter (where not ok and id > (select id from t.marks where name = '20')) || ' failed' as summary from t.results;
