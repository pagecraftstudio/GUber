-- 23: Drivers <-> Team sync (migration 0026). Requires 01 fixtures; run alone or after 02-22.
-- users: 2 ownerA, 3 managerA, 5 bookingA, 7 ownerB. New here: 801 (will accept a driver invite), 803 (existing booking member).
create or replace function t.d_user(p uuid) returns uuid language sql security definer as $$ select user_id from public.drivers where id = p $$;
create or replace function t.d_status(p uuid) returns text language sql security definer as $$ select status from public.drivers where id = p $$;
create or replace function t.m_role(p uuid) returns text language sql security definer as $$ select r.key from public.company_users cu join public.roles r on r.id = cu.role_id where cu.user_id = p $$;
create or replace function t.m_id(p uuid) returns uuid language sql security definer as $$ select id from public.company_users where user_id = p $$;

select t.as_admin();
-- earlier cumulative suites may have filled Company A's plan allowance; lift it for this suite and restore it at the end
create temp table s23_limits as select e.plan_id, e.key, e.int_value from public.plan_entitlements e where e.plan_id in (select plan_id from public.subscriptions where company_id in (t.u(101), t.u(102)) and status in ('trialing','active','past_due')) and e.key in ('max_drivers', 'max_users');
update public.plan_entitlements e set int_value = null where e.plan_id in (select plan_id from s23_limits) and e.key in ('max_drivers', 'max_users');
insert into auth.users (id, email, email_confirmed_at) values (t.u(801), 'drv-a1@s23.test', now()), (t.u(802), 'drv-b@s23.test', now()), (t.u(803), 'mem-a@s23.test', now());
insert into company_users (company_id, user_id, role_id) select t.u(101), t.u(803), r.id from roles r where r.key = 'booking';
insert into drivers (id, company_id, full_name, phone) values (t.u(811), t.u(101), 'S23 Driver One', '+201230000001'), (t.u(812), t.u(101), 'S23 Driver Two', '+201230000002'), (t.u(813), t.u(102), 'S23 Driver B', '+201230000003');
insert into drivers (id, company_id, full_name, phone, status) values (t.u(814), t.u(101), 'S23 Inactive', '+201230000004', 'inactive');
create temp table s23_tok (label text, token text, invite_id uuid);
grant all on s23_tok to authenticated;

-- ============ a driver invite must name its record ============
select t.as_user(t.u(2));
select t.raises('plain create_invite with role driver is refused (needs a record)', $$select * from public.create_invite('plain-driver@s23.test', 'driver')$$, '23514');
select t.as_admin();
select t.raises('a non-driver invite cannot carry a driver record', format($$insert into public.company_invites (company_id, email, role_id, token_hash, expires_at, driver_id) select %L, 'x@s23.test', r.id, 'h', now() + interval '1 day', %L from public.roles r where r.key = 'booking'$$, t.u(101), t.u(811)), '23514');

-- ============ invite_driver: authorization + tenant ============
select t.as_user(t.u(3));
select t.raises('manager cannot invite a driver login', format('select * from public.invite_driver(%L, %L)', t.u(811), 'drv-a1@s23.test'), '42501');
select t.as_user(t.u(5));
select t.raises('booking staff cannot invite a driver login', format('select * from public.invite_driver(%L, %L)', t.u(811), 'drv-a1@s23.test'), '42501');
select t.as_anon();
select t.raises('anonymous cannot invite a driver login', format('select * from public.invite_driver(%L, %L)', t.u(811), 'drv-a1@s23.test'));
select t.as_user(t.u(7));
select t.raises('Company B owner cannot invite for a Company A driver (not found)', format('select * from public.invite_driver(%L, %L)', t.u(811), 'drv-a1@s23.test'), 'P0002');
select t.as_admin();
select t.eq('no invite was created by the refused calls', (select count(*) from public.company_invites where email in ('drv-a1@s23.test', 'plain-driver@s23.test')), 0::bigint);

