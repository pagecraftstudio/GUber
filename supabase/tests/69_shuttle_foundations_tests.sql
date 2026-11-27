-- 69: Continuous Shuttle S1 (migration 0074). Harness style. Needs 01 fixtures:
--   company A u(101) professional, B u(102) starter, C u(103) suspended; users u(2) ownerA, u(3) managerA, u(4) opsA, u(5) bookingA,
--   u(6) driverA, u(7) ownerB, u(8) ownerC, u(9) platform support; routes u(201)/u(202) in A, u(203) in B, u(204) in C; stop u(213) on B route.
-- Own fixtures: stops 6901-6903 on route 201, 6911 on route 202, 6921-6922 on route 203 (B).
select t.as_admin();
delete from t.results where name like 's1: %';
-- earlier suites change plans and company status, so pin what this suite relies on and restore it at the end
create temp table s1_saved as select
  (select plan_id from subscriptions where company_id = t.u(102)) as b_plan,
  (select status from companies where id = t.u(103)) as c_status, (select suspended_at from companies where id = t.u(103)) as c_susp_at,
  (select suspension_reason from companies where id = t.u(103)) as c_susp_why;
update subscriptions set plan_id = (select id from plans where code = 'starter') where company_id = t.u(102);
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 's1 fixture' where id = t.u(103);
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(6901), t.u(101), t.u(201), 'S1 stop one', 51, 'both'), (t.u(6902), t.u(101), t.u(201), 'S1 stop two', 52, 'both'),
  (t.u(6903), t.u(101), t.u(201), 'S1 stop three', 53, 'both'), (t.u(6911), t.u(101), t.u(202), 'S1 other route stop', 54, 'both'),
  (t.u(6921), t.u(102), t.u(203), 'S1 B stop one', 55, 'both'), (t.u(6922), t.u(102), t.u(203), 'S1 B stop two', 56, 'both');
create or replace function t.sv69(p_route uuid) returns uuid language sql security definer as
  $$ select id from public.shuttle_services where route_id = p_route and is_active $$;
