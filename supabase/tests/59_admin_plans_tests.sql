-- 59: P8 admin plans (migration 0064). Needs 01 fixtures (user 1 platform super_admin, user 9 platform support, user 2 owner of company A).
-- Creates ONE throw-away plan and ONE throw-away company; audit rows are append-only and stay by design.
select t.as_admin();
delete from t.results where name like 'p8: %';
create or replace function t.e59(who uuid, stmt text) returns text language plpgsql as $$
begin
  if who is null then perform t.as_anon(); else perform t.as_user(who); end if;
  begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate || '|' || sqlerrm; end;
end $$;
create or replace function t.q59(stmt text) returns text language plpgsql security definer as $$ declare r text; begin execute stmt into r; return r; end $$;
create or replace function t.audits59(p_action text) returns bigint language sql as $$ select count(*) from public.audit_logs where action = p_action $$;

-- ======================= A. WHO MAY CALL WHAT =======================
select t.eq('p8: anon cannot read the overview', t.e59(null, $$select public.admin_plan_overview()$$) like '42501%', true);
select t.eq('p8: a company owner cannot read the overview', t.e59(t.u(2), $$select public.admin_plan_overview()$$) like '42501%', true);
select t.eq('p8: support can read the overview', t.e59(t.u(9), $$select public.admin_plan_overview()$$), 'NO ERROR');
select t.eq('p8: support cannot create a plan', t.e59(t.u(9), $$select public.admin_create_plan('p59_x','X',null,1,null,'EGP',0,false,10)$$) like '42501%', true);
select t.eq('p8: owner cannot edit entitlements', t.e59(t.u(2), format($$select public.admin_set_plan_entitlement(%L, 'max_buses', 1)$$, (select id from public.plans where code = 'starter'))) like '42501%', true);
select t.eq('p8: anon has no EXECUTE on any admin plan RPC',
  (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_plan_overview','admin_create_plan','admin_update_plan','admin_set_plan_active','admin_set_plan_entitlement','admin_create_entitlement_definition')), false);
select t.eq('p8: direct table write is still refused for a platform user (0015)', t.e59(t.u(1), $$update public.plans set price_monthly = 1 where code = 'starter'$$) <> 'NO ERROR', true);

-- ======================= B. CREATE =======================
select t.eq('p8: create a plan', t.e59(t.u(1), $$select public.admin_create_plan('p59_plan', '  P8 Plan ', 'desc', 100, 1000, 'EGP', 7, false, 50)$$), 'NO ERROR');
select t.eq('p8: name trimmed, created active and not public', (select name || '|' || is_active || '|' || is_public from public.plans where code = 'p59_plan'), 'P8 Plan|true|false');
select t.eq('p8: every definition is seeded restrictively (0 / false)',
  (select count(*) from public.plan_entitlements e join public.plans p on p.id = e.plan_id join public.entitlement_definitions d on d.key = e.key
    where p.code = 'p59_plan' and ((d.value_type = 'integer' and e.int_value = 0) or (d.value_type = 'boolean' and e.bool_value = false))),
  (select count(*) from public.entitlement_definitions));
select t.eq('p8: creating wrote an audit row', t.audits59('plan.created') >= 1, true);
select t.eq('p8: duplicate code refused', t.e59(t.u(1), $$select public.admin_create_plan('p59_plan','Again',null,1,null,'EGP',0,false,10)$$) like '23505%', true);
select t.eq('p8: bad code (upper case) refused', t.e59(t.u(1), $$select public.admin_create_plan('Bad Code','X',null,1,null,'EGP',0,false,10)$$) like '22023%', true);
select t.eq('p8: negative price refused', t.e59(t.u(1), $$select public.admin_create_plan('p59_neg','X',null,-1,null,'EGP',0,false,10)$$) like '22023%', true);
select t.eq('p8: bad currency refused', t.e59(t.u(1), $$select public.admin_create_plan('p59_cur','X',null,1,null,'egp',0,false,10)$$) like '22023%', true);
select t.eq('p8: trial over a year refused', t.e59(t.u(1), $$select public.admin_create_plan('p59_trl','X',null,1,null,'EGP',366,false,10)$$) like '22023%', true);
select t.eq('p8: refused creates left nothing behind', (select count(*) from public.plans where code in ('p59_neg','p59_cur','p59_trl')), 0::bigint);

-- ======================= C. PRICE SNAPSHOT =======================
select t.eq('p8: every existing subscription has a price snapshot', (select count(*) from public.subscriptions where price_monthly is null or currency is null), 0::bigint);
select t.as_user(t.u(1));
create temp table t59_c as select (public.admin_create_company('P8 Co', 'p8-co-59', null, null, null, null, null, 'starter', 14, 'p8-co-59@test.dev')->>'company_id')::uuid as id;
grant select on t59_c to authenticated;
select t.as_admin();
select t.eq('p8: a company created on starter snapshots starter''s price (trigger, no RPC change)',
  (select s.price_monthly = p.price_monthly and s.currency = p.currency from public.subscriptions s join public.plans p on p.id = s.plan_id where s.company_id = (select id from t59_c) and s.status in ('trialing','active')), true);
select t.eq('p8: assign the new plan to the throw-away company', t.e59(t.u(1), format($$select public.admin_assign_subscription(%L, 'p59_plan', 'monthly', 'active', 30)$$, (select id from t59_c))), 'NO ERROR');
select t.eq('p8: that subscription snapshotted 100 EGP', (select s.price_monthly::text || s.currency from public.subscriptions s join public.plans p on p.id = s.plan_id where p.code = 'p59_plan'), '100.00EGP');

-- ======================= D. UPDATE =======================
select t.eq('p8: price edit works', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"price_monthly": 250, "price_yearly": null, "name": "P8 Renamed"}')$$, (select id from public.plans where code = 'p59_plan'))), 'NO ERROR');
select t.eq('p8: plan row changed', (select price_monthly::text || '|' || coalesce(price_yearly::text, 'null') || '|' || name from public.plans where code = 'p59_plan'), '250.00|null|P8 Renamed');
select t.eq('p8: ...but the EXISTING subscription keeps 100 (price edits apply to new subscriptions only)', (select s.price_monthly::text from public.subscriptions s join public.plans p on p.id = s.plan_id where p.code = 'p59_plan'), '100.00');
select t.eq('p8: a snapshot cannot be edited afterwards', t.e59(t.u(1), $$update public.subscriptions set price_monthly = 1 where plan_id = (select id from public.plans where code = 'p59_plan')$$) like '%23514%' or t.e59(t.u(1), $$update public.subscriptions set price_monthly = 1 where plan_id = (select id from public.plans where code = 'p59_plan')$$) like '%42501%', true);
select t.eq('p8: the edit audited before and after', (select (metadata->'before'->>'price_monthly') || '>' || (metadata->'after'->>'price_monthly') from public.audit_logs where action = 'plan.updated' order by created_at desc limit 1), '100.00>250.00');
select t.eq('p8: the plan code is immutable', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"code": "hacked"}')$$, (select id from public.plans where code = 'p59_plan'))) like '22023%', true);
select t.eq('p8: unknown field refused', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"id": "x"}')$$, (select id from public.plans where code = 'p59_plan'))) like '22023%', true);
select t.eq('p8: empty patch refused', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{}')$$, (select id from public.plans where code = 'p59_plan'))) like '22023%', true);
select t.eq('p8: non-numeric price refused', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"price_monthly": "abc"}')$$, (select id from public.plans where code = 'p59_plan'))) like '22023%', true);
select t.eq('p8: currency cannot change once a subscription used the plan', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"currency": "USD"}')$$, (select id from public.plans where code = 'p59_plan'))) like '23514%', true);
select t.eq('p8: unknown plan id', t.e59(t.u(1), $$select public.admin_update_plan('00000000-0000-0000-0000-000000000000', '{"name":"x"}')$$) like 'P0002%', true);

-- ======================= E. ARCHIVE / RESTORE =======================
select t.eq('p8: archiving needs a reason', t.e59(t.u(1), format($$select public.admin_set_plan_active(%L, false, null)$$, (select id from public.plans where code = 'p59_plan'))) like '22023%', true);
select t.eq('p8: a public plan can be made public while active', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"is_public": true}')$$, (select id from public.plans where code = 'p59_plan'))), 'NO ERROR');
select t.eq('p8: archive with a live subscriber works', t.e59(t.u(1), format($$select public.admin_set_plan_active(%L, false, 'retired in test')$$, (select id from public.plans where code = 'p59_plan'))), 'NO ERROR');
select t.eq('p8: ...and the audit row records the live subscriber count', (select metadata->'after'->>'live_subscribers' from public.audit_logs where action = 'plan.archived' order by created_at desc limit 1), '1');
select t.eq('p8: archived plan is inactive', (select count(*) from public.plans where code = 'p59_plan' and not is_active), 1::bigint);
select t.as_admin();
select t.eq('p8: archived means not public too', (select is_public from public.plans where code = 'p59_plan'), false);
select t.eq('p8: an archived plan cannot be assigned', t.e59(t.u(1), format($$select public.admin_assign_subscription(%L, 'p59_plan', 'monthly', 'active', 30)$$, (select id from t59_c))) like '22023%', true);
select t.eq('p8: an archived plan cannot be made public', t.e59(t.u(1), format($$select public.admin_update_plan(%L, '{"is_public": true}')$$, (select id from public.plans where code = 'p59_plan'))) like '23514%', true);
select t.eq('p8: the plan with a subscription cannot be deleted', t.e59(t.u(1), $$delete from public.plans where code = 'p59_plan'$$) <> 'NO ERROR', true);
select t.eq('p8: the existing subscriber keeps the archived plan', (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id where p.code = 'p59_plan' and s.status in ('trialing','active')), 1::bigint);
select t.eq('p8: restore works', t.e59(t.u(1), format($$select public.admin_set_plan_active(%L, true, null)$$, (select id from public.plans where code = 'p59_plan'))), 'NO ERROR');
select t.eq('p8: archive and restore both audited', t.audits59('plan.archived') >= 1 and t.audits59('plan.restored') >= 1, true);

-- ======================= F. ENTITLEMENT VALUES =======================
create temp table t59_p as select id from public.plans where code = 'p59_plan';
grant select on t59_p to authenticated;
select t.eq('p8: set an integer limit', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_buses', 12)$$), 'NO ERROR');
select t.eq('p8: ...stored', (select int_value from public.plan_entitlements where plan_id = (select id from t59_p) and key = 'max_buses'), 12);
select t.eq('p8: unlimited stores NULL', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_buses', null, null, true)$$), 'NO ERROR');
select t.eq('p8: ...NULL on an integer key', (select int_value is null and bool_value is null from public.plan_entitlements where plan_id = (select id from t59_p) and key = 'max_buses'), true);
select t.eq('p8: toggle a boolean feature', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'feature_analytics', null, true)$$), 'NO ERROR');
select t.eq('p8: ...stored', (select bool_value from public.plan_entitlements where plan_id = (select id from t59_p) and key = 'feature_analytics'), true);
select t.eq('p8: a boolean on an integer key is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_buses', null, true)$$) like '22023%', true);
select t.eq('p8: an integer on a boolean key is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'feature_analytics', 5)$$) like '22023%', true);
select t.eq('p8: a negative limit is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_users', -1)$$) like '22023%', true);
select t.eq('p8: a number AND unlimited together is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_users', 3, null, true)$$) like '22023%', true);
select t.eq('p8: no value at all is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_users')$$) like '22023%', true);
select t.eq('p8: an unknown key is refused', t.e59(t.u(1), $$select public.admin_set_plan_entitlement((select id from t59_p), 'max_nothing', 1)$$) like '22023%', true);
select t.eq('p8: entitlement changes audited', t.audits59('plan.entitlement_set') >= 3, true);

