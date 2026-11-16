-- 29: every route has a return route (migration 0033). Requires 01 fixtures. Run alone or after 02-28.
-- Users: 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB (starter), 8 ownerC (suspended).
create or replace function t.route_by_name(p_name text) returns uuid language sql security definer as
  $$ select id from public.routes where name = p_name order by created_at desc limit 1 $$;
create or replace function t.rret(p_route uuid) returns uuid language sql security definer as
  $$ select return_route_id from public.routes where id = p_route $$;
create or replace function t.stop_names(p_route uuid) returns text language sql security definer as
  $$ select string_agg(name, ',' order by stop_order) from public.route_stops where route_id = p_route $$;
create or replace function t.stop_offsets(p_route uuid) returns text language sql security definer as
  $$ select string_agg(offset_minutes::text, ',' order by stop_order) from public.route_stops where route_id = p_route $$;
create or replace function t.stop_types(p_route uuid) returns text language sql security definer as
  $$ select string_agg(stop_type, ',' order by stop_order) from public.route_stops where route_id = p_route $$;
create or replace function t.n_routes_all() returns bigint language sql security definer as
  $$ select count(*) from public.routes $$;

-- ============ create_route_pair: the return is the go, reversed ============
select t.as_user(t.u(2));   -- owner A
select public.create_route_pair('Pair-1', 'P1', 'Cairo', 'Galala', null,
  '[{"name":"Cairo Gate","offsetMinutes":0,"stopType":"pickup"},{"name":"Suez Rest","offsetMinutes":60,"stopType":"both"},{"name":"Galala Gate","offsetMinutes":150,"stopType":"dropoff"}]'::jsonb,
  '{"sameAsReverse":true}'::jsonb);
select t.as_admin();
select t.eq('go route exists', t.route_by_name('Pair-1') is not null, true);
select t.eq('return route created with a default name', t.route_by_name('Pair-1 (return)') is not null, true);
select t.eq('go points at the return', t.rret(t.route_by_name('Pair-1')), t.route_by_name('Pair-1 (return)'));
select t.eq('return points back at the go (mutual)', t.rret(t.route_by_name('Pair-1 (return)')), t.route_by_name('Pair-1'));
select t.eq('return origin/destination are swapped', (select origin_name || '>' || destination_name from public.routes where name = 'Pair-1 (return)'), 'Galala>Cairo');
select t.eq('return stops are in reverse order', t.stop_names(t.route_by_name('Pair-1 (return)')), 'Galala Gate,Suez Rest,Cairo Gate');
select t.eq('return offsets are measured from the other end', t.stop_offsets(t.route_by_name('Pair-1 (return)')), '0,90,150');
select t.eq('pickup and dropoff are swapped on the return', t.stop_types(t.route_by_name('Pair-1 (return)')), 'pickup,both,dropoff');
select t.eq('both routes belong to the caller company', (select count(distinct company_id) from public.routes where name like 'Pair-1%'), 1::bigint);
select t.eq('pair creation audited', (select count(*) from public.audit_logs where action = 'route.pair_created') >= 1, true);

-- ============ create_route_pair: the return has its own stops ============
select t.as_user(t.u(2));
select public.create_route_pair('Pair-2', 'P2', 'Cairo', 'Galala', null,
  '[{"name":"A1","offsetMinutes":0},{"name":"A2","offsetMinutes":50}]'::jsonb,
  '{"sameAsReverse":false,"name":"Pair-2 back","origin":"Galala","destination":"Cairo","stops":[{"name":"B1","offsetMinutes":0},{"name":"B-mid","offsetMinutes":30},{"name":"B2","offsetMinutes":55}]}'::jsonb);
select t.as_admin();
select t.eq('own return route uses the given name', t.route_by_name('Pair-2 back') is not null, true);
select t.eq('own return stops saved as given', t.stop_names(t.route_by_name('Pair-2 back')), 'B1,B-mid,B2');
select t.eq('own return is mutually linked', t.rret(t.rret(t.route_by_name('Pair-2'))), t.route_by_name('Pair-2'));

