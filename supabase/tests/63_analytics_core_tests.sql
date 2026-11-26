-- 63: P10 slice A, analytics core (migration 0068). Harness style (t.eq / t.results), like suites 49-62. Runs as admin; the ingest RPCs are service_role only, so no user switch is needed for them.
-- Cleans up its own rows and restores analytics_config at the end.
select t.as_admin();
delete from t.results where name like 'p10a: %';
create or replace function t.e63(stmt text) returns text language plpgsql as $$
begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.as63(who uuid, stmt text) returns text language plpgsql as $$
begin
  if who is null then perform t.as_anon(); else perform t.as_user(who); end if;
  begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate || '|' || sqlerrm; end;
end $$;
create or replace function t.ctx63() returns jsonb language sql as $$
  select jsonb_build_object('path', '/search?from=a&to=b', 'locale', 'ar', 'device_class', 'mobile', 'country', 'EG', 'ip_hash', repeat('a', 64)) $$;

-- A. no consent, no data ---------------------------------------------------------------------------------------------------------------------------
select t.eq('p10a: without consent nothing is stored', (public.track_events('sess_test_0000000001', null, null, '[{"event":"page_view"}]', t.ctx63()))::bigint, 0::bigint);
select t.eq('p10a: without consent no event row exists', (select count(*) from public.analytics_events where session_id = 'sess_test_0000000001'), 0::bigint);
select t.eq('p10a: without consent a search is not stored', public.track_search('sess_test_0000000001', null, null, '{"origin":"Cairo","destination":"Fayoum","results_count":0}', t.ctx63()), false);

-- B. with consent ----------------------------------------------------------------------------------------------------------------------------------
select public.record_consent('sess_test_0000000001', null, true, '1');
select t.eq('p10a: with consent a batch of two is stored', (public.track_events('sess_test_0000000001', null, null, '[{"event":"page_view"},{"event":"language_switch","properties":{"to":"en"}}]', t.ctx63()))::bigint, 2::bigint);
select t.eq('p10a: the query string is stripped and the context kept', (select count(*) from public.analytics_events where session_id = 'sess_test_0000000001' and path = '/search' and country = 'EG' and ip_hash = repeat('a', 64) and device_class = 'mobile'), 2::bigint);
select public.track_events('sess_test_0000000001', null, null, '[{"event":"page_view"}]', '{"path":"/x","ip_hash":"not-a-hash"}');
select t.eq('p10a: a malformed ip_hash is stored as null, not trusted', (select count(*) from public.analytics_events where session_id = 'sess_test_0000000001' and path = '/x' and ip_hash is null), 1::bigint);

