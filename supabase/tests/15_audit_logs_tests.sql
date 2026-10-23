-- 15: Phase 7.5 audit log read model (0019). Cumulative DB: suites 02-14 leave plenty of audit rows to browse.
-- This suite is read-only except for ONE audit row it creates through audit_platform (append-only by design).
create or replace function t.as_trusted(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); end $$;

select t.as_admin();
create temp table t15_world as select (select count(*) from audit_logs) as n,
  (select count(*) from companies) as c, (select count(*) from subscriptions) as s;
grant select on t15_world to authenticated;

-- ======================= A. WHO MAY CALL WHAT =======================
do $$
declare
  actors uuid[] := array[t.u(2), t.u(3), t.u(6), t.u(7), null];
  labels text[] := array['owner A','manager A','driver A','owner B','anon'];
  i int;
begin
  for i in 1 .. array_length(actors, 1) loop
    if actors[i] is null then perform t.as_anon(); else perform t.as_user(actors[i]); end if;
    perform t.raises(format('A: %s cannot list platform audit logs', labels[i]), 'select public.admin_list_audit_logs()', '42501');
    perform t.raises(format('A: %s cannot read one entry', labels[i]), $q$select public.admin_get_audit_log(gen_random_uuid())$q$, '42501');
    perform t.raises(format('A: %s cannot read the summary', labels[i]), 'select public.admin_audit_summary()', '42501');
  end loop;
  perform t.as_admin();
end $$;
select t.as_user(t.u(1));  select t.passes('A: super_admin lists', 'select public.admin_list_audit_logs()');
                           select t.passes('A: super_admin summary', 'select public.admin_audit_summary()');
select t.as_user(t.u(9));  select t.passes('A: support lists', 'select public.admin_list_audit_logs()');
                           select t.passes('A: support summary', 'select public.admin_audit_summary()');
select t.as_user(t.u(10)); select t.passes('A: billing lists (headers only)', 'select public.admin_list_audit_logs()');
                           select t.raises('A: billing cannot read the summary', 'select public.admin_audit_summary()', '42501');
select t.as_admin();
update platform_users set is_active = false where user_id = t.u(9);
select t.as_user(t.u(9));
select t.raises('A: deactivated support refused', 'select public.admin_list_audit_logs()', '42501');
select t.as_admin();
update platform_users set is_active = true where user_id = t.u(9);

-- ======================= B. LIST: SHAPE, ORDER, KEYSET PAGING =======================
select t.as_trusted(t.u(1));
create temp table t15_all as select public.admin_list_audit_logs(p_limit => 100) as j;
select t.as_admin();
select t.eq('B: list returns items, has_more, cursor keys', (select array(select jsonb_object_keys(j) order by 1) from t15_all),
  array['has_more','items','next_before_at','next_before_id']);
select t.eq('B: first page is newest-first',
  (select (select array_agg((e->>'id')::uuid order by ord) from jsonb_array_elements(j->'items') with ordinality x(e, ord))
        = (select array_agg(id order by created_at desc, id desc) from (select id, created_at from audit_logs order by created_at desc, id desc limit jsonb_array_length((select j->'items' from t15_all))) q) from t15_all), true);
select t.eq('B: items never carry metadata', (select count(*) from t15_all, jsonb_array_elements(j->'items') e where e ? 'metadata'), 0::bigint);
select t.eq('B: items never carry ip_address or user_agent', (select count(*) from t15_all, jsonb_array_elements(j->'items') e where e ? 'ip_address' or e ? 'user_agent'), 0::bigint);
select t.eq('B: enough audit rows exist to page (fixture sanity)', (select count(*) from audit_logs) > 12, true);

-- walk the whole log 5 rows at a time: no gaps, no repeats, same order as a plain ORDER BY
create temp table t15_walk (page int, rn int, id uuid);
do $$
declare v jsonb; at_ text; id_ text; pg int := 0; e jsonb; r int := 0;
begin
  perform t.as_trusted(t.u(1));
  loop
    v := public.admin_list_audit_logs(p_before_at => at_::timestamptz, p_before_id => id_::uuid, p_limit => 5);
    pg := pg + 1;
    for e in select * from jsonb_array_elements(v->'items') loop
      r := r + 1; insert into t15_walk values (pg, r, (e->>'id')::uuid);
    end loop;
    exit when not (v->>'has_more')::boolean;
    at_ := v->>'next_before_at'; id_ := v->>'next_before_id';
    exit when pg > 5000;
  end loop;
  perform t.as_admin();