-- ============ the return is obligatory ============
select t.as_user(t.u(2));
select t.raises('return spec missing is refused', $$select public.create_route_pair('Pair-3','P3','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb, null)$$, '22023');
select t.raises('sameAsReverse missing is refused', $$select public.create_route_pair('Pair-3','P3','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb, '{}'::jsonb)$$, '22023');
select t.raises('own return without stops is refused', $$select public.create_route_pair('Pair-3','P3','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb, '{"sameAsReverse":false}'::jsonb)$$, '22023');
select t.as_admin();
select t.eq('refused attempts left no route behind', (select count(*) from public.routes where name like 'Pair-3%'), 0::bigint);

-- ============ a bad return rolls the whole pair back ============
select t.as_user(t.u(2));
select t.raises('return with a single stop is refused', $$select public.create_route_pair('Pair-4','P4','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb, '{"sameAsReverse":false,"stops":[{"name":"Only","offsetMinutes":0}]}'::jsonb)$$, '22023');
select t.as_admin();
select t.eq('the go route was rolled back too', (select count(*) from public.routes where name like 'Pair-4%'), 0::bigint);

-- ============ who may create a pair ============
select t.as_user(t.u(5));
select t.raises('booking staff cannot create a pair', $$select public.create_route_pair('Pair-5','P5','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$, '42501');
select t.as_user(t.u(6));
select t.raises('driver cannot create a pair', $$select public.create_route_pair('Pair-5','P5','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$, '42501');
select t.as_anon();
select t.raises('anonymous cannot create a pair', $$select public.create_route_pair('Pair-5','P5','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$);
select t.as_user(t.u(3));   -- manager has routes.write
select t.passes('manager can create a pair', $$select public.create_route_pair('Pair-6','P6','A','B',null,'[{"name":"S1","offsetMinutes":0},{"name":"S2","offsetMinutes":5}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$);
select t.as_admin();

-- ============ tenant isolation ============
select t.as_user(t.u(7));   -- owner of company B
select t.eq('company B cannot see company A pair routes', t.rows($$select 1 from public.routes where name like 'Pair-1%'$$), 0::bigint);
select t.as_admin();
select t.eq('company B has routes of its own to test against', (select count(*) from public.routes where company_id = t.u(102)) >= 1, true);
select t.raises('a route cannot point at another company return (composite FK)',
  format('update public.routes set return_route_id = %L where id = %L', (select id from public.routes where company_id = t.u(102) limit 1), t.route_by_name('Pair-1')), '23503');
select t.eq('Pair-1 still points at its own return after that refusal', t.rret(t.route_by_name('Pair-1')), t.route_by_name('Pair-1 (return)'));
-- the starter plan limit still applies: a pair needs two route slots
select t.as_user(t.u(7));
select t.raises('company B at its route limit cannot add a pair', $$select public.create_route_pair('B-Pair','BP','X','Y',null,'[{"name":"X1","offsetMinutes":0},{"name":"Y1","offsetMinutes":20}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$, '53400');
select t.as_admin();
select t.eq('the refused pair left nothing behind', (select count(*) from public.routes where name like 'B-Pair%'), 0::bigint);

-- ============ clients cannot bypass the pair rules ============
select t.as_user(t.u(2));
select t.raises('direct route insert is no longer possible', $$insert into public.routes (company_id, name, origin_name, destination_name) select company_id, 'Direct', 'A', 'B' from public.company_users where user_id = t.u(2) limit 1$$, '42501');
select t.raises('direct update of return_route_id is refused', format('update public.routes set return_route_id = %L where id = %L', t.route_by_name('Pair-2'), t.route_by_name('Pair-1')), '42501');
select t.eq('ordinary route edits still work', t.affected(format('update public.routes set description = %L where id = %L', 'edited', t.route_by_name('Pair-1'))), 1::bigint);
select t.as_admin();

-- ============ the link must be mutual ============
select t.raises('one-sided link is refused at commit',
  format('set constraints all immediate; update public.routes set return_route_id = %L where id = %L', t.route_by_name('Pair-6'), t.route_by_name('Pair-2 back')), '23505');

-- ============ backfill for existing routes ============
insert into public.routes (company_id, name, origin_name, destination_name)
  select company_id, 'Old-Out', 'Cairo', 'Hurghada' from public.company_users where user_id = t.u(2) limit 1;
insert into public.routes (company_id, name, origin_name, destination_name)
  select company_id, 'Old-Back', 'hurghada', 'CAIRO' from public.company_users where user_id = t.u(2) limit 1;
insert into public.routes (company_id, name, origin_name, destination_name)
  select company_id, 'Old-Lonely', 'Alex', 'Galala' from public.company_users where user_id = t.u(2) limit 1;
insert into public.route_stops (company_id, route_id, name, stop_order, stop_type, offset_minutes)
  select r.company_id, r.id, s.n, s.o, s.ty, s.off from public.routes r,
    (values ('Alex Station', 1, 'pickup', 0), ('Galala Uni', 2, 'dropoff', 200)) as s(n, o, ty, off) where r.name = 'Old-Lonely';
select t.eq('before the backfill the old routes have no return', t.rret(t.route_by_name('Old-Out')), null::uuid);
select app_private.backfill_route_returns();
select t.eq('routes that were each other reverse are paired (case-insensitive)', t.rret(t.route_by_name('Old-Out')), t.route_by_name('Old-Back'));
select t.eq('the pairing is mutual', t.rret(t.route_by_name('Old-Back')), t.route_by_name('Old-Out'));
select t.eq('a lonely route got a reversed copy', t.rret(t.route_by_name('Old-Lonely')) is not null, true);
select t.eq('the copy is named from the original', (select name from public.routes where id = t.rret(t.route_by_name('Old-Lonely'))), 'Old-Lonely (return)');
select t.eq('the copy reverses direction', (select origin_name || '>' || destination_name from public.routes where id = t.rret(t.route_by_name('Old-Lonely'))), 'Galala>Alex');
select t.eq('the copy has the reversed stops', t.stop_names(t.rret(t.route_by_name('Old-Lonely'))), 'Galala Uni,Alex Station');
select t.eq('the copy has reversed offsets and swapped types', t.stop_offsets(t.rret(t.route_by_name('Old-Lonely'))) || '/' || t.stop_types(t.rret(t.route_by_name('Old-Lonely'))), '0,200/pickup,dropoff');
select t.eq('every live route now has a return', (select count(*) from public.routes where deleted_at is null and return_route_id is null), 0::bigint);
select t.eq('every link is mutual', (select count(*) from public.routes a join public.routes b on b.id = a.return_route_id where b.return_route_id is distinct from a.id), 0::bigint);
select t.eq('a second backfill changes nothing', (app_private.backfill_route_returns() ->> 'pairs')::int, 0);
select t.eq('the plan-limit trigger is enabled again', (select tgenabled from pg_trigger where tgname = 'enforce_limit' and tgrelid = 'public.routes'::regclass), 'O'::"char");

-- ============ a pair counts once against max_routes; archive and restore keep the pair together ============
-- Company A (owner u(2)). Its plan limit is lowered to "used + 1" for this block and put back at the end.
select t.eq('every company A route is paired after the backfill', (select count(*) from public.routes where company_id = t.u(101) and deleted_at is null and return_route_id is null), 0::bigint);
create temp table t29 as
  select (select ls.plan_id from app_private.live_subscription(t.u(101)) ls) as plan_id,
         (select pe.int_value from public.plan_entitlements pe where pe.key = 'max_routes' and pe.plan_id = (select ls.plan_id from app_private.live_subscription(t.u(101)) ls)) as old_limit,
         (select count(*) from public.routes x where x.company_id = t.u(101) and x.deleted_at is null and (x.return_route_id is null or x.id < x.return_route_id)) as used,
         (select id from public.routes where name = 'Pair-1' limit 1) as go_id,
         (select return_route_id from public.routes where name = 'Pair-1' limit 1) as ret_id;
grant select on t29 to public;
update public.plan_entitlements set int_value = (select used + 1 from t29) where key = 'max_routes' and plan_id = (select plan_id from t29);
select t.as_user(t.u(2));
select t.eq('usage counts each pair once', (public.my_plan_usage(t.u(101)) -> 'limits' -> 'max_routes' ->> 'used')::bigint, (select used from t29));
select t.passes('one slot left: a pair fits', $$select public.create_route_pair('Slot-Pair','SP','X','Y',null,'[{"name":"X1","offsetMinutes":0},{"name":"Y1","offsetMinutes":20}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$);
select t.eq('the new pair used ONE slot, not two', (public.my_plan_usage(t.u(101)) -> 'limits' -> 'max_routes' ->> 'used')::bigint, (select used + 1 from t29));
select t.raises('now at the limit: a second pair is refused', $$select public.create_route_pair('Slot-Pair2','SP2','X','Y',null,'[{"name":"X1","offsetMinutes":0},{"name":"Y1","offsetMinutes":20}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$, '53400');
select t.as_admin();
update public.routes set deleted_at = now() where id = (select go_id from t29);
select t.eq('archiving one side archives its partner', (select count(*) from public.routes where id in ((select go_id from t29), (select ret_id from t29)) and deleted_at is not null), 2::bigint);
select t.as_user(t.u(2));
select t.eq('an archived pair frees one slot', (public.my_plan_usage(t.u(101)) -> 'limits' -> 'max_routes' ->> 'used')::bigint, (select used from t29));
select t.passes('so a new pair fits again', $$select public.create_route_pair('Slot-Pair3','SP3','X','Y',null,'[{"name":"X1","offsetMinutes":0},{"name":"Y1","offsetMinutes":20}]'::jsonb,'{"sameAsReverse":true}'::jsonb)$$);
select t.as_admin();
update public.routes set deleted_at = null where id = (select ret_id from t29);
select t.eq('restoring one side restores its partner', (select count(*) from public.routes where id in ((select go_id from t29), (select ret_id from t29)) and deleted_at is null), 2::bigint);
update public.plan_entitlements set int_value = (select old_limit from t29) where key = 'max_routes' and plan_id = (select plan_id from t29);
select t.eq('the plan limit is put back', (select int_value from public.plan_entitlements where key = 'max_routes' and plan_id = (select plan_id from t29)), (select old_limit from t29));
