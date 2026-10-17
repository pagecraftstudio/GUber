-- 11: Phase 7.1 platform security foundation (0015). Requires 01 fixtures (suites 02-10 may have run before it).
-- Every state change this file makes is restored at the end. Audit rows written by the audit test are append-only by design.
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
-- passes only if the statement raises `state` AND the message contains `frag`
create or replace function t.raises_msg(name text, stmt text, state text, frag text) returns void language plpgsql as
  $$ begin
       execute stmt;
       insert into t.results(ok,name,detail) values (false,name,'no error'); raise notice 'FAIL  % (no error)', name;
     exception when others then
       if sqlstate = state and sqlerrm like '%' || frag || '%' then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s: %s',sqlstate,sqlerrm)); raise notice 'FAIL  % (sqlstate %: %)', name, sqlstate, sqlerrm; end if;
     end $$;
-- superuser session that still has an authenticated identity: lets us call private helpers "as" a user
create or replace function t.as_trusted(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); end $$;
-- fingerprint of every table the lockdown protects (run as admin)
create or replace function t.snap() returns text language sql as $$
  select md5(concat_ws('|',
    (select md5(string_agg(x::text, '|' order by x::text)) from public.companies x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.subscriptions x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.invoices x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.payments x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.platform_users x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.plans x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.plan_entitlements x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.entitlement_definitions x),
    (select md5(string_agg(x::text, '|' order by x::text)) from public.company_notes x)))
$$;
create table if not exists t.marks (name text primary key, id int);
alter table t.marks disable row level security;
grant all on t.marks to anon, authenticated;
delete from t.marks where name = '11snap';

-- ======================= A. NO DIRECT WRITES ON THE PROTECTED TABLES, BY ANYONE =======================
select t.as_admin();
insert into t.marks values ('11snap', 0);
create temp table t11_snap as select t.snap() as h;

select t.eq('policies: no INSERT/UPDATE/ALL policy left on the protected tables',
  (select count(*) from pg_policies where schemaname = 'public' and cmd in ('INSERT','UPDATE','ALL')
     and tablename in ('companies','subscriptions','invoices','payments','platform_users','plans','plan_entitlements','entitlement_definitions','company_notes')), 0::bigint);
select t.eq('policies: platform_select kept on every protected table',
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'platform_select'
     and tablename in ('companies','subscriptions','invoices','payments','platform_users','plans','plan_entitlements','entitlement_definitions','company_notes')), 9::bigint);
select t.eq('policies: platform write policies on tenant-operational tables untouched (routes, buses, customers)',
  (select count(*) from pg_policies where schemaname = 'public' and policyname in ('platform_insert','platform_update')
     and tablename in ('routes','buses','customers')), 6::bigint);
select t.eq('policies: domains write policies unchanged (accepted gap until Phase 12)',
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'domains' and policyname in ('platform_insert','platform_update')), 2::bigint);
select t.eq('privileges: authenticated has no INSERT/UPDATE on any protected table',
  (select count(*) from unnest(array['companies','subscriptions','invoices','payments','platform_users','plans','plan_entitlements','entitlement_definitions','company_notes']) tbl
    where has_table_privilege('authenticated', 'public.' || tbl, 'INSERT') or has_table_privilege('authenticated', 'public.' || tbl, 'UPDATE')), 0::bigint);