end $$;
select t.eq('B: paging with limit 5 visits every row exactly once', (select count(*) from t15_walk), (select count(*) from audit_logs));
select t.eq('B: no duplicates across pages', (select count(distinct id) from t15_walk), (select count(*) from t15_walk));
select t.eq('B: paged order equals ORDER BY created_at desc, id desc',
  (select array_agg(id order by rn) from t15_walk), (select array_agg(id order by created_at desc, id desc) from audit_logs));
select t.as_trusted(t.u(1));
select t.eq('B: past the oldest row there is nothing and no cursor',
  (select public.admin_list_audit_logs(p_before_at => (select created_at from audit_logs order by created_at, id limit 1), p_before_id => (select id from audit_logs order by created_at, id limit 1), p_limit => 5)),
  '{"items": [], "has_more": false, "next_before_at": null, "next_before_id": null}'::jsonb);
select t.eq('B: limit is honoured', jsonb_array_length(public.admin_list_audit_logs(p_limit => 3)->'items'), 3);
select t.eq('B: has_more true when more rows exist', (public.admin_list_audit_logs(p_limit => 1)->>'has_more')::boolean, true);
select t.as_admin();

-- ======================= C. FILTERS =======================
select t.as_trusted(t.u(1));
create temp table t15_f as
  select 'company'::text k, public.admin_list_audit_logs(p_company => t.u(101), p_limit => 100) j
  union all select 'ns', public.admin_list_audit_logs(p_namespace => 'booking', p_limit => 100)
  union all select 'action', public.admin_list_audit_logs(p_action => 'invite.created', p_limit => 100)
  union all select 'entity', public.admin_list_audit_logs(p_entity_type => 'company_invite', p_limit => 100)
  union all select 'actor_type', public.admin_list_audit_logs(p_actor_type => 'customer', p_limit => 100)
  union all select 'actor', public.admin_list_audit_logs(p_actor => t.u(1), p_limit => 100)
  union all select 'none', public.admin_list_audit_logs(p_namespace => 'nosuchthing')
  union all select 'combo', public.admin_list_audit_logs(p_company => t.u(101), p_namespace => 'booking', p_actor_type => 'customer', p_limit => 100);
select t.as_admin();
select t.eq('C: company filter returns exactly that company''s rows',
  (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'company'), (select count(*) from audit_logs where company_id = t.u(101)) ) where (select count(*) from audit_logs where company_id = t.u(101)) <= 100;
select t.eq('C: company filter leaks no other company',
  (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'company' and e->>'company_id' is distinct from t.u(101)::text), 0::bigint);
select t.eq('C: namespace filter matches the action prefix only',
  (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'ns' and split_part(e->>'action', '.', 1) <> 'booking'), 0::bigint);
select t.eq('C: namespace filter count matches the table',
  (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'ns'), (select count(*) from audit_logs where action like 'booking.%')) where (select count(*) from audit_logs where action like 'booking.%') <= 100;
select t.eq('C: exact action filter', (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'action' and e->>'action' <> 'invite.created'), 0::bigint);
select t.eq('C: exact action filter finds rows', (select count(*) > 0 from t15_f, jsonb_array_elements(j->'items') e where k = 'action'), true);
select t.eq('C: entity filter', (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'entity' and e->>'entity_type' <> 'company_invite'), 0::bigint);
select t.eq('C: actor type filter', (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'actor_type' and e->>'actor_type' <> 'customer'), 0::bigint);
select t.eq('C: actor filter', (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'actor' and e->>'actor_id' <> t.u(1)::text), 0::bigint);
select t.eq('C: no match -> empty', (select jsonb_array_length(j->'items') from t15_f where k = 'none'), 0);
select t.eq('C: filters combine with AND',
  (select count(*) from t15_f, jsonb_array_elements(j->'items') e where k = 'combo' and (e->>'company_id' <> t.u(101)::text or e->>'actor_type' <> 'customer' or split_part(e->>'action','.',1) <> 'booking')), 0::bigint);
select t.as_trusted(t.u(1));
select t.eq('C: date range: nothing before the epoch', jsonb_array_length(public.admin_list_audit_logs(p_to => '2000-01-01')->'items'), 0);
select t.eq('C: date range: everything after the epoch is reachable', (public.admin_list_audit_logs(p_from => '2000-01-01', p_limit => 1)->>'has_more')::boolean, true);
select t.eq('C: from is inclusive, to is inclusive',
  (select jsonb_array_length(public.admin_list_audit_logs(p_from => (select min(created_at) from audit_logs), p_to => (select min(created_at) from audit_logs), p_limit => 100)->'items') >= 1), true);
select t.as_admin();

