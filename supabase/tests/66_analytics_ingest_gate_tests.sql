-- 66: P10, analytics ingest gate (migration 0071). Harness style. Needs 01 fixtures: user 1 super_admin, 2 ownerA. Cleans its own rows and clears the secret at the end.
select t.as_admin();
delete from t.results where name like 'p10g: %';
create or replace function t.sig66(p_call text, p_session text, p_user uuid, p_company uuid, p_exp bigint) returns text language sql security definer as $$
  select app_private.hmac_sha256((select ingest_secret from app_private.analytics_config), 'v1|' || p_call || '|' || coalesce(p_session, '') || '|' || coalesce(p_user::text, '') || '|' || coalesce(p_company::text, '') || '|' || p_exp) $$;
create or replace function t.exp66(p_ttl int default 60) returns bigint language sql as $$ select extract(epoch from now())::bigint + p_ttl $$;
-- run a statement as a role and report 'NO ERROR' or sqlstate
create or replace function t.err66(who uuid, stmt text) returns text language plpgsql as $$
begin if who is null then perform t.as_anon(); else perform t.as_user(who); end if; begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate; end; end $$;

-- A. not configured: closed -------------------------------------------------------------------------------------------------------------------------
update app_private.analytics_config set ingest_secret = null;
select t.eq('p10g: with no secret configured every ingest call is refused', t.err66(null, format($$select public.ingest_consent('sess_gate_000000001', null, true, '1', %s, %L)$$, t.exp66(), repeat('a', 64))), '42501');

-- B. secret management ------------------------------------------------------------------------------------------------------------------------------
select t.eq('p10g: a company owner cannot set the secret', t.err66(t.u(2), $$select public.set_analytics_ingest_secret(repeat('s', 40))$$), '42501');
select t.eq('p10g: anon cannot set the secret', t.err66(null, $$select public.set_analytics_ingest_secret(repeat('s', 40))$$), '42501');
select t.eq('p10g: a short secret is refused', t.err66(t.u(1), $$select public.set_analytics_ingest_secret('short')$$), '22023');
select t.eq('p10g: super admin sets it', t.err66(t.u(1), $$select public.set_analytics_ingest_secret(repeat('s', 40))$$), 'NO ERROR');
select t.eq('p10g: the change is audited without the secret', (select count(*) from audit_logs where action = 'analytics.ingest_secret_changed' and metadata::text not like '%ssss%'), 1::bigint);
select t.eq('p10g: no client role can read the config table', has_table_privilege('authenticated', 'app_private.analytics_config', 'select') or has_table_privilege('anon', 'app_private.analytics_config', 'select'), false);

-- C. consent through the gate -----------------------------------------------------------------------------------------------------------------------
create temp table t66 as select t.exp66() as exp;
grant select on t66 to anon, authenticated;
select t.eq('p10g: anon with a valid consent token records consent',
  t.err66(null, format($$select public.ingest_consent('sess_gate_000000001', null, true, '1', %s, %L)$$, (select exp from t66), t.sig66('consent:true', 'sess_gate_000000001', null, null, (select exp from t66)))), 'NO ERROR');
select t.eq('p10g: the consent row exists', (select count(*) from public.consents where session_id = 'sess_gate_000000001' and granted), 1::bigint);
select t.eq('p10g: a "granted" token cannot record "denied"',
  t.err66(null, format($$select public.ingest_consent('sess_gate_000000001', null, false, '1', %s, %L)$$, (select exp from t66), t.sig66('consent:true', 'sess_gate_000000001', null, null, (select exp from t66)))), '42501');