do $$
declare
  actors uuid[] := array[t.u(1), t.u(9), t.u(10), t.u(2), t.u(3), t.u(7), null];
  labels text[] := array['super_admin','support','billing','owner A','manager A','owner B','anon'];
  s record; i int;
  stmts jsonb := $j$[
   {"t":"companies","op":"insert","q":"insert into companies (name, slug) values ('x', 'phase71-x')"},
   {"t":"companies","op":"update","q":"update companies set name = 'x' where id = t.u(101)"},
   {"t":"subscriptions","op":"insert","q":"insert into subscriptions (company_id, plan_id, status, billing_interval, current_period_start, current_period_end) select t.u(101), id, 'active', 'monthly', now(), now() + interval '1 day' from plans limit 1"},
   {"t":"subscriptions","op":"update","q":"update subscriptions set status = 'cancelled' where company_id = t.u(101)"},
   {"t":"invoices","op":"insert","q":"insert into invoices (company_id, invoice_number, status, currency, subtotal, total) values (t.u(101), 'INV-71', 'open', 'EGP', 1, 1)"},
   {"t":"invoices","op":"update","q":"update invoices set status = 'void'"},
   {"t":"payments","op":"insert","q":"insert into payments (company_id, invoice_id, amount, currency, status) values (t.u(101), gen_random_uuid(), 1, 'EGP', 'pending')"},
   {"t":"payments","op":"update","q":"update payments set status = 'refunded'"},
   {"t":"platform_users","op":"insert","q":"insert into platform_users (user_id, role) values (t.u(2), 'super_admin')"},
   {"t":"platform_users","op":"update","q":"update platform_users set role = 'super_admin' where user_id = t.u(9)"},
   {"t":"plans","op":"insert","q":"insert into plans (code, name) values ('phase71', 'Phase71')"},
   {"t":"plans","op":"update","q":"update plans set price_monthly = 1 where code = 'starter'"},
   {"t":"plan_entitlements","op":"insert","q":"insert into plan_entitlements (plan_id, key, int_value) select id, 'max_buses', 99 from plans where code = 'starter'"},
   {"t":"plan_entitlements","op":"update","q":"update plan_entitlements set int_value = 999 where key = 'max_buses'"},
   {"t":"entitlement_definitions","op":"insert","q":"insert into entitlement_definitions (key, value_type, description) values ('phase71_key', 'integer', 'x')"},
   {"t":"entitlement_definitions","op":"update","q":"update entitlement_definitions set description = 'x' where key = 'max_users'"},
   {"t":"company_notes","op":"insert","q":"insert into company_notes (company_id, author_id, body) values (t.u(101), t.u(9), 'phase71')"},
   {"t":"company_notes","op":"update","q":"update company_notes set body = 'x'"}
  ]$j$;
begin
  for i in 1 .. array_length(actors, 1) loop
    if actors[i] is null then perform t.as_anon(); else perform t.as_user(actors[i]); end if;
    for s in select * from jsonb_to_recordset(stmts) as x(t text, op text, q text) loop
      perform t.raises_msg(format('A: %s cannot %s %s directly', labels[i], s.op, s.t), s.q, '42501', 'permission denied for table ' || s.t);
    end loop;
  end loop;
  perform t.as_admin();
end $$;

select t.as_admin();
select t.eq('A: protected tables byte-for-byte unchanged after every refused write', t.snap(), (select h from t11_snap));

-- platform staff keep READ access; tenants and anon still read nothing platform-level
select t.as_user(t.u(1));
select t.eq('B: super_admin still reads companies', t.rows('select 1 from companies') > 0, true);
select t.eq('B: super_admin still reads platform_users', t.rows('select 1 from platform_users'), 3::bigint);
select t.as_user(t.u(9));
select t.eq('B: support still reads companies and subscriptions', t.rows('select 1 from companies') > 0 and t.rows('select 1 from subscriptions') > 0, true);
select t.as_user(t.u(10));
select t.eq('B: billing still reads subscriptions and invoices table', t.rows('select 1 from subscriptions') > 0, true);
select t.as_user(t.u(2));
select t.eq('B: tenant owner still cannot read platform_users', t.rows('select 1 from platform_users'), 0::bigint);
select t.eq('B: tenant owner still cannot read companies table', t.rows('select 1 from companies'), 0::bigint);
select t.as_anon();
select t.eq('B: anon reads no platform_users', t.err_of('select 1 from platform_users'), '42501|permission denied for table platform_users');

-- ======================= C. HELPERS: assert_platform / audit_platform =======================
select t.as_trusted(t.u(1));
select t.eq('C: assert_platform() default list accepts super_admin', app_private.assert_platform(), 'super_admin');
select t.as_trusted(t.u(9));
select t.raises('C: assert_platform() default list rejects support', 'select app_private.assert_platform()', '42501');
select t.eq('C: explicit list accepts support', app_private.assert_platform(array['support','super_admin']), 'support');
select t.as_trusted(t.u(10));
select t.raises('C: billing rejected for default list', 'select app_private.assert_platform()', '42501');
select t.eq('C: billing accepted when listed', app_private.assert_platform(array['billing']), 'billing');
select t.as_trusted(t.u(2));
select t.raises('C: tenant owner rejected', 'select app_private.assert_platform(array[''super_admin'',''support'',''billing''])', '42501');
select t.as_trusted(null);
select t.raises('C: no identity rejected', 'select app_private.assert_platform(array[''super_admin'',''support'',''billing''])', '42501');
select t.as_admin();
update platform_users set is_active = false where user_id = t.u(9);
select t.as_trusted(t.u(9));
select t.raises('C: deactivated platform user rejected', 'select app_private.assert_platform(array[''support''])', '42501');
select t.as_admin();
update platform_users set is_active = true where user_id = t.u(9);

