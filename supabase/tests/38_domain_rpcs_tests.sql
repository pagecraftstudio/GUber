-- 38: M3B domain RPCs (migration 0045).
-- Fixtures (01): companies 101 (A, professional) 102 (B, starter) 103 (C, starter). Users: 1 super_admin, 9 support, 2 ownerA, 3 managerA,
-- 4 operationsA, 5 bookingA, 6 driverA, 7 ownerB. Domains: a.test (A, active, primary), b.test (B, custom pending), c.test (C, active).
select t.as_admin();
create or replace function t.err38(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.dom38(p_host text) returns uuid language sql security definer as $$ select id from public.domains where hostname = p_host $$;
create or replace function t.audit38(p_action text, p_company uuid) returns bigint language sql security definer as
  $$ select count(*) from public.audit_logs where action = p_action and company_id = p_company $$;

-- known starting state: no custom domains, no holds (earlier suites share this database)
delete from public.domains where kind = 'custom';
delete from app_private.reserved_names where scope = 'hostname';

-- the seeded limits (earlier suites rewrite plan_entitlements): professional 1, starter 0
update public.plan_entitlements pe set int_value = v.n from public.plans p, (values ('starter', 0), ('professional', 1)) v(code, n)
 where p.id = pe.plan_id and p.code = v.code and pe.key = 'max_custom_domains';
delete from app_private.rate_limit_counters;

-- 1. add: owner only, derived company, token, audit
select t.as_user(t.u(2));
select t.eq('add: owner A adds a domain', (select public.add_custom_domain(' WWW.Shop-A.com. ') is not null), true);
select t.as_admin();
select t.eq('add: normalized, company derived from the caller, custom + pending',
  (select company_id = t.u(101) and kind = 'custom' and serving_status = 'pending' and verification_status = 'pending' and not is_primary and created_by = t.u(2)
     from public.domains where hostname = 'www.shop-a.com'), true);
select t.eq('add: token is 64 hex chars', (select verification_token ~ '^[0-9a-f]{64}$' from public.domains where hostname = 'www.shop-a.com'), true);
select t.eq('add: audited', t.audit38('domain.add', t.u(101)), 1::bigint);

-- 2. permission matrix (domains.write is owner only)
select t.as_user(t.u(3)); select t.eq('add: manager refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');
select t.as_user(t.u(4)); select t.eq('add: operations refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');
select t.as_user(t.u(5)); select t.eq('add: booking refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');
select t.as_user(t.u(6)); select t.eq('add: driver refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');
select t.as_user(t.u(1)); select t.eq('add: platform staff without a membership refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');
select t.as_anon();       select t.eq('add: anon refused', left(t.err38($$select public.add_custom_domain('m.shop-a.com')$$), 5), '42501');

-- 3. plan limit (professional = 1)
select t.as_user(t.u(2));
select t.eq('limit: second custom domain on a 1-domain plan refused', left(t.err38($$select public.add_custom_domain('second.shop-a.com')$$), 5), '53400');
select t.as_user(t.u(7));
select t.eq('limit: starter plan (0) refused', left(t.err38($$select public.add_custom_domain('www.shop-b.com')$$), 5), '53400');
select t.as_admin();
update public.plan_entitlements pe set int_value = null from public.plans p where p.id = pe.plan_id and p.code = 'professional' and pe.key = 'max_custom_domains';
select t.as_user(t.u(2));
select t.eq('limit: NULL = unlimited', left(t.err38($$select public.add_custom_domain('second.shop-a.com')$$), 8), 'NO ERROR');
select t.as_admin();
update public.plan_entitlements pe set int_value = 1 from public.plans p where p.id = pe.plan_id and p.code = 'professional' and pe.key = 'max_custom_domains';
delete from public.domains where hostname = 'second.shop-a.com';

-- 4. validation + generic error for a taken hostname
select t.as_admin();
update public.plan_entitlements pe set int_value = 5 from public.plans p where p.id = pe.plan_id and p.code = 'starter' and pe.key = 'max_custom_domains';
select t.as_user(t.u(7));
select t.eq('hostname: taken by another tenant -> generic error', t.err38($$select public.add_custom_domain('www.shop-a.com')$$), '23505|hostname unavailable');
select t.eq('hostname: platform subdomain of another tenant -> same generic error', t.err38($$select public.add_custom_domain('a.test')$$), '23505|hostname unavailable');
select t.eq('hostname: invalid (no dot)', left(t.err38($$select public.add_custom_domain('localhost')$$), 5), '22023');
select t.eq('hostname: invalid (IPv4)', left(t.err38($$select public.add_custom_domain('10.0.0.1')$$), 5), '22023');
select t.eq('hostname: invalid (empty)', left(t.err38($$select public.add_custom_domain('  ')$$), 5), '22023');
select t.eq('hostname: invalid (null)', left(t.err38($$select public.add_custom_domain(null)$$), 5), '22023');
select t.eq('hostname: invalid (punycode)', left(t.err38($$select public.add_custom_domain('xn--e1afmkfd.com')$$), 5), '22023');
select t.eq('hostname: invalid (port)', left(t.err38($$select public.add_custom_domain('www.x.com:8080')$$), 5), '22023');
select t.eq('hostname: B adds its own', left(t.err38($$select public.add_custom_domain('www.shop-b.com')$$), 8), 'NO ERROR');

-- 5. isolation of remove / primary / check
select t.as_user(t.u(7));
select t.eq('remove: B cannot remove A''s domain', left(t.err38(format($$select public.remove_custom_domain(%L)$$, t.dom38('www.shop-a.com'))), 5), 'P0002');
select t.eq('primary: B cannot set A''s domain primary', left(t.err38(format($$select public.set_primary_domain(%L)$$, t.dom38('a.test'))), 5), 'P0002');
select t.eq('check: B cannot start a DNS check on A''s domain', left(t.err38(format($$select * from public.begin_domain_check(%L)$$, t.dom38('www.shop-a.com'))), 5), 'P0002');
select t.as_user(t.u(2));
select t.eq('remove: the platform subdomain is not removable', left(t.err38(format($$select public.remove_custom_domain(%L)$$, t.dom38('a.test'))), 5), 'P0002');
select t.as_user(t.u(3));
select t.eq('remove: manager refused', left(t.err38(format($$select public.remove_custom_domain(%L)$$, t.dom38('www.shop-a.com'))), 5), '42501');
select t.eq('check: manager refused', left(t.err38(format($$select * from public.begin_domain_check(%L)$$, t.dom38('www.shop-a.com'))), 5), '42501');

-- 6. owner DNS check: authorizes, rate limits, persists nothing
select t.as_admin(); delete from app_private.rate_limit_counters;
select t.as_user(t.u(2));
select t.eq('check: owner gets hostname + token + kind', (select hostname || ':' || kind from public.begin_domain_check(t.dom38('www.shop-a.com'))), 'www.shop-a.com:custom');
select t.eq('check: second check within 30 s is rate limited', left(t.err38(format($$select * from public.begin_domain_check(%L)$$, t.dom38('www.shop-a.com'))), 5), 'PT429');
select t.as_admin();
select t.eq('check: nothing persisted', (select last_checked_at is null and verification_status = 'pending' from public.domains where hostname = 'www.shop-a.com'), true);

-- 7. DNS verification is staff-only (a tenant can never self-verify)
select t.as_user(t.u(2));
select t.eq('verify: owner cannot record a check', left(t.err38(format($$select public.admin_record_domain_check(%L, true)$$, t.dom38('www.shop-a.com'))), 5), '42501');
select t.eq('activate: owner cannot activate', left(t.err38(format($$select public.admin_activate_domain(%L)$$, t.dom38('www.shop-a.com'))), 5), '42501');
select t.eq('disable: owner cannot disable via the admin RPC', left(t.err38(format($$select public.admin_disable_domain(%L, 'x')$$, t.dom38('www.shop-a.com'))), 5), '42501');
select t.as_user(t.u(9));
select t.eq('verify: support role refused (super_admin only)', left(t.err38(format($$select public.admin_record_domain_check(%L, true)$$, t.dom38('www.shop-a.com'))), 5), '42501');
select t.as_anon();
select t.eq('verify: anon refused', left(t.err38(format($$select public.admin_record_domain_check(%L, true)$$, t.dom38('www.shop-a.com'))), 5), '42501');

select t.as_user(t.u(1));
select t.eq('activate: refused while not verified', t.err38(format($$select public.admin_activate_domain(%L)$$, t.dom38('www.shop-a.com'))), '23514|domain is not verified');
select t.passes('verify: failed check recorded', format($$select public.admin_record_domain_check(%L, false, 'TXT record not found')$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('verify: failure -> failed + message', (select verification_status || ':' || last_error from public.domains where hostname = 'www.shop-a.com'), 'failed:TXT record not found');
select t.as_user(t.u(1));
select t.passes('verify: successful check recorded', format($$select public.admin_record_domain_check(%L, true)$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('verify: success -> verified, error cleared', (select verification_status = 'verified' and verified_at is not null and last_error is null from public.domains where hostname = 'www.shop-a.com'), true);
select t.eq('resolve: verified but not active is still not served', (select count(*) from public.resolve_tenant('www.shop-a.com')), 0::bigint);
select t.as_user(t.u(1));
select t.passes('verify: a later failure does not un-verify', format($$select public.admin_record_domain_check(%L, false, 'flaky resolver')$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('verify: stays verified, error noted', (select verification_status || ':' || last_error from public.domains where hostname = 'www.shop-a.com'), 'verified:flaky resolver');

-- 8. activate -> served; primary
select t.as_user(t.u(2));
select t.eq('primary: refused while pending (other domain)', left(t.err38(format($$select public.set_primary_domain(%L)$$, t.dom38('www.shop-a.com'))), 5), '23514');
select t.as_user(t.u(1));
select t.passes('activate: super_admin activates', format($$select public.admin_activate_domain(%L)$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('activate: active + ssl_ready + timestamp', (select serving_status = 'active' and ssl_ready and activated_at is not null from public.domains where hostname = 'www.shop-a.com'), true);
select t.eq('resolve: the activated custom domain is served', (select slug from public.resolve_tenant('www.shop-a.com')), 'company-a');
select t.eq('audit: verify (2) + activate (1) recorded for A', t.audit38('domain.verify', t.u(101)) || ':' || t.audit38('domain.activate', t.u(101)), '3:1');
select t.as_user(t.u(2));
select t.passes('primary: owner sets the active custom domain primary', format($$select public.set_primary_domain(%L)$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('primary: exactly one primary, the new one', (select string_agg(hostname::text, ',') from public.domains where company_id = t.u(101) and is_primary), 'www.shop-a.com');
select t.as_user(t.u(2));
select t.passes('primary: setting the same one again is a no-op', format($$select public.set_primary_domain(%L)$$, t.dom38('www.shop-a.com')));
select t.passes('primary: back to the platform subdomain', format($$select public.set_primary_domain(%L)$$, t.dom38('a.test')));
select t.as_admin();
select t.eq('primary: audited', t.audit38('domain.set_primary', t.u(101)), 2::bigint);

-- 9. staff disable
select t.as_user(t.u(1));
select t.eq('disable: reason required', left(t.err38(format($$select public.admin_disable_domain(%L, '  ')$$, t.dom38('www.shop-a.com'))), 5), '22023');
select t.passes('disable: super_admin disables', format($$select public.admin_disable_domain(%L, 'abuse report')$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('disable: stops serving at once', (select count(*) from public.resolve_tenant('www.shop-a.com')), 0::bigint);
select t.eq('disable: state', (select serving_status = 'disabled' and disabled_at is not null and not is_primary and not ssl_ready and last_error = 'abuse report' from public.domains where hostname = 'www.shop-a.com'), true);
select t.eq('disable: audited', t.audit38('domain.disable', t.u(101)), 1::bigint);
select t.as_user(t.u(1));
select t.eq('verify: a disabled domain cannot be re-verified', t.err38(format($$select public.admin_record_domain_check(%L, true)$$, t.dom38('www.shop-a.com'))), '23514|domain is disabled');

-- 10. re-add by the former owner (fresh token) and takeover cooldown
select t.as_admin();
create temp table tok38 as select verification_token from public.domains where hostname = 'www.shop-a.com';
select t.as_user(t.u(2));
select t.eq('re-add: the former owner re-adds the same hostname', (select public.add_custom_domain('www.shop-a.com') = t.dom38('www.shop-a.com')), true);
select t.as_admin();
select t.eq('re-add: pending again, new token, nothing carried over',
  (select serving_status = 'pending' and verification_status = 'pending' and verified_at is null and activated_at is null and not ssl_ready
          and verification_token <> (select verification_token from tok38) from public.domains where hostname = 'www.shop-a.com'), true);
select t.as_user(t.u(2));
select t.passes('remove: owner removes it', format($$select public.remove_custom_domain(%L)$$, t.dom38('www.shop-a.com')));
select t.passes('remove: removing twice is a no-op', format($$select public.remove_custom_domain(%L)$$, t.dom38('www.shop-a.com')));
select t.as_admin();
select t.eq('remove: audited once', t.audit38('domain.remove', t.u(101)), 1::bigint);
select t.as_user(t.u(7));
select t.eq('cooldown: another company cannot take it yet', t.err38($$select public.add_custom_domain('www.shop-a.com')$$), '23505|hostname unavailable');
select t.as_admin();
update public.domains set disabled_at = now() - interval '15 days' where hostname = 'www.shop-a.com';
delete from public.domains where hostname = 'www.shop-b.com';
select t.as_user(t.u(7));
select t.eq('cooldown: after 14 days another company can take it', left(t.err38($$select public.add_custom_domain('www.shop-a.com')$$), 8), 'NO ERROR');
select t.as_admin();
select t.eq('cooldown: it now belongs to B, pending', (select company_id = t.u(102) and serving_status = 'pending' from public.domains where hostname = 'www.shop-a.com'), true);

-- 11. a verified-but-disabled hostname of another company can never be served by the new owner until staff verify it again
select t.eq('takeover: the new owner starts unverified', (select verification_status from public.domains where hostname = 'www.shop-a.com'), 'pending');

-- 12. company A cannot see B's domains and API rows carry no write path
select t.as_user(t.u(2));
select t.eq('read: A sees no domain of B', (select count(*) from public.domains where company_id = t.u(102)), 0::bigint);
select t.as_admin();
delete from app_private.rate_limit_counters;
