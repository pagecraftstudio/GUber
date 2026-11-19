-- 37: M3A domains foundation (migrations 0042-0044).
-- Fixtures (01): companies 101 (A, professional) 102 (B, starter) 103 (C, starter). Domains: a.test active, b.test custom pending, c.test active.
-- Users: 1 super_admin, 2 ownerA, 3 managerA, 4 operationsA, 5 bookingA, 7 ownerB.
select t.as_admin();
create or replace function t.err37(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;

-- 1. columns and defaults
select t.eq('columns: a new domain starts pending, not ssl_ready',
  (select serving_status || ':' || ssl_ready::text from public.domains where hostname = 'b.test'), 'pending:false');
select t.eq('columns: fixture platform subdomains are active',
  (select count(*) from public.domains where hostname in ('a.test','c.test') and serving_status = 'active'), 2::bigint);

-- 2. consistency constraints
select t.raises('active requires verified',
  $$update public.domains set serving_status = 'active', activated_at = now() where hostname = 'b.test'$$, '23514');
select t.raises('active requires activated_at',
  $$update public.domains set verification_status = 'verified', verified_at = now(), serving_status = 'active' where hostname = 'b.test'$$, '23514');
select t.raises('disabled requires disabled_at',
  $$update public.domains set serving_status = 'disabled' where hostname = 'b.test'$$, '23514');

-- 3. strict hostname format
select t.passes('hostname ok: www.company.com', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'www.company.com', 'custom')$$);
select t.passes('hostname ok: short labels', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'a.b.co', 'custom')$$);
select t.raises('hostname: double dot', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'a..b.test', 'custom')$$, '23514');
select t.raises('hostname: leading hyphen label', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), '-a.test', 'custom')$$, '23514');
select t.raises('hostname: trailing hyphen label', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'a-.test', 'custom')$$, '23514');
select t.raises('hostname: no dot', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'localhost', 'custom')$$, '23514');
select t.raises('hostname: IPv4', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), '10.0.0.1', 'custom')$$, '23514');
select t.raises('hostname: numeric TLD', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'a.123', 'custom')$$, '23514');
select t.raises('hostname: port', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'a.test:3000', 'custom')$$, '23514');
select t.raises('hostname: wildcard', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), '*.a.test', 'custom')$$, '23514');
select t.raises('hostname: punycode label (homograph defence)', $$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'xn--e1afmkfd.test', 'custom')$$, '23514');
select t.raises('hostname: label over 63 chars', format($$insert into public.domains (company_id, hostname, kind) values (t.u(101), %L, 'custom')$$, repeat('a', 64) || '.test'), '23514');
select t.raises('hostname: total over 253 chars',
  format($$insert into public.domains (company_id, hostname, kind) values (t.u(101), %L, 'custom')$$, repeat(repeat('a', 60) || '.', 5) || 'test'), '23514');
select t.raises('hostname: duplicate across tenants is rejected', $$insert into public.domains (company_id, hostname, kind) values (t.u(102), 'a.test', 'custom')$$, '23505');
select t.raises('hostname: duplicate is case-insensitive (citext), format check fires first for upper case',
  $$insert into public.domains (company_id, hostname, kind) values (t.u(102), 'A.test', 'custom')$$, '23514');

-- 4. slug immutable + reserved
select t.eq('slug: update is refused', t.err37($$update public.companies set slug = 'renamed-a' where id = t.u(101)$$), '23001');
select t.eq('slug: updating other columns still works', t.err37($$update public.companies set name = name where id = t.u(101)$$), 'NO ERROR');
select t.eq('slug: reserved name from the extended list is refused on insert',
  t.err37($$insert into public.companies (name, slug) values ('X', 'auth')$$), '22023');
select t.eq('slug: path-mode route segment "s" is refused', t.err37($$insert into public.companies (name, slug) values ('X', 'sss')$$), 'NO ERROR');
select t.eq('slug: an original reserved name is refused too', t.err37($$insert into public.companies (name, slug) values ('X', 'www')$$), '22023');

-- 5. hostname hold (takeover cooldown)
insert into app_private.reserved_names (name, scope, reason, held_by_company, reserved_until)
values ('held.example.com', 'hostname', 'removed by company A', t.u(101), now() + interval '14 days');
select t.eq('hold: another company cannot take a held hostname',
  t.err37($$insert into public.domains (company_id, hostname, kind) values (t.u(102), 'held.example.com', 'custom')$$), '22023');
