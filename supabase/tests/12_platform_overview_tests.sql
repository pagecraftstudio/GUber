-- 12: Phase 7.2 admin_platform_overview (0016). Requires 01 fixtures. All state changes are restored at the end.
create or replace function t.as_trusted(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); end $$;
create or replace function t.ov() returns jsonb language sql as $$ select public.admin_platform_overview() $$;

-- ======================= A. WHO MAY CALL =======================
select t.as_user(t.u(1));  select t.passes('A: super_admin can call', 'select public.admin_platform_overview()');
select t.as_user(t.u(9));  select t.passes('A: support can call', 'select public.admin_platform_overview()');
select t.as_user(t.u(10)); select t.passes('A: billing can call', 'select public.admin_platform_overview()');
select t.as_user(t.u(2));  select t.raises('A: owner A refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_user(t.u(3));  select t.raises('A: manager A refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_user(t.u(7));  select t.raises('A: owner B refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_user(t.u(6));  select t.raises('A: driver A refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_user('99999999-9999-4999-8999-999999999999'::uuid);
select t.raises('A: authenticated user with no profile/membership refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_anon(); select t.raises('A: anon refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_admin();
update platform_users set is_active = false where user_id = t.u(9);
select t.as_user(t.u(9));
select t.raises('A: deactivated platform user refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_admin();
update platform_users set is_active = true where user_id = t.u(9);
update profiles set is_active = false where id = t.u(10);
select t.as_user(t.u(10));
select t.raises('A: platform user with deactivated profile refused (42501)', 'select public.admin_platform_overview()', '42501');
select t.as_admin();
update profiles set is_active = true where id = t.u(10);

-- ======================= B. FUNCTION HARDENING =======================
select t.eq('B: takes no arguments (no client-supplied company id or role)',
  (select pronargs from pg_proc where oid = 'public.admin_platform_overview()'::regprocedure), 0::smallint);
select t.eq('B: security definer with empty search_path',
  (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.admin_platform_overview()'::regprocedure), true);
select t.eq('B: anon has no EXECUTE', has_function_privilege('anon', 'public.admin_platform_overview()', 'execute'), false);
select t.eq('B: authenticated has EXECUTE', has_function_privilege('authenticated', 'public.admin_platform_overview()', 'execute'), true);

-- ======================= C. NUMBERS MATCH THE TABLES =======================
select t.as_user(t.u(1));
create temp table t12_ov as select public.admin_platform_overview() as j;
grant select on t12_ov to authenticated;
select t.as_admin();
select t.eq('C: companies.total', (select (j->'companies'->>'total')::bigint from t12_ov), (select count(*) from companies where deleted_at is null));
select t.eq('C: companies.active', (select (j->'companies'->>'active')::bigint from t12_ov), (select count(*) from companies where deleted_at is null and status = 'active'));
select t.eq('C: companies.suspended', (select (j->'companies'->>'suspended')::bigint from t12_ov), (select count(*) from companies where deleted_at is null and status = 'suspended'));
select t.eq('C: companies.trial', (select (j->'companies'->>'trial')::bigint from t12_ov), (select count(*) from companies where deleted_at is null and status = 'trial'));
select t.eq('C: companies.cancelled', (select (j->'companies'->>'cancelled')::bigint from t12_ov), (select count(*) from companies where deleted_at is null and status = 'cancelled'));
select t.eq('C: companies buckets add up to total',
  (select (j->'companies'->>'trial')::bigint + (j->'companies'->>'active')::bigint + (j->'companies'->>'suspended')::bigint + (j->'companies'->>'cancelled')::bigint from t12_ov),
  (select (j->'companies'->>'total')::bigint from t12_ov));
select t.eq('C: subscriptions.active', (select (j->'subscriptions'->>'active')::bigint from t12_ov),
  (select count(*) from subscriptions where status = 'active' and current_period_end > now()));
select t.eq('C: usage.trips_total', (select (j->'usage'->>'trips_total')::bigint from t12_ov), (select count(*) from trips));
select t.eq('C: usage.bookings_total', (select (j->'usage'->>'bookings_total')::bigint from t12_ov), (select count(*) from bookings));
select t.eq('C: usage.customers_total', (select (j->'usage'->>'customers_total')::bigint from t12_ov), (select count(*) from customers));
select t.eq('C: payload has exactly the documented top-level keys',
  (select array(select jsonb_object_keys(j) order by 1) from t12_ov),
  array['companies','generated_at','recent_activity','subscriptions','usage']);

-- ======================= D. SUBSCRIPTION HEALTH =======================
create temp table t12_orig as select id, status, current_period_start, current_period_end from subscriptions where company_id = t.u(101);
select t.as_trusted(t.u(1));
select t.eq('D: baseline stale_live', (select (public.admin_platform_overview()->'subscriptions'->>'stale_live')::bigint), 0::bigint);
-- A's subscription ends tomorrow: counted as expiring, still live
update subscriptions set current_period_start = now() - interval '5 days', current_period_end = now() + interval '1 day' where company_id = t.u(101);
select t.as_trusted(t.u(1));
select t.eq('D: period ending tomorrow counts in expiring_14d', (select (t.ov()->'subscriptions'->>'expiring_14d')::bigint >= 1), true);
-- A's subscription ended yesterday but status still 'active': stale_live, no longer live, company has no live sub
select t.as_admin();
update subscriptions set current_period_start = now() - interval '10 days', current_period_end = now() - interval '1 day' where company_id = t.u(101);
select t.as_trusted(t.u(1));
select t.eq('D: stale status with ended period counts in stale_live', (t.ov()->'subscriptions'->>'stale_live')::bigint, 1::bigint);
select t.eq('D: stale subscription is not counted as active',
  (t.ov()->'subscriptions'->>'active')::bigint, (select count(*) from subscriptions where status = 'active' and current_period_end > now()));
select t.eq('D: active company without live subscription is flagged', (t.ov()->'subscriptions'->>'companies_without_live')::bigint, 1::bigint);
select t.as_admin();
update subscriptions s set current_period_start = o.current_period_start, current_period_end = o.current_period_end, status = o.status
  from t12_orig o where s.id = o.id;
select t.as_trusted(t.u(1));
select t.eq('D: restored: no stale rows', (t.ov()->'subscriptions'->>'stale_live')::bigint, 0::bigint);
select t.eq('D: restored: no company flagged without live subscription', (t.ov()->'subscriptions'->>'companies_without_live')::bigint, 0::bigint);

-- ======================= E. RECENT ACTIVITY =======================
select t.as_trusted(t.u(1));
select app_private.audit_platform(t.u(101), 'phase72.test', 'company', t.u(101), '{"secret":"before"}'::jsonb, '{"secret":"after"}'::jsonb);
select t.eq('E: newest audit row is first', (t.ov()->'recent_activity'->0->>'action'), 'phase72.test');
select t.eq('E: row carries company name', (t.ov()->'recent_activity'->0->>'company_name'), 'Company A');
select t.eq('E: audit metadata (before/after) is NOT exposed',
  (select count(*) from jsonb_array_elements(t.ov()->'recent_activity') e where e ? 'metadata'), 0::bigint);
select t.eq('E: at most 10 rows', jsonb_array_length(t.ov()->'recent_activity') <= 10, true);

-- ======================= F. READ-ONLY =======================
select t.as_admin();
create temp table t12_audit as select count(*) as n from audit_logs;
select t.as_user(t.u(1)); select t.ov(); select t.ov();
select t.as_admin();
select t.eq('F: calling the overview writes no audit rows', (select count(*) from audit_logs), (select n from t12_audit));

-- ======================= G. NO NEW WRITE PATH =======================
select t.as_user(t.u(1));
select t.raises('G: super_admin still cannot update subscriptions directly', $$update subscriptions set status = 'cancelled'$$, '42501');
select t.raises('G: super_admin still cannot update companies directly', $$update companies set name = 'x'$$, '42501');
select t.as_admin();
