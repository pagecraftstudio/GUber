-- 21: member management RPCs + atomic route creation (migration 0025). Requires 01 fixtures. Run alone or after 02-20.
-- Users: 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB (starter), 8 ownerC (suspended company).
create or replace function t.mid(p_user int) returns uuid language sql security definer as
  $$ select id from public.company_users where user_id = t.u(p_user) $$;
create or replace function t.mrole(p_user int) returns text language sql security definer as
  $$ select r.key from public.company_users cu join public.roles r on r.id = cu.role_id where cu.user_id = t.u(p_user) $$;
create or replace function t.mstatus(p_user int) returns text language sql security definer as
  $$ select status from public.company_users where user_id = t.u(p_user) $$;
create or replace function t.n_routes(p_company uuid) returns bigint language sql security definer as
  $$ select count(*) from public.routes where company_id = p_company $$;
create or replace function t.n_audit(p_action text) returns bigint language sql security definer as
  $$ select count(*) from public.audit_logs where action = p_action $$;

-- ============ set_member_role ============
select t.as_user(t.u(3));   -- manager: no users.write
select t.raises('manager cannot change a role', format('select public.set_member_role(%L, %L)', t.mid(5), 'manager'), 'P0002');
select t.as_user(t.u(5));   -- booking staff
select t.raises('booking staff cannot change a role', format('select public.set_member_role(%L, %L)', t.mid(4), 'manager'), 'P0002');
select t.as_user(t.u(6));   -- driver
select t.raises('driver cannot change a role', format('select public.set_member_role(%L, %L)', t.mid(4), 'manager'), 'P0002');
select t.as_anon();
select t.raises('anonymous cannot change a role', format('select public.set_member_role(%L, %L)', t.mid(4), 'manager'));
select t.as_user(t.u(7));   -- owner of company B targets a company A member: same answer as "unknown"
select t.raises('company B owner cannot change a company A role (not found)', format('select public.set_member_role(%L, %L)', t.mid(4), 'manager'), 'P0002');
select t.as_admin();
select t.eq('company A member role unchanged after B attempt', t.mrole(4), 'operations');

select t.as_user(t.u(2));   -- owner A
select t.raises('owner cannot change own role', format('select public.set_member_role(%L, %L)', t.mid(2), 'manager'), '23514');
select t.raises('unknown role refused', format('select public.set_member_role(%L, %L)', t.mid(4), 'no_such_role'), '22023');
select t.eq('owner changes a member role', (public.set_member_role(t.mid(4), 'booking') ->> 'changed')::boolean, true);
select t.as_admin();
select t.eq('role persisted', t.mrole(4), 'booking');
select t.eq('role change audited', t.n_audit('member.role_changed') >= 1, true);
select t.as_user(t.u(2));
select t.eq('same role is a no-op', (public.set_member_role(t.mid(4), 'booking') ->> 'changed')::boolean, false);
select public.set_member_role(t.mid(4), 'operations');   -- restore for later suites
-- the manager role cannot promote (no users.write), so a manager cannot make themselves owner
select t.as_user(t.u(3));
select t.raises('manager cannot promote themselves', format('select public.set_member_role(%L, %L)', t.mid(3), 'owner'), 'P0002');

-- ============ set_member_status ============
select t.as_user(t.u(3));
select t.raises('manager cannot suspend a member', format('select public.set_member_status(%L, %L)', t.mid(5), 'suspended'), 'P0002');
select t.as_user(t.u(7));
select t.raises('company B owner cannot suspend a company A member', format('select public.set_member_status(%L, %L)', t.mid(5), 'suspended'), 'P0002');
select t.as_admin();
select t.eq('company A member status unchanged after B attempt', t.mstatus(5), 'active');
select t.as_user(t.u(2));
select t.raises('owner cannot change own status', format('select public.set_member_status(%L, %L)', t.mid(2), 'suspended'), '23514');
select t.raises('invalid status refused', format('select public.set_member_status(%L, %L)', t.mid(5), 'deleted'), '22023');
select t.eq('owner suspends a member', (public.set_member_status(t.mid(5), 'suspended') ->> 'changed')::boolean, true);
select t.as_admin();
select t.eq('status persisted', t.mstatus(5), 'suspended');
select t.as_user(t.u(5));
select t.eq('a suspended member loses tenant access (routes invisible)', t.rows('select 1 from public.routes'), 0::bigint);
select t.as_user(t.u(2));
select t.eq('owner reactivates a member', (public.set_member_status(t.mid(5), 'active') ->> 'changed')::boolean, true);
select t.as_admin();
select t.eq('reactivated', t.mstatus(5), 'active');
select t.eq('status change audited', t.n_audit('member.status_changed') >= 2, true);