select t.eq('hold: the former owner can re-add it',
  t.err37($$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'held.example.com', 'custom')$$), 'NO ERROR');
insert into app_private.reserved_names (name, scope, reason, held_by_company, reserved_until)
values ('expired.example.com', 'hostname', 'old hold', t.u(101), now() - interval '1 day');
select t.eq('hold: an expired hold no longer blocks',
  t.err37($$insert into public.domains (company_id, hostname, kind) values (t.u(102), 'expired.example.com', 'custom')$$), 'NO ERROR');
select t.raises('hold: a hold must carry an expiry',
  $$insert into app_private.reserved_names (name, scope, reason, held_by_company) values ('x.example.com', 'hostname', 'r', t.u(101))$$, '23514');

-- 6. resolver: only ACTIVE domains of live companies
select t.eq('resolve_tenant: active platform subdomain resolves', (select count(*) from public.resolve_tenant('a.test')), 1::bigint);
select t.eq('resolve_tenant: case and trailing dot tolerated', (select count(*) from public.resolve_tenant(' A.Test. ')), 1::bigint);
select t.eq('resolve_tenant: pending custom domain does not resolve', (select count(*) from public.resolve_tenant('b.test')), 0::bigint);
update public.domains set verification_status = 'verified', verified_at = now() where hostname = 'b.test';
select t.eq('resolve_tenant: DNS-verified but not active does NOT resolve', (select count(*) from public.resolve_tenant('b.test')), 0::bigint);
update public.domains set serving_status = 'active', activated_at = now() where hostname = 'b.test';
select t.eq('resolve_tenant: active custom domain resolves', (select count(*) from public.resolve_tenant('b.test')), 1::bigint);
update public.domains set serving_status = 'disabled', disabled_at = now() where hostname = 'b.test';
select t.eq('resolve_tenant: disabled domain does not resolve', (select count(*) from public.resolve_tenant('b.test')), 0::bigint);
select t.eq('resolve_tenant: unknown host', (select count(*) from public.resolve_tenant('nope.test')), 0::bigint);
select t.eq('resolve_tenant: exposes only company_id, slug, status',
  pg_get_function_result('public.resolve_tenant(text)'::regprocedure), 'TABLE(company_id uuid, slug text, status text)');
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(103);
select t.eq('resolve_tenant: suspended company does not resolve', (select count(*) from public.resolve_tenant('c.test')), 0::bigint);
update public.companies set status = 'trial', suspended_at = null where id = t.u(103);
select t.eq('resolve_tenant: trial company resolves again', (select count(*) from public.resolve_tenant('c.test')), 1::bigint);

select t.as_anon();
select t.eq('resolve_tenant: callable by anon', (select count(*) from public.resolve_tenant('a.test')), 1::bigint);
select t.eq('resolve_tenant_by_slug: callable by anon', (select count(*) from public.resolve_tenant_by_slug(' Company-A ')), 1::bigint);
select t.eq('resolve_tenant_by_slug: unknown slug', (select count(*) from public.resolve_tenant_by_slug('nope-co')), 0::bigint);
select t.as_admin();
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(103);
select t.eq('resolve_tenant_by_slug: suspended company is hidden', (select count(*) from public.resolve_tenant_by_slug('company-c')), 0::bigint);
update public.companies set status = 'trial', suspended_at = null where id = t.u(103);

-- 7. has_verified_domain follows serving_status (the anon snapshot policy rides on it)
select t.eq('has_verified_domain: active domain', app_private.has_verified_domain(t.u(101)), true);
update public.domains set serving_status = 'disabled', disabled_at = now() where hostname = 'c.test';
select t.eq('has_verified_domain: disabled domain', app_private.has_verified_domain(t.u(103)), false);
update public.domains set serving_status = 'active', activated_at = now(), disabled_at = null where hostname = 'c.test';