create or replace function t.cnt69(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
grant execute on function t.sv69(uuid), t.cnt69(text) to authenticated, anon;

-- 1. catalog seeds ---------------------------------------------------------------------------------------------------------------------
select t.eq('s1: 7 shuttle permissions exist', (select count(*) from permissions where module = 'shuttle'), 7::bigint);
select t.eq('s1: owner holds all 7', (select count(*) from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.key = 'owner' and p.module = 'shuttle'), 7::bigint);
select t.eq('s1: manager holds all but drive', (select string_agg(p.key, ',' order by p.key) from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.key = 'manager' and p.module = 'shuttle'),
  'shuttle.assign,shuttle.cash,shuttle.config,shuttle.confirm,shuttle.operate,shuttle.read');
select t.eq('s1: operations = read, operate, assign', (select string_agg(p.key, ',' order by p.key) from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.key = 'operations' and p.module = 'shuttle'),
  'shuttle.assign,shuttle.operate,shuttle.read');
select t.eq('s1: booking = read, confirm, cash', (select string_agg(p.key, ',' order by p.key) from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.key = 'booking' and p.module = 'shuttle'),
  'shuttle.cash,shuttle.confirm,shuttle.read');
select t.eq('s1: driver = drive only', (select string_agg(p.key, ',') from role_permissions rp join roles r on r.id = rp.role_id join permissions p on p.id = rp.permission_id where r.key = 'driver' and p.module = 'shuttle'), 'shuttle.drive');
select t.eq('s1: both entitlement keys defined', (select count(*) from entitlement_definitions where key in ('feature_shuttle_ops', 'max_shuttle_vehicles')), 2::bigint);
-- earlier suites edit plan values, so assert the seed SHAPE here (a row per plan per key, boolean typed); the restrictive values were checked on a fresh database
select t.eq('s1: every plan has both shuttle entitlement rows, feature is a boolean',
  (select count(*) from plan_entitlements pe where (pe.key = 'feature_shuttle_ops' and pe.bool_value is not null and pe.int_value is null) or pe.key = 'max_shuttle_vehicles'), (select count(*) * 2 from plans));
select t.eq('s1: 5 rate-limit buckets', (select count(distinct bucket) from app_private.rate_limit_policies where bucket like 'shuttle.%'), 5::bigint);
select t.eq('s1: existing route_plans keep daily_pair', (select count(*) from route_plans where model <> 'daily_pair'), 0::bigint);
select t.eq('s1: route_plans.model check allows exactly daily_pair and shuttle_pair', (select count(*) from pg_constraint where conrelid = 'public.route_plans'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%daily_pair%' and pg_get_constraintdef(oid) like '%shuttle_pair%'), 1::bigint);
select t.eq('s1: tenant guard on shuttle tables', (select count(*) from app_private.tenant_guard_problems() where table_name like 'shuttle_%'), 0::bigint);

-- 2. plan gate: company A is professional, feature still off ---------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.raises('s1: owner on a plan without the feature is refused (42501)',
  $$select public.shuttle_save_service(t.u(201), 'Campus shuttle', 'forward', true, 20, true, 4, null)$$, '42501');
select t.as_admin();
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
select t.eq('s1: shuttle_enabled true for A, false for B',
  (select app_private.shuttle_enabled(t.u(101)))::text || '/' || (select app_private.shuttle_enabled(t.u(102)))::text, 'true/false');

select t.as_user(t.u(4));
select t.eq('s1: is_enabled true for a member with shuttle.read', public.shuttle_is_enabled(t.u(101)), true);
select t.eq('s1: is_enabled false for another company (no leak)', public.shuttle_is_enabled(t.u(102)), false);
select t.eq('s1: is_enabled false for a null company', public.shuttle_is_enabled(null), false);
select t.as_user(t.u(6));
select t.eq('s1: is_enabled false for a driver (no shuttle.read)', public.shuttle_is_enabled(t.u(101)), false);
select t.as_anon();
select t.raises('s1: anon cannot call is_enabled', $$select public.shuttle_is_enabled(t.u(101))$$, '42501');
select t.as_admin();

-- 3. service: roles, tenancy, validation -----------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.raises('s1: operations cannot configure (no shuttle.config)', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, 'P0002');
select t.as_user(t.u(5));
select t.raises('s1: booking cannot configure', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, 'P0002');
select t.as_user(t.u(6));
select t.raises('s1: driver cannot configure', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, 'P0002');
select t.as_user(t.u(7));
select t.raises('s1: owner B cannot configure company A route (looks like not found)', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, 'P0002');
select t.as_user(t.u(8));
select t.raises('s1: suspended company C cannot configure', $$select public.shuttle_save_service(t.u(204), 'X', 'forward', true, 20, true, 4, null)$$, 'P0002');
select t.as_anon();
select t.raises('s1: anon cannot call save_service', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, '42501');

select t.as_user(t.u(3));
select t.raises('s1: bad direction', $$select public.shuttle_save_service(t.u(201), 'X', 'sideways', true, 20, true, 4, null)$$, '22023');
select t.raises('s1: ttl 0', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 0, true, 4, null)$$, '22023');
select t.raises('s1: ttl 241', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 241, true, 4, null)$$, '22023');
select t.raises('s1: max seats 0', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 0, null)$$, '22023');
select t.raises('s1: blank name', $$select public.shuttle_save_service(t.u(201), '   ', 'forward', true, 20, true, 4, null)$$, '22023');
select t.raises('s1: null flag', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', null, 20, true, 4, null)$$, '22023');
select t.raises('s1: hub stop of another route of the same company', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, t.u(6911))$$, '23514');
select t.raises('s1: hub stop of another company', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, t.u(6921))$$, '23514');
select t.eq('s1: failed saves left no service', t.cnt69('select count(*) from public.shuttle_services where company_id = ''' || t.u(101) || ''''), 0::bigint);

select t.as_user(t.u(3));
select t.passes('s1: manager creates the service', $$select public.shuttle_save_service(t.u(201), '  Campus shuttle ', 'forward', true, 20, true, 4, t.u(6901))$$);
select t.eq('s1: name trimmed, hub stored', (select name || '/' || (hub_stop_id = t.u(6901))::text from shuttle_services where route_id = t.u(201)), 'Campus shuttle/true');
select t.as_admin();
select t.eq('s1: one live service for the route', (select count(*) from shuttle_services where route_id = t.u(201) and is_active), 1::bigint);
create temp table s1_ids as select t.sv69(t.u(201)) as first_id;
grant select on s1_ids to authenticated, anon;
select t.as_user(t.u(2));
select t.passes('s1: owner saves again = update, not a second row', $$select public.shuttle_save_service(t.u(201), 'Campus shuttle v2', 'backward', false, 30, false, 6, null)$$);
select t.as_admin();
select t.eq('s1: same row updated', (select (t.sv69(t.u(201)) = first_id)::text || '/' || (select name || '/' || outbound_direction || '/' || allow_reverse::text || '/' || request_ttl_minutes::text || '/' || max_seats_per_request::text from shuttle_services where id = first_id) from s1_ids),
  'true/Campus shuttle v2/backward/false/30/6');
select t.eq('s1: still one live service', (select count(*) from shuttle_services where route_id = t.u(201)), 1::bigint);
select t.eq('s1: audit rows written', (select string_agg(action, ',' order by created_at) from audit_logs where entity_type = 'shuttle_service' and company_id = t.u(101)), 'shuttle_service.created,shuttle_service.updated');
select t.raises('s1: route cannot be changed on a service', $$update shuttle_services set route_id = t.u(202) where route_id = t.u(201)$$, null);

-- 4. reads: RLS ------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(4));
select t.eq('s1: operations reads A service (shuttle.read)', (select count(*) from shuttle_services), 1::bigint);
select t.as_user(t.u(6));
select t.eq('s1: driver reads no service rows', (select count(*) from shuttle_services), 0::bigint);
select t.as_user(t.u(7));
select t.eq('s1: owner B sees no A service', (select count(*) from shuttle_services), 0::bigint);
select t.as_user(t.u(9));
select t.eq('s1: platform support can read', (select count(*) from shuttle_services), 1::bigint);
select t.as_anon();
select t.raises('s1: anon cannot select services', $$select count(*) from shuttle_services$$, '42501');

-- 5. no client writes ------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.raises('s1: owner cannot insert a service directly', $$insert into shuttle_services (company_id, route_id, name) values (t.u(101), t.u(202), 'direct')$$, '42501');
select t.raises('s1: owner cannot update a service directly', $$update shuttle_services set name = 'direct'$$, '42501');
select t.raises('s1: owner cannot delete a service directly', $$delete from shuttle_services$$, '42501');
select t.raises('s1: owner cannot insert a fare directly', $$insert into shuttle_fares (company_id, service_id, from_stop_id, to_stop_id, price) values (t.u(101), t.sv69(t.u(201)), t.u(6901), t.u(6902), 5)$$, '42501');
select t.raises('s1: owner cannot edit route_plans.model', $$update route_plans set model = 'shuttle_pair'$$, '42501');

-- 6. active switch ---------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(7));
select t.raises('s1: owner B cannot deactivate A service', $$select public.shuttle_set_service_active(t.sv69(t.u(201)), false)$$, 'P0002');
select t.as_user(t.u(3));
select t.passes('s1: manager deactivates', $$select public.shuttle_set_service_active(t.sv69(t.u(201)), false)$$);
select t.eq('s1: no live service now', t.cnt69('select count(*) from public.shuttle_services where route_id = ''' || t.u(201) || ''' and is_active'), 0::bigint);
select t.passes('s1: a new live service can be created after deactivation', $$select public.shuttle_save_service(t.u(201), 'Second', 'forward', true, 20, true, 4, null)$$);
select t.eq('s1: history kept (2 rows, 1 live)', t.cnt69('select count(*) from public.shuttle_services where route_id = ''' || t.u(201) || ''''), 2::bigint);
select t.raises('s1: reactivating the old row while another is live = 23505',
  $$select public.shuttle_set_service_active((select first_id from s1_ids), true)$$, '23505');

-- 7. fares -----------------------------------------------------------------------------------------------------------------------------
select t.passes('s1: save a fare matrix', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[
  {"from_stop_id":"%s","to_stop_id":"%s","price":10},{"from_stop_id":"%s","to_stop_id":"%s","price":10},
  {"from_stop_id":"%s","to_stop_id":"%s","price":15.555},{"from_stop_id":"%s","to_stop_id":"%s","price":0}]'::jsonb)$f$,
  t.u(6901), t.u(6902), t.u(6902), t.u(6901), t.u(6901), t.u(6903), t.u(6903), t.u(6901)));
select t.eq('s1: 4 rows saved, price rounded to 2dp', t.cnt69('select count(*) from public.shuttle_fares where price in (10, 15.56, 0)'), 4::bigint);
select t.passes('s1: replace-all semantics (second save replaces)', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":12}]'::jsonb)$f$, t.u(6901), t.u(6902)));
select t.eq('s1: only 1 row after replace', t.cnt69('select count(*) from public.shuttle_fares'), 1::bigint);
select t.raises('s1: stop of another route of the same company', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5}]'::jsonb)$f$, t.u(6901), t.u(6911)), '23514');
select t.raises('s1: stop of another company', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5}]'::jsonb)$f$, t.u(6901), t.u(6921)), '23514');
select t.raises('s1: from = to', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5}]'::jsonb)$f$, t.u(6901), t.u(6901)), '23514');
select t.raises('s1: negative price', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":-1}]'::jsonb)$f$, t.u(6901), t.u(6902)), '23514');
select t.raises('s1: duplicate pair', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5},{"from_stop_id":"%s","to_stop_id":"%s","price":6}]'::jsonb)$f$, t.u(6901), t.u(6902), t.u(6901), t.u(6902)), '22023');
select t.raises('s1: price as string', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":"5"}]'::jsonb)$f$, t.u(6901), t.u(6902)), '22023');
select t.raises('s1: not an array', $$select public.shuttle_save_fares(t.sv69(t.u(201)), '{"a":1}'::jsonb)$$, '22023');
select t.raises('s1: null input', $$select public.shuttle_save_fares(t.sv69(t.u(201)), null)$$, '22023');
select t.raises('s1: bad uuid text', $$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"x","to_stop_id":"y","price":1}]'::jsonb)$$, '22023');
select t.eq('s1: failed saves rolled back (still the 1 good row)', t.cnt69('select count(*) from public.shuttle_fares'), 1::bigint);
select t.as_user(t.u(4));
select t.raises('s1: operations cannot save fares', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5}]'::jsonb)$f$, t.u(6901), t.u(6902)), 'P0002');
select t.eq('s1: operations can read fares', (select count(*) from shuttle_fares), 1::bigint);
select t.as_user(t.u(7));
select t.raises('s1: owner B cannot save fares on A service', format($f$select public.shuttle_save_fares(t.sv69(t.u(201)), '[{"from_stop_id":"%s","to_stop_id":"%s","price":5}]'::jsonb)$f$, t.u(6901), t.u(6902)), 'P0002');
select t.eq('s1: owner B sees no A fares', (select count(*) from shuttle_fares), 0::bigint);

-- 8. integrity -------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
select t.raises('s1: a priced stop cannot be deleted', $$delete from route_stops where id = t.u(6901)$$, '23503');
select t.passes('s1: an unpriced stop can still be deleted', $$delete from route_stops where id = t.u(6903)$$);
select t.raises('s1: a route with a service cannot be hard-deleted', $$delete from routes where id = t.u(201)$$, '23503');
-- plan downgrade must not trap the company: turning OFF works with the feature off, turning ON does not
update plan_entitlements set bool_value = false where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
select t.as_user(t.u(2));
select t.passes('s1: deactivate allowed after downgrade', $$select public.shuttle_set_service_active(t.sv69(t.u(201)), false)$$);
select t.raises('s1: activate refused after downgrade', $$select public.shuttle_set_service_active((select first_id from s1_ids), true)$$, '42501');
select t.raises('s1: save refused after downgrade', $$select public.shuttle_save_service(t.u(201), 'X', 'forward', true, 20, true, 4, null)$$, '42501');
select t.as_admin();
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update subscriptions set plan_id = (select b_plan from s1_saved) where company_id = t.u(102);
update companies set status = (select c_status from s1_saved), suspended_at = (select c_susp_at from s1_saved), suspension_reason = (select c_susp_why from s1_saved) where id = t.u(103);
