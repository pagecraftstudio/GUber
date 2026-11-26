-- 67: P10, analytics daily job (migration 0072). Harness style. Cleans its own rows.
select t.as_admin();
delete from t.results where name like 'p10j: %';
create or replace function t.err67(who uuid, stmt text) returns text language plpgsql as $$
begin if who is null then perform t.as_anon(); else perform t.as_user(who); end if; begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate; end; end $$;

select t.eq('p10j: the job is registered, enabled, daily, with a stale alert after two days',
  (select every_seconds::text || '/' || stale_after_seconds::text || '/' || enabled::text || '/' || fn from app_private.jobs where name = 'analytics-daily'), '86400/172800/true/analytics_daily_job');
select t.eq('p10j: no client role can run the job function', has_function_privilege('authenticated', 'app_private.analytics_daily_job()', 'execute') or has_function_privilege('anon', 'app_private.analytics_daily_job()', 'execute'), false);
select t.eq('p10j: a signed-in user cannot call it', t.err67(t.u(2), $$select app_private.analytics_daily_job()$$), '42501');

-- the job does what it says: rolls recent events up and keeps the partitions ahead
insert into public.analytics_events (session_id, surface, event, locale, device_class) values ('sess_job_00000000001', 'marketplace', 'page_view', 'ar', 'mobile');
select app_private.analytics_daily_job();
select t.eq('p10j: the job rolled today''s event into analytics_daily', (select coalesce(sum(events), 0) from public.analytics_daily where day = (now() at time zone 'UTC')::date and event = 'page_view'), 1::bigint);
select t.eq('p10j: the job keeps this month and the next two partitions in place', (select count(*) from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent
  where p.relname = 'analytics_events' and c.relname in (
    select format('analytics_events_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'))
    from (select date_trunc('month', now() at time zone 'UTC') + make_interval(months => n) as m from generate_series(0, 2) n) q)), 3::bigint);
select t.eq('p10j: running it through the scheduler succeeds', (select (app_private.run_due_jobs() >= 0)), true);
select t.eq('p10j: the scheduler recorded no failure for it', (select coalesce(last_error, 'none') from app_private.jobs where name = 'analytics-daily'), 'none');

delete from public.analytics_events where session_id = 'sess_job_00000000001';
delete from public.analytics_daily;