-- ======================= G. NEW ENTITLEMENT KEY =======================
select t.eq('p8: define a new feature key', t.e59(t.u(1), $$select public.admin_create_entitlement_definition('feature_p8_probe', 'boolean', 'probe')$$), 'NO ERROR');
select t.eq('p8: every plan got an explicit false row', (select count(*) from public.plans p where not exists (select 1 from public.plan_entitlements e where e.plan_id = p.id and e.key = 'feature_p8_probe' and e.bool_value = false)), 0::bigint);
select t.eq('p8: a new integer key seeds 0 on every plan', t.e59(t.u(1), $$select public.admin_create_entitlement_definition('max_p8_probe', 'integer', null)$$), 'NO ERROR');
select t.eq('p8: ...all zero', (select count(*) from public.plans p where not exists (select 1 from public.plan_entitlements e where e.plan_id = p.id and e.key = 'max_p8_probe' and e.int_value = 0)), 0::bigint);
select t.eq('p8: duplicate key refused', t.e59(t.u(1), $$select public.admin_create_entitlement_definition('max_p8_probe', 'integer', null)$$) like '23505%', true);
select t.eq('p8: key must start with max_ or feature_', t.e59(t.u(1), $$select public.admin_create_entitlement_definition('whatever', 'integer', null)$$) like '22023%', true);
select t.eq('p8: bad type refused', t.e59(t.u(1), $$select public.admin_create_entitlement_definition('max_p8_bad', 'text', null)$$) like '22023%', true);
select t.eq('p8: support cannot define keys', t.e59(t.u(9), $$select public.admin_create_entitlement_definition('max_p8_sup', 'integer', null)$$) like '42501%', true);

-- ======================= H. OVERVIEW SHAPE =======================
select t.as_user(t.u(1));
create temp table t59_o as select public.admin_plan_overview() as j;
grant select on t59_o to authenticated;
select t.as_admin();
select t.eq('p8: overview lists every plan with entitlements', (select jsonb_array_length(j->'plans') from t59_o), (select count(*)::int from public.plans));
select t.eq('p8: overview counts live subscribers of the throw-away plan', (select (e->>'live_subscribers')::int from t59_o, jsonb_array_elements(j->'plans') e where e->>'code' = 'p59_plan'), 1);
select t.eq('p8: overview lists the definitions', (select jsonb_array_length(j->'definitions') from t59_o), (select count(*)::int from public.entitlement_definitions));
-- cleanup the throw-away company so later suites see no live extra company
select t.as_user(t.u(1));
select public.admin_set_company_status((select id from t59_c), 'cancelled', 'p8 test cleanup');
select t.as_admin();