select t.as_user(t.u(1));
select t.raises('C: authenticated cannot execute assert_platform', 'select app_private.assert_platform()', '42501');
select t.raises('C: authenticated cannot execute audit_platform', $$select app_private.audit_platform(t.u(101), 'x', 'company', t.u(101), null, null)$$, '42501');
select t.raises('C: authenticated cannot execute write_audit', $$select app_private.write_audit('platform_user', t.u(101), 'x', 'company', t.u(101))$$, '42501');
select t.raises('C: authenticated cannot execute live_subscription', 'select * from app_private.live_subscription(t.u(101))', '42501');
select t.as_anon();
select t.raises('C: anon cannot execute assert_platform', 'select app_private.assert_platform()', '42501');

select t.as_trusted(t.u(1));
select app_private.audit_platform(t.u(101), 'phase71.test', 'company', t.u(101), '{"status":"a"}'::jsonb, '{"status":"b"}'::jsonb);
select t.as_admin();
select t.eq('C: audit_platform wrote exactly one row', (select count(*) from audit_logs where action = 'phase71.test'), 1::bigint);
select t.eq('C: audit row actor = the platform user, type platform_user, company set',
  (select actor_id = t.u(1) and actor_type = 'platform_user' and company_id = t.u(101) from audit_logs where action = 'phase71.test'), true);
select t.eq('C: audit row carries before/after', (select metadata->'before'->>'status' || '>' || (metadata->'after'->>'status') from audit_logs where action = 'phase71.test'), 'a>b');
select t.as_trusted(t.u(2));
select t.raises('C: audit_platform refuses a tenant caller', $$select app_private.audit_platform(t.u(101), 'phase71.forged', 'company', t.u(101), null, null)$$, '42501');
select t.as_admin();
select t.eq('C: no forged audit row exists', (select count(*) from audit_logs where action = 'phase71.forged'), 0::bigint);
select t.raises('C: audit_logs UPDATE still blocked (even for the owner)', $$update audit_logs set action = 'x' where action = 'phase71.test'$$);
select t.raises('C: audit_logs DELETE still blocked (even for the owner)', $$delete from audit_logs where action = 'phase71.test'$$);
select t.raises('C: audit_logs TRUNCATE still blocked (even for the owner)', 'truncate audit_logs');
select t.as_user(t.u(1));
select t.raises('C: super_admin cannot UPDATE audit_logs through the API', $$update audit_logs set action = 'x'$$, '42501');
select t.as_admin();

-- ======================= D. LAST ACTIVE SUPER_ADMIN GUARD =======================
select t.as_admin();
select t.eq('D: fixture has exactly one active super_admin', (select count(*) from platform_users where role = 'super_admin' and is_active), 1::bigint);
select t.raises('D: cannot demote the only super_admin', $$update platform_users set role = 'support' where user_id = t.u(1)$$, '23514');
select t.raises('D: cannot deactivate the only super_admin', $$update platform_users set is_active = false where user_id = t.u(1)$$, '23514');
select t.raises('D: cannot delete the only super_admin', $$delete from platform_users where user_id = t.u(1)$$, '23514');
select t.raises('D: cannot re-point the only super_admin row to another user', $$update platform_users set user_id = t.u(2) where user_id = t.u(1)$$, '23514');
select t.raises('D: cannot deactivate the profile of the only super_admin', $$update profiles set is_active = false where id = t.u(1)$$, '23514');
select t.raises('D: cannot delete the profile of the only super_admin (cascade)', $$delete from profiles where id = t.u(1)$$, '23514');
select t.eq('D: still one active super_admin after all refused attempts', (select count(*) from platform_users where role = 'super_admin' and is_active), 1::bigint);
select t.passes('D: demoting a non-super_admin platform user is unaffected', $$update platform_users set role = 'billing' where user_id = t.u(9)$$);
update platform_users set role = 'support' where user_id = t.u(9);

