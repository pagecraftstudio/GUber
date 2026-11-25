-- 60: super admin "acting as" a company (migration 0065). Needs 01 fixtures: companies A=101 / B=102, users 1 super_admin, 9 support, 10 billing, 2 ownerA, 7 ownerB.
select t.as_admin();
create or replace function t.err60(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.cnt60(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.hp60(p_company uuid, p_key text) returns boolean language sql security definer as $$ select app_private.has_permission(p_company, p_key) $$;
create or replace function t.cc60(p_key text) returns uuid language plpgsql security definer as $$ begin return app_private.caller_company(p_key); exception when others then return null; end $$;
create or replace function t.pay60() returns text language sql as $$ select t.err60($q$select public.save_company_payment_settings(false,null,null,null,null,null,24,null,null)$q$) $$;
-- a trip draft in company A for the hard-delete check
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select t.u(6001), t.u(101), r.id, b.id, null, now() + interval '300 days', now() + interval '300 days 2 hours', 40, 10, 'draft'
  from (select id from routes where company_id = t.u(101) limit 1) r, (select id from buses where company_id = t.u(101) limit 1) b;

-- 1. nobody has anything before a session -----------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.eq('before: super_admin has no access to company A through has_permission', t.hp60(t.u(101), 'trips.read'), false);
select t.eq('before: and no caller_company', t.cc60('settings.write'), null::uuid);

-- 2. who may start a session ---------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.eq('a company owner cannot enter acting mode', left(t.err60(format($q$select public.platform_enter_acting(%L, 'looking around')$q$, t.u(101))), 5), '42501');
select t.as_user(t.u(10));
select t.eq('billing cannot enter acting mode', left(t.err60(format($q$select public.platform_enter_acting(%L, 'looking around')$q$, t.u(101))), 5), '42501');
select t.as_anon();
select t.eq('anon cannot', left(t.err60(format($q$select public.platform_enter_acting(%L, 'looking around')$q$, t.u(101))), 5), '42501');
select t.as_user(t.u(1));
select t.eq('a reason is required', left(t.err60(format($q$select public.platform_enter_acting(%L, '  ')$q$, t.u(101))), 5), '22023');
select t.eq('unknown company refused', left(t.err60($$select public.platform_enter_acting(gen_random_uuid(), 'looking around')$$), 5), 'P0002');
select t.eq('writing cannot be confirmed without a session', left(t.err60($$select public.platform_confirm_acting_write()$$), 5), 'P0002');

-- 3. read mode ------------------------------------------------------------------------------------------------------------------------------------------
select t.passes('super_admin enters company A with a reason', format($q$select public.platform_enter_acting(%L, 'support ticket 4411')$q$, t.u(101)));
select t.eq('status: acting on A in read mode', (select company_id::text || '/' || mode from public.platform_acting_status()), t.u(101)::text || '/read');
select t.eq('read mode: read key allowed', t.hp60(t.u(101), 'trips.read'), true);
select t.eq('read mode: write key refused', t.hp60(t.u(101), 'trips.write'), false);
select t.eq('read mode: caller_company works for a read key', t.cc60('drivers.read'), t.u(101));
select t.eq('read mode: another company is NOT opened', t.hp60(t.u(102), 'trips.read'), false);
select t.eq('read mode: payment settings write refused', left(t.pay60(), 5), '42501');
select t.eq('start is audited with the reason', t.cnt60($$select count(*) from audit_logs where action = 'acting.started' and actor_type = 'platform_user' and metadata->>'reason' = 'support ticket 4411'$$), 1::bigint);

-- 4. write mode -----------------------------------------------------------------------------------------------------------------------------------------
select t.passes('super_admin confirms write', $$select public.platform_confirm_acting_write()$$);
select t.eq('status: now write', (select mode from public.platform_acting_status()), 'write');
select t.eq('write mode: trips.write allowed', t.hp60(t.u(101), 'trips.write'), true);
select t.eq('write mode: users.write still refused (no minting company users)', t.hp60(t.u(101), 'users.write'), false);
select t.eq('write mode: domains.write still refused', t.hp60(t.u(101), 'domains.write'), false);
select t.eq('write mode: website.publish not granted', t.hp60(t.u(101), 'website.publish'), false);
select t.eq('write mode: company B is still closed', t.hp60(t.u(102), 'trips.write'), false);
select t.eq('write mode: a real company RPC works (payment settings)', t.pay60(), 'NO ERROR');
select t.eq('...and its audit row says platform_user, acting', t.cnt60($$select count(*) from audit_logs where action = 'payment_settings.saved' and actor_type = 'platform_user' and metadata->>'acting_as' = 'true' and metadata->>'acting_mode' = 'write'$$) >= 1, true);
select t.eq('write enabled is audited', t.cnt60($$select count(*) from audit_logs where action = 'acting.write_enabled'$$), 1::bigint);
select t.eq('hard delete refused while acting', left(t.err60(format($q$select public.delete_draft_trip(%L)$q$, t.u(6001))), 5), '42501');
select t.eq('...the draft trip is still there', t.cnt60(format($q$select count(*) from trips where id = %L$q$, t.u(6001))), 1::bigint);

-- 5. support is read only, always ---------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(9));
select t.passes('support can enter', format($q$select public.platform_enter_acting(%L, 'checking a complaint')$q$, t.u(101)));
select t.eq('support: read allowed', t.hp60(t.u(101), 'bookings.read'), true);
select t.eq('support: confirm write refused', left(t.err60($$select public.platform_confirm_acting_write()$$), 5), '42501');
select t.eq('support: write key refused', t.hp60(t.u(101), 'bookings.write'), false);
select t.eq('support: payment settings write refused', left(t.pay60(), 5), '42501');

-- 6. sessions are personal and end properly -----------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.eq('super_admin session unaffected by support entering', (select mode from public.platform_acting_status()), 'write');
select t.as_user(t.u(2));
select t.eq('an owner sees no acting status (not platform staff)', left(t.err60($$select * from public.platform_acting_status()$$), 5), '42501');
select t.eq('owner of A has no extra reach into B through staff sessions', t.hp60(t.u(102), 'trips.read'), false);
select t.as_user(t.u(1));
select t.passes('exit', $$select public.platform_exit_acting()$$);
select t.eq('after exit: no status rows', (select count(*) from public.platform_acting_status()), 0::bigint);
select t.eq('after exit: has_permission closed again', t.hp60(t.u(101), 'trips.read'), false);
select t.eq('after exit: write RPC refused', left(t.pay60(), 5), '42501');
select t.eq('end is audited', t.cnt60($$select count(*) from audit_logs where action = 'acting.ended' and metadata->>'mode' = 'write'$$), 1::bigint);

-- 7. expiry, demotion, suspended companies ---------------------------------------------------------------------------------------------------------
select t.passes('enter again', format($q$select public.platform_enter_acting(%L, 'second visit')$q$, t.u(101)));
select t.passes('confirm write again', $$select public.platform_confirm_acting_write()$$);
select t.as_admin();
update app_private.acting_sessions set expires_at = now() - interval '1 second', started_at = now() - interval '31 minutes' where user_id = t.u(1);
select t.as_user(t.u(1));
select t.eq('expired: has_permission closed', t.hp60(t.u(101), 'trips.read'), false);
select t.eq('expired: no status', (select count(*) from public.platform_acting_status()), 0::bigint);
select t.eq('expired: cannot confirm write', left(t.err60($$select public.platform_confirm_acting_write()$$), 5), 'P0002');
select t.passes('enter once more', format($q$select public.platform_enter_acting(%L, 'third visit')$q$, t.u(101)));
select t.eq('a fresh session starts in READ again (write is per session)', (select mode from public.platform_acting_status()), 'read');
select t.as_user(t.u(9));
select t.passes('support enters for the demotion check', format($q$select public.platform_enter_acting(%L, 'demotion check')$q$, t.u(101)));
select t.eq('support session is live', t.hp60(t.u(101), 'trips.read'), true);
select t.as_admin();
update platform_users set is_active = false where user_id = t.u(9);
select t.as_user(t.u(9));
select t.eq('demoted staff: session is dead at once', t.hp60(t.u(101), 'trips.read'), false);
select t.as_admin();
update platform_users set is_active = true where user_id = t.u(9);
select t.as_user(t.u(9));
select t.passes('support exits', $$select public.platform_exit_acting()$$);
select t.as_admin();
update companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_user(t.u(1));
select t.eq('suspended company: still readable while acting', t.hp60(t.u(101), 'trips.read'), true);
select t.eq('suspended company: caller_company reads work', t.cc60('drivers.read'), t.u(101));
select t.eq('suspended company: write cannot be confirmed', left(t.err60($$select public.platform_confirm_acting_write()$$), 5), '23514');
select t.eq('suspended company: write key refused', t.hp60(t.u(101), 'trips.write'), false);
select t.as_admin();
update companies set status = 'active', suspended_at = null where id = t.u(101);
update companies set deleted_at = now() where id = t.u(102);
select t.as_user(t.u(1));
select t.eq('deleted company cannot be entered', left(t.err60(format($q$select public.platform_enter_acting(%L, 'deleted one')$q$, t.u(102))), 5), 'P0002');
select t.as_admin();
update companies set deleted_at = null where id = t.u(102);

-- 8. no client reach into the table; rate limit ---------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.eq('the session table is not readable by clients', left(t.err60($$select * from app_private.acting_sessions$$), 5), '42501');
select t.eq('the helpers are not callable by clients', left(t.err60($$select app_private.acting_allows(gen_random_uuid(), 'trips.read')$$), 5), '42501');
select t.passes('exit cleanly', $$select public.platform_exit_acting()$$);
select t.as_admin();
select t.eq('nothing is left over', t.cnt60($$select count(*) from app_private.acting_sessions$$), 0::bigint);