select t.as_user(t.u(2));
select t.raises('invalid email refused', format('select * from public.invite_driver(%L, %L)', t.u(811), 'not-an-email'), '22023');
select t.raises('inactive driver cannot get a login', format('select * from public.invite_driver(%L, %L)', t.u(814), 'inactive@s23.test'), '23514');
select t.raises('an email that already belongs to a company is refused', format('select * from public.invite_driver(%L, %L)', t.u(811), 'u3@test.dev'), '23505');
select t.passes('owner invites a driver login for a driver record', format($$insert into s23_tok select 'd1', token, invite_id from public.invite_driver(%L, %L)$$, t.u(811), 'drv-a1@s23.test'));
select t.raises('a second pending invite for the same driver is refused', format('select * from public.invite_driver(%L, %L)', t.u(811), 'other@s23.test'), '23505');
select t.as_admin();
select t.eq('the invite carries the driver record, role driver, company A', (select count(*) from public.company_invites ci join public.roles r on r.id = ci.role_id where ci.email = 'drv-a1@s23.test' and ci.driver_id = t.u(811) and ci.company_id = t.u(101) and r.key = 'driver' and length(ci.token_hash) > 20), 1::bigint);

-- ============ accepting links the record in the same transaction ============
select t.as_user(t.u(801));
select t.passes('the invited person accepts', $$select * from public.accept_invite((select token from s23_tok where label = 'd1'))$$);
select t.as_admin();
select t.eq('member exists with role driver in company A', t.m_role(t.u(801)), 'driver');
select t.eq('driver record is now linked to the new login', t.d_user(t.u(811)), t.u(801));
select t.eq('driver record is active', t.d_status(t.u(811)), 'active');

-- ============ members and records stay in step ============
select t.as_user(t.u(2));
select public.set_member_status(t.m_id(t.u(801)), 'suspended');
select t.as_admin();
select t.eq('suspending the member deactivates the driver record', t.d_status(t.u(811)), 'inactive');
select t.as_user(t.u(2));
select public.set_member_status(t.m_id(t.u(801)), 'active');
select t.as_admin();
select t.eq('reactivating the member reactivates the driver record', t.d_status(t.u(811)), 'active');
select t.as_user(t.u(2));
select public.set_member_role(t.m_id(t.u(801)), 'booking');
select t.as_admin();
select t.eq('leaving the driver role unlinks the record', t.d_user(t.u(811)), null::uuid);
select t.eq('...and marks it inactive', t.d_status(t.u(811)), 'inactive');
select t.as_user(t.u(2));
select t.raises('changing someone TO driver without a record is refused', format('select public.set_member_role(%L, %L)', t.m_id(t.u(801)), 'driver'), '23514');

-- ============ link_driver_login (repair path) ============
select t.as_user(t.u(3));
select t.raises('manager cannot link a driver login', format('select public.link_driver_login(%L, %L)', t.u(812), t.m_id(t.u(803))), '42501');
select t.as_user(t.u(7));
select t.raises('Company B owner cannot link a Company A driver', format('select public.link_driver_login(%L, %L)', t.u(812), t.m_id(t.u(803))), 'P0002');
select t.raises('Company B owner cannot link its driver to a Company A member', format('select public.link_driver_login(%L, %L)', t.u(813), t.m_id(t.u(803))), 'P0002');
select t.as_admin();
select t.eq('nothing linked by refused calls', t.d_user(t.u(812)), null::uuid);
select t.eq('Company B driver untouched', t.d_user(t.u(813)), null::uuid);
select t.as_user(t.u(2));
select t.raises('Company A owner cannot reach a Company B driver', format('select public.link_driver_login(%L, %L)', t.u(813), t.m_id(t.u(803))), 'P0002');
select t.raises('an owner cannot be turned into a driver login', format('select public.link_driver_login(%L, %L)', t.u(812), t.m_id(t.u(2))), '23514');
select t.eq('owner links an existing member to a driver record', (public.link_driver_login(t.u(812), t.m_id(t.u(803))) ->> 'driver_id')::uuid, t.u(812));
select t.as_admin();
select t.eq('record points at the member login', t.d_user(t.u(812)), t.u(803));
select t.eq('member became a driver', t.m_role(t.u(803)), 'driver');
select t.eq('linking is audited', (select count(*) from public.audit_logs where action = 'driver.linked' and entity_id = t.u(812)), 1::bigint);
select t.as_user(t.u(2));
select t.raises('a record that already has a login cannot be linked again', format('select public.link_driver_login(%L, %L)', t.u(812), t.m_id(t.u(803))), '23514');
select t.raises('a member that already has a record cannot get a second one', format('select public.link_driver_login(%L, %L)', t.u(811), t.m_id(t.u(803))), '23514');
select t.as_admin();
select t.eq('a linked driver login can read assigned trips through drivers.user_id (own record visible)', (select count(*) from public.drivers where user_id = t.u(803)), 1::bigint);

-- restore the allowance lifted at the top
update public.plan_entitlements e set int_value = l.int_value from s23_limits l where e.plan_id = l.plan_id and e.key = l.key;