-- ======================= D. INPUT VALIDATION (no dynamic SQL, no injection) =======================
select t.as_trusted(t.u(1));
select t.raises('D: limit 0', 'select public.admin_list_audit_logs(p_limit => 0)', '22023');
select t.raises('D: limit 101', 'select public.admin_list_audit_logs(p_limit => 101)', '22023');
select t.raises('D: limit null', 'select public.admin_list_audit_logs(p_limit => null)', '22023');
select t.raises('D: namespace with SQL punctuation', $q$select public.admin_list_audit_logs(p_namespace => 'x''; drop table audit_logs; --')$q$, '22023');
select t.raises('D: namespace upper case', $q$select public.admin_list_audit_logs(p_namespace => 'Booking')$q$, '22023');
select t.raises('D: action without a dot', $q$select public.admin_list_audit_logs(p_action => 'booking')$q$, '22023');
select t.raises('D: action with wildcard', $q$select public.admin_list_audit_logs(p_action => 'booking.%')$q$, '22023');
select t.raises('D: entity type with punctuation', $q$select public.admin_list_audit_logs(p_entity_type => 'a b')$q$, '22023');
select t.raises('D: unknown actor type', $q$select public.admin_list_audit_logs(p_actor_type => 'root')$q$, '22023');
select t.raises('D: from after to', $q$select public.admin_list_audit_logs(p_from => '2030-01-02', p_to => '2030-01-01')$q$, '22023');
select t.raises('D: half a cursor (time only)', $q$select public.admin_list_audit_logs(p_before_at => now())$q$, '22023');
select t.raises('D: half a cursor (id only)', $q$select public.admin_list_audit_logs(p_before_id => gen_random_uuid())$q$, '22023');
select t.raises('D: summary days 0', 'select public.admin_audit_summary(0)', '22023');
select t.raises('D: summary days 91', 'select public.admin_audit_summary(91)', '22023');
select t.eq('D: the audit table is still there after the injection attempt', (select count(*) from audit_logs) >= (select n from t15_world), true);
select t.as_admin();

-- ======================= E. CHANGED KEYS + DETAIL + REDACTION =======================
select t.as_trusted(t.u(1));
select app_private.audit_platform(t.u(101), 'phase75.company_edit', 'company', t.u(101), '{"name":"A","phone":"1"}'::jsonb, '{"name":"B","phone":"2","country":"EG"}'::jsonb);
select app_private.audit_platform(t.u(101), 'phase75.sub_edit', 'subscription', t.u(301), '{"status":"trialing"}'::jsonb, '{"status":"active"}'::jsonb);
select app_private.audit_platform(t.u(101), 'phase75.no_after', 'company', t.u(101), null, null);
select t.as_admin();
create temp table t15_ids as select
  (select id from audit_logs where action = 'phase75.company_edit') as company_edit,
  (select id from audit_logs where action = 'phase75.sub_edit') as sub_edit,
  (select id from audit_logs where action = 'phase75.no_after') as no_after;
grant select on t15_ids to authenticated;
select t.as_trusted(t.u(1));
select t.eq('E: changed_keys lists the after-keys, sorted',
  (select e->'changed_keys' from jsonb_array_elements(public.admin_list_audit_logs(p_action => 'phase75.company_edit')->'items') e), '["country","name","phone"]'::jsonb);
select t.eq('E: changed_keys is [] when after is null',
  (select e->'changed_keys' from jsonb_array_elements(public.admin_list_audit_logs(p_action => 'phase75.no_after')->'items') e), '[]'::jsonb);
select t.eq('E: header carries actor name and company name',
  (select (e->>'actor_name', e->>'company_name') from jsonb_array_elements(public.admin_list_audit_logs(p_action => 'phase75.company_edit')->'items') e),
  (select row(full_name, 'Company A'::text) from profiles where id = t.u(1)));
-- detail per role
select t.eq('E: super_admin sees metadata and the actor email',
  (select (g->'metadata'->'after'->>'country', g->>'actor_email' is not null, (g->>'metadata_redacted')::boolean) from (select public.admin_get_audit_log((select company_edit from t15_ids)) g) x),
  row('EG'::text, true, false));
select t.as_trusted(t.u(9));
select t.eq('E: support sees metadata and the actor email',
  (select (g->'metadata'->'after'->>'country', g->>'actor_email' is not null, (g->>'metadata_redacted')::boolean) from (select public.admin_get_audit_log((select company_edit from t15_ids)) g) x),
  row('EG'::text, true, false));
select t.as_trusted(t.u(10));
select t.eq('E: billing: company entry is redacted, no metadata, no actor email',
  (select (g->'metadata' = 'null'::jsonb or not g ? 'metadata' or g->>'metadata' is null, g->>'actor_email' is null, (g->>'metadata_redacted')::boolean, g->>'action') from (select public.admin_get_audit_log((select company_edit from t15_ids)) g) x),
  row(true, true, true, 'phase75.company_edit'::text));