-- bootstrap script semantics (supabase/bootstrap/first_super_admin.sql) still work as the owner, create and re-run
select t.passes('D: bootstrap upsert creates a new super_admin', $$insert into public.platform_users (user_id, role) select id, 'super_admin' from auth.users where email = 'u5@test.dev' on conflict (user_id) do update set role = 'super_admin', is_active = true$$);
select t.passes('D: bootstrap upsert is idempotent', $$insert into public.platform_users (user_id, role) select id, 'super_admin' from auth.users where email = 'u5@test.dev' on conflict (user_id) do update set role = 'super_admin', is_active = true$$);
select t.eq('D: now two active super_admins', (select count(*) from platform_users where role = 'super_admin' and is_active), 2::bigint);
select t.passes('D: with a second active super_admin the first may be demoted', $$update platform_users set role = 'support' where user_id = t.u(1)$$);
select t.raises('D: the remaining one is now protected', $$update platform_users set is_active = false where user_id = t.u(5)$$, '23514');
select t.passes('D: restore: first back to super_admin (not a removal)', $$update platform_users set role = 'super_admin' where user_id = t.u(1)$$);
select t.passes('D: second super_admin profile may be deactivated while the first stays active', $$update profiles set is_active = false where id = t.u(5)$$);
select t.raises('D: an inactive-profile super_admin does not count as a spare', $$update platform_users set role = 'support' where user_id = t.u(1)$$, '23514');
update profiles set is_active = true where id = t.u(5);
select t.passes('D: cleanup: remove the second super_admin', $$delete from platform_users where user_id = t.u(5)$$);
select t.eq('D: back to exactly one active super_admin', (select count(*) from platform_users where role = 'super_admin' and is_active), 1::bigint);
select t.eq('D: platform_users back to the 3 fixture rows', (select count(*) from platform_users), 3::bigint);

-- ======================= E. EXPIRY-AWARE SUBSCRIPTION ENFORCEMENT =======================
-- Company A = 'professional'. Own fixtures: trip 1101 with the free bus/driver pair, created while the subscription is live.
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
values (t.u(1101), t.u(101), t.u(201), t.u(225), t.u(234), date_trunc('day', now()) + interval '70 day 8 hours', date_trunc('day', now()) + interval '70 day 10 hours', 30, 10, 'scheduled');
select t.eq('E: live (in-period) subscription is returned', (select count(*) from app_private.live_subscription(t.u(101))), 1::bigint);
select t.as_user(t.u(2));
select t.passes('E: in-period: owner inserts a bus', $$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'P71-OK', 20)$$);
select t.passes('E: in-period: owner inserts a route', $$insert into routes (company_id, name, origin_name, destination_name) values (t.u(101), 'P71 ok route', 'a', 'b')$$);
select t.passes('E: in-period: owner inserts a driver', $$insert into drivers (company_id, full_name, phone) values (t.u(101), 'P71 driver', '+201000007101')$$);

-- expire A by date only: status stays 'active' (this is the audit's R3 scenario)
select t.as_admin();
update subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 second' where company_id = t.u(101);
select t.eq('E: status is still active, only the period ended', (select status from subscriptions where company_id = t.u(101)), 'active');
select t.eq('E: live_subscription() now returns nothing', (select count(*) from app_private.live_subscription(t.u(101))), 0::bigint);
select t.raises_msg('E: entitlement_limit raises "no active subscription" when expired', $$select app_private.entitlement_limit(t.u(101), 'max_buses')$$, '42501', 'no active subscription');
select t.as_user(t.u(2));
select t.raises_msg('E: expired: owner cannot insert a bus', $$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'P71-NO', 20)$$, '42501', 'no active subscription');
select t.raises_msg('E: expired: owner cannot insert a route', $$insert into routes (company_id, name, origin_name, destination_name) values (t.u(101), 'P71 no route', 'a', 'b')$$, '42501', 'no active subscription');
select t.raises_msg('E: expired: owner cannot insert a driver', $$insert into drivers (company_id, full_name, phone) values (t.u(101), 'P71 driver2', '+201000007102')$$, '42501', 'no active subscription');
select t.as_user(t.u(3));
select t.raises_msg('E: expired: manager cannot create a trip', $$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, notes) values (t.u(101), t.u(201), t.u(225), t.u(234), date_trunc('day', now()) + interval '71 day 8 hours', date_trunc('day', now()) + interval '71 day 10 hours', 30, 10, 'p71-trip')$$, '42501', 'no active subscription');
select t.as_user(t.u(5));
select t.raises_msg('E: expired: booking staff cannot create a booking', $$select public.create_booking(t.u(1101), 'Sara', '+201000007103', 1, p_idempotency_key => 'p71-expired')$$, '42501', 'no active subscription');
-- reads and the existing data keep working: expiry is NOT a lockout
select t.as_user(t.u(2));
select t.eq('E: expired: owner still reads routes', t.rows('select 1 from routes') > 0, true);
select t.eq('E: expired: owner still reads buses', t.rows('select 1 from buses') > 0, true);
select t.eq('E: expired: owner still sees the company', (select count(*) from my_company), 1::bigint);
select t.passes('E: expired: owner can still UPDATE an existing bus (no new rows)', $$update buses set notes = 'still editable' where plate_number = 'P71-OK'$$);
select t.as_anon();
select t.eq('E: expired: public trip search for the company still answers', t.err_of($$select count(*) from public.public_search_trips()$$) not like '4%', true);
-- cross-tenant: A's expiry must not affect B
select t.as_user(t.u(7));
select t.passes('E: company B (live) is unaffected by A expiring', $$insert into buses (company_id, plate_number, capacity) values (t.u(102), 'P71-B', 5)$$);
select t.as_admin();
delete from buses where plate_number = 'P71-B';