-- ============ create_route_with_stops ============
select t.as_user(t.u(5));   -- booking staff: no routes.write
select t.raises('booking staff cannot create a route', $$select public.create_route_with_stops('R-X','RX1','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$, '42501');
select t.as_user(t.u(6));
select t.raises('driver cannot create a route', $$select public.create_route_with_stops('R-X','RX2','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$, '42501');
select t.as_anon();
select t.raises('anonymous cannot create a route', $$select public.create_route_with_stops('R-X','RX3','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$);
select t.as_user(t.u(8));   -- owner of the suspended company
select t.raises('suspended company cannot create a route', $$select public.create_route_with_stops('R-X','RX4','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$);

select t.as_admin();
create temp table t_before as select t.n_routes(t.u(101)) as a, t.n_routes(t.u(102)) as b;
grant all on t_before to authenticated;

select t.as_user(t.u(4));   -- ops A creates: company comes from membership
select t.eq('ops creates a route with two stops', (public.create_route_with_stops('Atomic A','ATM-A','Cairo','Giza','d','[{"name":"Start","offsetMinutes":0,"stopType":"pickup"},{"name":"End","offsetMinutes":30,"stopType":"dropoff"}]'::jsonb) ->> 'stops')::int, 2);
select t.as_admin();
select t.eq('route landed in company A', t.n_routes(t.u(101)), (select a + 1 from t_before));
select t.eq('company B route count untouched', t.n_routes(t.u(102)), (select b from t_before));
select t.eq('its stops belong to company A', (select count(*) from public.route_stops s join public.routes r on r.id = s.route_id where r.code = 'ATM-A' and s.company_id = t.u(101)), 2::bigint);

-- rollback: a bad stop list must not leave a route behind
select t.as_user(t.u(4));
select t.raises('one stop only is refused', $$select public.create_route_with_stops('Atomic B','ATM-B','A','B',null,'[{"name":"Only","offsetMinutes":0}]'::jsonb)$$, '22023');
select t.raises('duplicate stop names refused', $$select public.create_route_with_stops('Atomic C','ATM-C','A','B',null,'[{"name":"Same","offsetMinutes":0},{"name":"same","offsetMinutes":5}]'::jsonb)$$, '22023');
select t.raises('decreasing minutes refused', $$select public.create_route_with_stops('Atomic D','ATM-D','A','B',null,'[{"name":"S1","offsetMinutes":10},{"name":"S2","offsetMinutes":5}]'::jsonb)$$, '22023');
select t.raises('invalid route fields refused', $$select public.create_route_with_stops('x','ATM-E','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$, '22023');
select t.as_admin();
select t.eq('failed creates left no route behind', (select count(*) from public.routes where code in ('ATM-B','ATM-C','ATM-D','ATM-E')), 0::bigint);
select t.eq('company A count only grew by the one good route', t.n_routes(t.u(101)), (select a + 1 from t_before));

-- plan limit: fill company B to its max_routes, then the RPC must refuse and roll back
do $$ declare v_lim int; v_n int; i int := 0; begin
  select (e.int_value) into v_lim from public.plan_entitlements e join public.plans p on p.id = e.plan_id
   join public.subscriptions s on s.plan_id = p.id where s.company_id = t.u(102) and e.key = 'max_routes' limit 1;
  select count(*) into v_n from public.routes where company_id = t.u(102);
  while v_n < v_lim loop i := i + 1;
    insert into public.routes (company_id, name, code, origin_name, destination_name) values (t.u(102), 'Fill ' || i, 'FILL-' || i, 'A', 'B');
    v_n := v_n + 1; end loop; end $$;
select t.as_user(t.u(7));
select t.raises('route create refused at the plan limit', $$select public.create_route_with_stops('Over','OVR-1','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb)$$, '53400');
select t.as_admin();
select t.eq('no route created over the limit', (select count(*) from public.routes where code = 'OVR-1'), 0::bigint);
delete from public.routes where code like 'FILL-%' and company_id = t.u(102);
delete from public.routes where code = 'ATM-A';   -- leave later suites' counts as found