select t.eq('E: billing: subscription entry is shown in full',
  (select (g->'metadata'->'after'->>'status', (g->>'metadata_redacted')::boolean, g->>'actor_email' is null) from (select public.admin_get_audit_log((select sub_edit from t15_ids)) g) x),
  row('active'::text, false, true));
select t.raises('E: unknown entry -> P0002', $q$select public.admin_get_audit_log(gen_random_uuid())$q$, 'P0002');
select t.as_admin();

-- ======================= F. BILLING CANNOT READ RAW AUDIT ROWS; TENANTS STAY ISOLATED =======================
select t.as_user(t.u(10));
select t.eq('F: billing reads zero audit rows directly (policy tightened)', t.rows('select 1 from audit_logs'), 0::bigint);
select t.as_user(t.u(1));
select t.eq('F: super_admin still reads audit rows directly', t.rows('select 1 from audit_logs') > 0, true);
select t.as_user(t.u(9));
select t.eq('F: support still reads audit rows directly', t.rows('select 1 from audit_logs') > 0, true);
select t.as_user(t.u(2));
select t.eq('F: tenant owner reads only its own company''s audit rows',
  (select count(*) from audit_logs where company_id is distinct from t.u(101)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('F: owner B sees no company A audit rows', (select count(*) from audit_logs where company_id = t.u(101)), 0::bigint);
select t.as_user(t.u(1));
select t.raises('F: audit_logs still cannot be updated', $$update audit_logs set action = 'x'$$, '42501');
select t.raises('F: audit_logs still cannot be inserted by an API role', $$insert into audit_logs (actor_type, action, entity_type) values ('system','x.y','z')$$, '42501');
select t.as_admin();
select t.raises('F: append-only holds even for the owner (update)', $$update audit_logs set action = 'x'$$, '42501');
select t.raises('F: append-only holds even for the owner (delete)', $$delete from audit_logs$$, '42501');

-- ======================= G. SUMMARY =======================
select t.as_trusted(t.u(1));
create temp table t15_sum as select public.admin_audit_summary(30) as j;
select t.as_admin();
select t.eq('G: summary total = rows in the window', (select (j->>'total')::bigint from t15_sum), (select count(*) from audit_logs where created_at >= now() - interval '30 days'));
select t.eq('G: namespace counts add up to at most the total', (select coalesce(sum((e->>'count')::bigint), 0) <= (select (j->>'total')::bigint from t15_sum) from t15_sum, jsonb_array_elements(j->'by_namespace') e), true);
select t.eq('G: platform actors are platform users only',
  (select count(*) from t15_sum, jsonb_array_elements(j->'platform_actors') e where not exists (select 1 from audit_logs a where a.actor_id = (e->>'actor_id')::uuid and a.actor_type = 'platform_user')), 0::bigint);
select t.eq('G: summary shape', (select array(select jsonb_object_keys(j) order by 1) from t15_sum), array['by_namespace','days','platform_actors','since','total']);

-- ======================= H. READ-ONLY, HARDENING, COVERAGE =======================
select t.eq('H: only the one test audit rows were added by this suite (3 phase75 rows)', (select count(*) from audit_logs) - (select n from t15_world), 3::bigint);
select t.eq('H: no company or subscription changed', (select c = (select count(*) from companies) and s = (select count(*) from subscriptions) from t15_world), true);
select t.eq('H: all three functions SECURITY DEFINER, empty search_path, no anon EXECUTE, authenticated EXECUTE',
  (select count(*) from pg_proc p where p.proname in ('admin_list_audit_logs','admin_get_audit_log','admin_audit_summary')
      and p.prosecdef and p.proconfig @> array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')), 3::bigint);
select t.eq('H: no parameter is a role', (select count(*) from pg_proc p where p.proname in ('admin_list_audit_logs','admin_get_audit_log','admin_audit_summary') and pg_get_function_arguments(p.oid) ~* '\mrole\M'), 0::bigint);
select t.eq('H: both indexes exist', (select count(*) from pg_indexes where tablename = 'audit_logs' and indexname in ('audit_logs_created_idx','audit_logs_action_idx')), 2::bigint);
select t.eq('H: every action namespace in the log is one the UI knows (extend the TS catalogue when this fails)',
  (select coalesce(array_agg(distinct split_part(action, '.', 1)), '{}') from audit_logs where action not like 'phase7%' and action not like 'test.%'
     and split_part(action, '.', 1) not in ('booking','company','invite','subscription','ticket','trip')), '{}'::text[]);