-- trialing + expired is blocked too; past_due while in-period still works; restoring the period restores access
update subscriptions set status = 'trialing' where company_id = t.u(101);
select t.eq('E: trialing + ended period is not live', (select count(*) from app_private.live_subscription(t.u(101))), 0::bigint);
update subscriptions set status = 'past_due', current_period_end = now() + interval '5 days' where company_id = t.u(101);
select t.eq('E: past_due inside its period is still live', (select count(*) from app_private.live_subscription(t.u(101))), 1::bigint);
select t.as_user(t.u(2));
select t.passes('E: past_due in-period: owner can insert a bus', $$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'P71-PD', 20)$$);
select t.as_admin();
update subscriptions set status = 'cancelled' where company_id = t.u(101);
select t.eq('E: cancelled is not live even with a future end', (select count(*) from app_private.live_subscription(t.u(101))), 0::bigint);
update subscriptions set status = 'expired' where company_id = t.u(101);
select t.eq('E: expired status is not live', (select count(*) from app_private.live_subscription(t.u(101))), 0::bigint);
update subscriptions set status = 'active', current_period_end = now() + interval '30 days' where company_id = t.u(101);
select t.eq('E: restored: live again', (select count(*) from app_private.live_subscription(t.u(101))), 1::bigint);
select t.as_user(t.u(3));
select t.passes('E: restored: manager can create a trip again', $$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, notes) values (t.u(101), t.u(201), t.u(225), t.u(234), date_trunc('day', now()) + interval '71 day 8 hours', date_trunc('day', now()) + interval '71 day 10 hours', 30, 10, 'p71-trip')$$);

-- cleanup of E
select t.as_admin();
delete from trips where id = t.u(1101) or notes = 'p71-trip';
delete from buses where plate_number in ('P71-OK', 'P71-PD');
delete from routes where name = 'P71 ok route';
delete from drivers where full_name = 'P71 driver';

-- ======================= F. contact_name =======================
select t.as_admin();
select t.passes('F: contact_name accepts a normal name', $$update companies set contact_name = 'Ahmed Hassan' where id = t.u(101)$$);
select t.raises('F: contact_name rejects empty string', $$update companies set contact_name = '' where id = t.u(101)$$, '23514');
select t.raises('F: contact_name rejects 121 characters', $$update companies set contact_name = repeat('x', 121) where id = t.u(101)$$, '23514');
select t.passes('F: contact_name accepts exactly 120 characters', $$update companies set contact_name = repeat('x', 120) where id = t.u(101)$$);
update companies set contact_name = null where id = t.u(101);
select t.eq('F: contact_name not exposed through the tenant view my_company',
  (select count(*) from information_schema.columns where table_name = 'my_company' and column_name = 'contact_name'), 0::bigint);

-- ======================= G. final integrity =======================
select t.eq('G: all three fixture subscriptions are live again', (select count(*) from subscriptions where status = 'active' and current_period_end > now()) >= 3, true);
select t.eq('G: platform_users back to fixture state', (select count(*) from platform_users), 3::bigint);