-- D. events and search through the gate ------------------------------------------------------------------------------------------------------------
select t.eq('p10g: a valid events token stores the event',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{"path":"/g"}', %s, %L)$$, (select exp from t66), t.sig66('events', 'sess_gate_000000001', null, null, (select exp from t66)))), 'NO ERROR');
select t.eq('p10g: the event row exists', (select count(*) from public.analytics_events where session_id = 'sess_gate_000000001' and path = '/g'), 1::bigint);
select t.eq('p10g: a valid search token stores the search',
  t.err66(null, format($$select public.ingest_search('sess_gate_000000001', null, null, '{"origin":"A","destination":"B","results_count":0}', '{}', %s, %L)$$, (select exp from t66), t.sig66('search', 'sess_gate_000000001', null, null, (select exp from t66)))), 'NO ERROR');
select t.eq('p10g: the search row exists', (select count(*) from public.search_events where session_id = 'sess_gate_000000001'), 1::bigint);
select t.eq('p10g: an events token cannot be used for a search',
  t.err66(null, format($$select public.ingest_search('sess_gate_000000001', null, null, '{"results_count":1}', '{}', %s, %L)$$, (select exp from t66), t.sig66('events', 'sess_gate_000000001', null, null, (select exp from t66)))), '42501');
select t.eq('p10g: a signed-in user can use a valid token too',
  t.err66(t.u(2), format($$select public.ingest_events('sess_gate_000000001', %L, null, '[{"event":"page_view"}]', '{"path":"/g2"}', %s, %L)$$, t.u(2), (select exp from t66), t.sig66('events', 'sess_gate_000000001', t.u(2), null, (select exp from t66)))), 'NO ERROR');

-- E. refusals ---------------------------------------------------------------------------------------------------------------------------------------
select t.eq('p10g: a wrong signature is refused',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{}', %s, %L)$$, (select exp from t66), repeat('0', 64))), '42501');
select t.eq('p10g: a malformed signature is refused',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{}', %s, 'nope')$$, (select exp from t66))), '42501');
select t.eq('p10g: an expired token is refused',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{}', %s, %L)$$, t.exp66(-5), t.sig66('events', 'sess_gate_000000001', null, null, t.exp66(-5)))), '42501');
select t.eq('p10g: an expiry more than 120 s ahead is refused',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{}', %s, %L)$$, t.exp66(600), t.sig66('events', 'sess_gate_000000001', null, null, t.exp66(600)))), '42501');
select t.eq('p10g: a token for one session cannot be used for another',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000002', null, null, '[{"event":"page_view"}]', '{}', %s, %L)$$, (select exp from t66), t.sig66('events', 'sess_gate_000000001', null, null, (select exp from t66)))), '42501');
select t.eq('p10g: a token cannot be reused for another user id',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', %L, null, '[{"event":"page_view"}]', '{}', %s, %L)$$, t.u(2), (select exp from t66), t.sig66('events', 'sess_gate_000000001', null, null, (select exp from t66)))), '42501');
select t.eq('p10g: a token cannot be reused for another company id',
  t.err66(null, format($$select public.ingest_events('sess_gate_000000001', null, %L, '[{"event":"page_view"}]', '{}', %s, %L)$$, t.u(101), (select exp from t66), t.sig66('events', 'sess_gate_000000001', null, null, (select exp from t66)))), '42501');
select t.eq('p10g: the inner functions stay closed to anon and authenticated',
  has_function_privilege('anon', 'public.track_events(text,uuid,uuid,jsonb,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.track_events(text,uuid,uuid,jsonb,jsonb)', 'execute')
  or has_function_privilege('anon', 'public.track_search(text,uuid,uuid,jsonb,jsonb)', 'execute') or has_function_privilege('anon', 'public.record_consent(text,uuid,boolean,text)', 'execute'), false);
select t.eq('p10g: calling the inner function directly as anon is refused', t.err66(null, $$select public.track_events('sess_gate_000000001', null, null, '[{"event":"page_view"}]', '{}')$$), '42501');
select t.eq('p10g: the token check itself is not callable by clients', has_function_privilege('anon', 'app_private.analytics_check_token(text,text,uuid,uuid,bigint,text)', 'execute') or has_function_privilege('authenticated', 'app_private.analytics_check_token(text,text,uuid,uuid,bigint,text)', 'execute'), false);

-- cleanup -------------------------------------------------------------------------------------------------------------------------------------------
update app_private.analytics_config set ingest_secret = null;
delete from public.analytics_events where session_id like 'sess_gate_%';
delete from public.search_events where session_id like 'sess_gate_%';
delete from public.consents where session_id like 'sess_gate_%';