-- C. strict validation -----------------------------------------------------------------------------------------------------------------------------
select t.eq('p10a: unknown event refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, '[{"event":"nope"}]', '{}')$$) like '22023%', true);
select t.eq('p10a: a property outside the allow-list is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, '[{"event":"page_view","properties":{"x":1}}]', '{}')$$) like '22023%', true);
select t.eq('p10a: a nested property value is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, '[{"event":"language_switch","properties":{"to":{"a":1}}}]', '{}')$$) like '22023%', true);
select t.eq('p10a: an oversize string property is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, jsonb_build_array(jsonb_build_object('event','language_switch','properties',jsonb_build_object('to',repeat('x',300)))), '{}')$$) like '22023%', true);
select t.eq('p10a: a control character in a property is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, jsonb_build_array(jsonb_build_object('event','language_switch','properties',jsonb_build_object('to','a' || chr(7)))), '{}')$$) like '22023%', true);
select t.eq('p10a: a batch over 20 is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, (select jsonb_agg(jsonb_build_object('event','page_view')) from generate_series(1,21)), '{}')$$) like '22023%', true);
select t.eq('p10a: a bad session id is refused', t.e63($$select public.track_events('bad', null, null, '[{"event":"page_view"}]', '{}')$$) like '22023%', true);
select t.eq('p10a: a non-array batch is refused', t.e63($$select public.track_events('sess_test_0000000001', null, null, '{}', '{}')$$) like '22023%', true);

-- D. search events ---------------------------------------------------------------------------------------------------------------------------------
select t.eq('p10a: a zero-result search is stored', public.track_search('sess_test_0000000001', null, null, '{"origin":"Cairo","destination":"Fayoum","results_count":0,"travel_date":"2026-12-01"}', t.ctx63()), true);
select t.eq('p10a: zero_result is derived by the database', (select count(*) from public.search_events where session_id = 'sess_test_0000000001' and zero_result), 1::bigint);
select t.eq('p10a: a control character in origin is refused', t.e63($$select public.track_search('sess_test_0000000001', null, null, jsonb_build_object('origin', 'a' || chr(7), 'results_count', 1), '{}')$$) like '22023%', true);
select t.eq('p10a: a negative result count is refused', t.e63($$select public.track_search('sess_test_0000000001', null, null, '{"results_count":-1}', '{}')$$) like '22023%', true);
select t.eq('p10a: oversize filters are refused', t.e63($$select public.track_search('sess_test_0000000001', null, null, jsonb_build_object('results_count', 1, 'filters', jsonb_build_object('a', repeat('x', 2000))), '{}')$$) like '22023%', true);

-- E. withdrawal and notice version -----------------------------------------------------------------------------------------------------------------
select public.record_consent('sess_test_0000000001', null, false, '1');
select t.eq('p10a: withdrawing deletes the session''s events and searches', (select (select count(*) from public.analytics_events where session_id = 'sess_test_0000000001') + (select count(*) from public.search_events where session_id = 'sess_test_0000000001')), 0::bigint);
select t.eq('p10a: after withdrawal nothing more is stored', (public.track_events('sess_test_0000000001', null, null, '[{"event":"page_view"}]', t.ctx63()))::bigint, 0::bigint);
select public.record_consent('sess_test_0000000002', null, true, '1');
select t.eq('p10a: consent for the current notice version is honoured', (public.track_events('sess_test_0000000002', null, null, '[{"event":"page_view"}]', t.ctx63()))::bigint, 1::bigint);
update app_private.analytics_config set notice_version = '2';
select t.eq('p10a: a version bump invalidates the old consent', (public.track_events('sess_test_0000000002', null, null, '[{"event":"page_view"}]', t.ctx63()))::bigint, 0::bigint);
select t.eq('p10a: recording consent for a stale version is refused', t.e63($$select public.record_consent('sess_test_0000000002', null, true, '1')$$) like '22023%', true);
update app_private.analytics_config set notice_version = '1';

-- F. rate limit (fails here if the rate_limit_hit assumption in 0068 is wrong) ---------------------------------------------------------------------
select t.eq('p10a: rate check 1 of 3 passes', t.e63($$select app_private.analytics_rate_check('t63:rl', 3, 60)$$), 'NO ERROR');
select t.eq('p10a: rate check 2 of 3 passes', t.e63($$select app_private.analytics_rate_check('t63:rl', 3, 60)$$), 'NO ERROR');
select t.eq('p10a: rate check 3 of 3 passes', t.e63($$select app_private.analytics_rate_check('t63:rl', 3, 60)$$), 'NO ERROR');
select t.eq('p10a: the 4th call in the window is refused', t.e63($$select app_private.analytics_rate_check('t63:rl', 3, 60)$$) <> 'NO ERROR', true);

-- G. partitions and retention ----------------------------------------------------------------------------------------------------------------------
select t.eq('p10a: this month and the next two have a partition', (select count(*) from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent
  where p.relname = 'analytics_events' and c.relname in (
    select format('analytics_events_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'))
    from (select date_trunc('month', now() at time zone 'UTC') + make_interval(months => n) as m from generate_series(0, 2) n) q)), 3::bigint);
select app_private.ensure_analytics_partition((date_trunc('month', now() at time zone 'UTC') - interval '14 months')::date);
insert into public.analytics_events (occurred_at, session_id, surface, event) values (now() - interval '14 months', 'sess_test_0000000003', 'marketplace', 'page_view');
select app_private.analytics_maintenance();
select t.eq('p10a: maintenance drops a partition older than 13 months with its rows', (select count(*) from public.analytics_events where session_id = 'sess_test_0000000003'), 0::bigint);

-- H. deletion and privileges -----------------------------------------------------------------------------------------------------------------------
select t.eq('p10a: user_id cascades from auth.users on all three tables', (select count(*) from pg_constraint where confdeltype = 'c' and confrelid = 'auth.users'::regclass
  and conrelid in ('public.consents'::regclass, 'public.analytics_events'::regclass, 'public.search_events'::regclass)), 3::bigint);
select t.eq('p10a: anon cannot read any analytics table', has_table_privilege('anon', 'public.analytics_events', 'select') or has_table_privilege('anon', 'public.search_events', 'select') or has_table_privilege('anon', 'public.consents', 'select'), false);
select t.eq('p10a: no client role can write any analytics table', has_table_privilege('authenticated', 'public.analytics_events', 'insert') or has_table_privilege('authenticated', 'public.search_events', 'insert') or has_table_privilege('authenticated', 'public.consents', 'insert') or has_table_privilege('anon', 'public.consents', 'insert'), false);
select t.eq('p10a: no client role can run the ingest RPCs', has_function_privilege('anon', 'public.track_events(text,uuid,uuid,jsonb,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.track_events(text,uuid,uuid,jsonb,jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.track_search(text,uuid,uuid,jsonb,jsonb)', 'execute') or has_function_privilege('authenticated', 'public.record_consent(text,uuid,boolean,text)', 'execute'), false);
select t.eq('p10a: a signed-in company owner cannot call the ingest RPC', t.as63(t.u(2), $$select public.track_events('sess_test_0000000009', null, null, '[{"event":"page_view"}]', '{}')$$) like '42501%', true);
select t.eq('p10a: partition children are not granted to client roles', (select count(*) from information_schema.role_table_grants g where g.table_schema = 'app_private' and g.table_name like 'analytics_events_y%' and g.grantee in ('anon', 'authenticated', 'PUBLIC')), 0::bigint);
select t.eq('p10a: service_role can ingest', has_function_privilege('service_role', 'public.track_events(text,uuid,uuid,jsonb,jsonb)', 'execute'), true);

-- cleanup (the suites are cumulative on one database) -------------------------------------------------------------------------------------------------
delete from public.analytics_events where session_id like 'sess_test_%';
delete from public.search_events where session_id like 'sess_test_%';
delete from public.consents where session_id like 'sess_test_%';
