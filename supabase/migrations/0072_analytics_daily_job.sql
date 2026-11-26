-- 0072_analytics_daily_job.sql  (P10: schedule the analytics upkeep)
--
-- WHY: 0068 creates partitions only for this month and the next two, and 0070's rollups only run when called. Nothing called them, so after ~3 months
--   inserts would fail for lack of a partition, the admin analytics pages would stay frozen at the migration-time backfill, and nothing would drop expired rows.
-- HOW: one daily job in the project's scheduler (app_private.jobs, run_due_jobs() from 0053, failures alert super admins via notify_job_failed).
--   One function, so the order is fixed: roll up recent days first, then create partitions and drop expired data.
-- Rollback: delete from app_private.jobs where name = 'analytics-daily'; drop function app_private.analytics_daily_job();
-- Runner note: needs 0053, 0068, 0070. No app code depends on it.

create function app_private.analytics_daily_job() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.analytics_rollup(3);
  perform app_private.analytics_maintenance();
end $$;
revoke all on function app_private.analytics_daily_job() from public, anon, authenticated;

insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('analytics-daily', 'analytics_daily_job', 86400, 172800)
on conflict (name) do nothing;
