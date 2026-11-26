-- 65: P10 slice C, rollups + super-admin read RPCs (migration 0070). Harness style. Needs 01 fixtures: user 1 super_admin, 9 support, 10 billing, 2 ownerA.
-- LOCAL TEST DATABASE ONLY: it empties the analytics tables first (they hold nothing but earlier suites' data here).
select t.as_admin();
delete from t.results where name like 'p10c: %';
set timezone = 'UTC';
create or replace function t.e65(stmt text) returns text language plpgsql as $$
begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.as65(who uuid, stmt text) returns text language plpgsql as $$
declare r text; begin perform t.as_user(who); execute stmt into r; perform t.as_admin(); return r; end $$;
create or replace function t.err65(who uuid, stmt text) returns text language plpgsql as $$
begin if who is null then perform t.as_anon(); else perform t.as_user(who); end if; begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate || '|' || sqlerrm; end; end $$;
create or replace function t.w65() returns timestamptz language sql as $$ select date_trunc('week', now() - interval '21 days') $$;

delete from public.analytics_events; delete from public.search_events;
delete from public.analytics_daily; delete from public.demand_gaps_daily; delete from public.analytics_cohorts_weekly;
-- visitor A active in week W0 and W1; visitor B only W0; three searches for the same route typed three ways
insert into public.analytics_events (occurred_at, session_id, surface, event, locale, device_class) values
  (t.w65() + interval '1 day',  'sess_A_00000000000001', 'marketplace', 'page_view', 'ar', 'mobile'),
  (t.w65() + interval '1 day',  'sess_A_00000000000001', 'marketplace', 'page_view', 'ar', 'mobile'),
  (t.w65() + interval '1 day',  'sess_B_00000000000002', 'marketplace', 'page_view', 'ar', 'mobile'),
  (t.w65() + interval '8 days', 'sess_A_00000000000001', 'marketplace', 'page_view', 'ar', 'mobile');
insert into public.search_events (occurred_at, session_id, origin, destination, results_count) values
  (t.w65() + interval '1 day', 'sess_A_00000000000001', 'Cairo',  'Fayoum', 0),
  (t.w65() + interval '1 day', 'sess_B_00000000000002', ' cairo ', 'FAYOUM', 0),
  (t.w65() + interval '1 day', 'sess_B_00000000000002', 'Cairo  ', 'fayoum', 4);
select app_private.analytics_rollup(60);

-- A. rollup maths ----------------------------------------------------------------------------------------------------------------------------------
select t.eq('p10c: a day with 3 events from 2 visitors rolls up to 3 / 2', (select events::text || '/' || sessions::text from public.analytics_daily where day = (t.w65() + interval '1 day')::date and event = 'page_view'), '3/2');
select t.eq('p10c: demand gaps merge case and spacing into one route', (select searches::text || '/' || zero_searches::text from public.demand_gaps_daily where origin = 'cairo' and destination = 'fayoum'), '3/2');
select t.eq('p10c: cohort week: 2 new visitors', (select visitors from public.analytics_cohorts_weekly where cohort_week = t.w65()::date and week_offset = 0), 2::bigint);
select t.eq('p10c: cohort week: 1 came back the next week', (select visitors from public.analytics_cohorts_weekly where cohort_week = t.w65()::date and week_offset = 1), 1::bigint);
select app_private.analytics_rollup(60);
select t.eq('p10c: a second run changes nothing (events)', (select events from public.analytics_daily where day = (t.w65() + interval '1 day')::date and event = 'page_view'), 3::bigint);
select t.eq('p10c: a second run changes nothing (gap rows)', (select count(*) from public.demand_gaps_daily), 1::bigint);
select t.eq('p10c: window 0 is refused', t.e65($$select app_private.analytics_rollup(0)$$) like '22023%', true);
select t.eq('p10c: window 801 is refused', t.e65($$select app_private.analytics_rollup(801)$$) like '22023%', true);
select t.eq('p10c: the aggregate tables carry no identifier column', (select count(*) from information_schema.columns where table_schema = 'public'
  and table_name in ('analytics_daily', 'demand_gaps_daily', 'analytics_cohorts_weekly') and column_name in ('session_id', 'user_id', 'ip_hash')), 0::bigint);

-- B. who can read what -----------------------------------------------------------------------------------------------------------------------------
select t.eq('p10c: no client role can read raw or aggregate tables',
  has_table_privilege('authenticated', 'public.analytics_events', 'select') or has_table_privilege('authenticated', 'public.search_events', 'select') or has_table_privilege('authenticated', 'public.consents', 'select')
  or has_table_privilege('authenticated', 'public.analytics_daily', 'select') or has_table_privilege('authenticated', 'public.demand_gaps_daily', 'select')
  or has_table_privilege('authenticated', 'public.analytics_cohorts_weekly', 'select') or has_table_privilege('anon', 'public.analytics_daily', 'select'), false);
select t.eq('p10c: no client role can run the rollup', has_function_privilege('authenticated', 'app_private.analytics_rollup(int)', 'execute') or has_function_privilege('anon', 'app_private.analytics_rollup(int)', 'execute'), false);
select t.eq('p10c: anon has no EXECUTE on the admin RPCs', (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' escape '\' and p.proname in ('admin_analytics_overview', 'admin_event_usage', 'admin_funnel', 'admin_demand_gaps', 'admin_cohorts')), false);
select t.eq('p10c: super admin cannot read raw events either (aggregates only)', t.err65(t.u(1), $$select count(*) from public.analytics_events$$) like '42501%', true);
select t.eq('p10c: a company owner is refused by every admin RPC', t.err65(t.u(2), $$select * from public.admin_analytics_overview(30)$$) like '42501%'
  and t.err65(t.u(2), $$select * from public.admin_event_usage(30)$$) like '42501%' and t.err65(t.u(2), $$select * from public.admin_funnel(30)$$) like '42501%'
  and t.err65(t.u(2), $$select * from public.admin_demand_gaps(30, 1, 50)$$) like '42501%' and t.err65(t.u(2), $$select * from public.admin_cohorts()$$) like '42501%', true);
select t.eq('p10c: support is refused', t.err65(t.u(9), $$select * from public.admin_demand_gaps(30, 1, 50)$$) like '42501%', true);
select t.eq('p10c: billing is refused', t.err65(t.u(10), $$select * from public.admin_demand_gaps(30, 1, 50)$$) like '42501%', true);
select t.eq('p10c: anon is refused', t.err65(null, $$select * from public.admin_funnel(30)$$) like '42501%', true);

-- C. super admin gets the numbers ------------------------------------------------------------------------------------------------------------------
select t.eq('p10c: super admin sees the merged demand gap', t.as65(t.u(1), $$select origin || '>' || destination || ':' || searches || '/' || zero_searches || '/' || zero_rate from public.admin_demand_gaps(60, 1, 50)$$), 'cairo>fayoum:3/2/0.667');
select t.eq('p10c: super admin sees the daily overview', t.as65(t.u(1), $$select sum(page_views)::text from public.admin_analytics_overview(60)$$), '4');
select t.eq('p10c: the funnel always lists its four steps', t.as65(t.u(1), $$select count(*)::text from public.admin_funnel(60)$$), '4');
select t.eq('p10c: super admin sees the cohorts', t.as65(t.u(1), $$select count(*)::text from public.admin_cohorts() where cohort_week = date_trunc('week', now() - interval '21 days')::date$$), '2');
select t.eq('p10c: a bad window is refused for super admin', t.err65(t.u(1), $$select * from public.admin_demand_gaps(0, 1, 50)$$) like '22023%', true);
select t.eq('p10c: a bad limit is refused for super admin', t.err65(t.u(1), $$select * from public.admin_demand_gaps(30, 1, 501)$$) like '22023%', true);

-- cleanup ------------------------------------------------------------------------------------------------------------------------------------------
delete from public.analytics_events; delete from public.search_events;
delete from public.analytics_daily; delete from public.demand_gaps_daily; delete from public.analytics_cohorts_weekly;
reset timezone;