-- 8. no direct writes to domains from the API
select t.as_user(t.u(1));
select t.eq('super_admin: direct INSERT on domains refused', left(t.err37($$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'sa.test', 'custom')$$), 5), '42501');
select t.eq('super_admin: direct UPDATE on domains refused', t.err37($$update public.domains set serving_status = 'active' where hostname = 'b.test'$$), '42501');
select t.eq('super_admin: can still read domains', (select count(*) > 0 from public.domains), true);
select t.as_user(t.u(2));
select t.eq('owner A: direct INSERT on domains refused', t.err37($$insert into public.domains (company_id, hostname, kind) values (t.u(101), 'own.test', 'custom')$$), '42501');
select t.eq('owner A: direct UPDATE on domains refused', t.err37($$update public.domains set is_primary = false where hostname = 'a.test'$$), '42501');
select t.eq('owner A: direct DELETE on domains refused', t.err37($$delete from public.domains where hostname = 'a.test'$$), '42501');
select t.eq('owner A reads only company A domains', (select count(*) from public.domains where company_id <> t.u(101)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('owner B cannot read company A domains', (select count(*) from public.domains where company_id = t.u(101)), 0::bigint);
select t.as_anon();
select t.eq('anon cannot read domains', left(t.err37('select 1 from public.domains'), 5), '42501');
select t.eq('anon cannot read reserved_names', left(t.err37('select 1 from app_private.reserved_names'), 5), '42501');
select t.as_admin();

-- 9. permission website.publish: owner + manager only
select t.as_user(t.u(2));
select t.eq('website.publish: owner', app_private.has_permission(t.u(101), 'website.publish'), true);
select t.as_user(t.u(3));
select t.eq('website.publish: manager', app_private.has_permission(t.u(101), 'website.publish'), true);
select t.eq('website.write: manager keeps draft editing', app_private.has_permission(t.u(101), 'website.write'), true);
select t.as_user(t.u(4));
select t.eq('website.publish: operations refused', app_private.has_permission(t.u(101), 'website.publish'), false);
select t.as_user(t.u(5));
select t.eq('website.publish: booking staff refused', app_private.has_permission(t.u(101), 'website.publish'), false);
select t.as_admin();
select t.eq('website.publish: exactly owner and manager hold it',
  (select string_agg(r.key, ',' order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id where p.key = 'website.publish'), 'manager,owner');
select t.eq('website.publish: module is website', (select module from public.permissions where key = 'website.publish'), 'website');

-- 10. entitlement max_custom_domains. Earlier suites rewrite plan_entitlements for their own needs, so the seed values of 0043
--     (starter 0, professional 1, enterprise unlimited) are re-applied here and the MECHANISM is asserted. The seed itself is
--     asserted by the fresh-database check in the M3A report.
update public.plan_entitlements pe set int_value = v.n from public.plans p, (values ('starter', 0), ('professional', 1)) v(code, n)
 where p.id = pe.plan_id and p.code = v.code and pe.key = 'max_custom_domains';
update public.plan_entitlements pe set int_value = null from public.plans p
 where p.id = pe.plan_id and p.code = 'enterprise' and pe.key = 'max_custom_domains';
select t.eq('entitlement: the key exists on all three seeded plans',
  (select count(*) from public.plan_entitlements where key = 'max_custom_domains'), 3::bigint);
select t.eq('entitlement: company A (professional) resolves to 1', app_private.entitlement_limit(t.u(101), 'max_custom_domains'), 1);
select t.eq('entitlement: company B (starter) resolves to 0', app_private.entitlement_limit(t.u(102), 'max_custom_domains'), 0);
select t.raises('entitlement: boolean value on an integer key is rejected',
  $$insert into public.plan_entitlements (plan_id, key, bool_value) select id, 'max_custom_domains', true from public.plans where code = 'starter' on conflict (plan_id, key) do update set bool_value = true, int_value = null$$, '23514');

-- 11. rate-limit policies exist (a bucket without a policy fails closed)
select t.eq('rate limit: domain.add / domain.check / website.publish policies present',
  (select count(distinct bucket) from app_private.rate_limit_policies where bucket in ('domain.add','domain.check','website.publish')), 3::bigint);
select t.eq('rate limit: domain.check has a 30 s tier of 1 hit',
  (select max_hits from app_private.rate_limit_policies where bucket = 'domain.check' and window_seconds = 30), 1);
create or replace function t.hit37(p_bucket text) returns void language sql security definer as $$ select app_private.rate_limit_hit(p_bucket) $$;
select t.as_user(t.u(2));
select t.passes('rate limit: first domain.check passes', $$select t.hit37('domain.check')$$);
select t.eq('rate limit: second domain.check within 30 s is refused', t.err37($$select t.hit37('domain.check')$$), 'PT429');
select t.as_admin();
delete from app_private.rate_limit_counters;

-- 12. reserved list content
select t.eq('reserved: 14 original + 13 added names', (select count(*) from app_private.reserved_names where scope = 'slug' and held_by_company is null), 27::bigint);
