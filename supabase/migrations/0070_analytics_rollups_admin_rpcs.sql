-- 0070_analytics_rollups_admin_rpcs.sql  (P10c-1: rollups + super-admin read RPCs, no UI)
--
-- Rollback (reverse order):
--   drop function public.admin_analytics_overview(int), public.admin_event_usage(int), public.admin_funnel(int), public.admin_demand_gaps(int,int,int), public.admin_cohorts();
--   drop function app_private.analytics_rollup(int);
--   drop table public.analytics_cohorts_weekly, public.demand_gaps_daily, public.analytics_daily;
--   -- restore raw read (only if you really want it): recreate the 3 *_admin_read policies from 0068 and grant select to authenticated.
-- Runner note: needs 0068. No app code reads these yet, so apply order vs deploy is free.
-- VERIFY: app_private.is_platform_super_admin() (same assumption as 0068).
--
-- SECURITY CHANGE: raw analytics tables are no longer readable by ANY client role, super admin included.
-- Super admin reads aggregates through the RPCs below. A user-level drill-down must be a separate, audited RPC (not built; plan section 9).
-- Scheduler: register app_private.analytics_rollup() daily in run_due_jobs(), BEFORE app_private.analytics_maintenance(), so rows are rolled up before old partitions are dropped.

drop policy analytics_events_admin_read on public.analytics_events;
drop policy search_events_admin_read on public.search_events;
drop policy consents_admin_read on public.consents;
revoke select on public.analytics_events, public.search_events, public.consents from authenticated;

-- ---------------------------------------------------------------- rollup tables (aggregates only, no session or user ids)
create table public.analytics_daily (
  day date not null,
  surface text not null,
  event text not null,
  locale text not null default 'unknown',
  device_class text not null default 'unknown',
  events bigint not null,
  sessions bigint not null,  -- distinct visitors (anonymous id) that day for this row
  users bigint not null,     -- distinct signed-in users that day for this row
  primary key (day, surface, event, locale, device_class)
);
create table public.demand_gaps_daily (
  day date not null,
  origin text not null,       -- normalised: trimmed, lower-case, single spaces; '' when not given
  destination text not null,
  searches bigint not null,
  zero_searches bigint not null,
  sessions bigint not null,
  primary key (day, origin, destination)
);
create table public.analytics_cohorts_weekly (
  cohort_week date not null,  -- Monday (UTC) of the visitor's first recorded event
  week_offset int not null check (week_offset >= 0),
  visitors bigint not null,
  primary key (cohort_week, week_offset)
);
alter table public.analytics_daily enable row level security;
alter table public.demand_gaps_daily enable row level security;
alter table public.analytics_cohorts_weekly enable row level security;
revoke all on public.analytics_daily, public.demand_gaps_daily, public.analytics_cohorts_weekly from public, anon, authenticated;

-- ---------------------------------------------------------------- rollup (idempotent: deletes and rebuilds the window)
create function app_private.analytics_rollup(p_days int default 3)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_from date;
  v_from_ts timestamptz;
  v_cohort_cut date;
begin
  if p_days is null or p_days not between 1 and 800 then raise exception 'invalid window' using errcode = '22023'; end if;
  v_from := (now() at time zone 'UTC')::date - (p_days - 1);
  v_from_ts := v_from::timestamp at time zone 'UTC';

  delete from public.analytics_daily where day >= v_from;
  insert into public.analytics_daily (day, surface, event, locale, device_class, events, sessions, users)
  select (occurred_at at time zone 'UTC')::date, surface, event, coalesce(locale, 'unknown'), coalesce(device_class, 'unknown'),
         count(*), count(distinct session_id), count(distinct user_id)
  from public.analytics_events
  where occurred_at >= v_from_ts
  group by 1, 2, 3, 4, 5;

  delete from public.demand_gaps_daily where day >= v_from;
  insert into public.demand_gaps_daily (day, origin, destination, searches, zero_searches, sessions)
  select (occurred_at at time zone 'UTC')::date,
         coalesce(lower(regexp_replace(btrim(origin), '\s+', ' ', 'g')), ''),
         coalesce(lower(regexp_replace(btrim(destination), '\s+', ' ', 'g')), ''),
         count(*), count(*) filter (where zero_result), count(distinct session_id)
  from public.search_events
  where occurred_at >= v_from_ts
  group by 1, 2, 3;

  -- Cohorts: rebuild only cohorts that start inside the last 12 months. Raw rows live 13 months, so these are exact;
  -- older cohorts keep their last computed values (rebuilding them would mis-date visitors whose first events were already dropped).
  v_cohort_cut := date_trunc('week', (now() at time zone 'UTC') - interval '12 months')::date;
  delete from public.analytics_cohorts_weekly where cohort_week >= v_cohort_cut;
  insert into public.analytics_cohorts_weekly (cohort_week, week_offset, visitors)
  with first_seen as (
    select session_id, date_trunc('week', min(occurred_at at time zone 'UTC'))::date as cohort_week
    from public.analytics_events group by session_id
  ), active as (
    select distinct session_id, date_trunc('week', occurred_at at time zone 'UTC')::date as wk
    from public.analytics_events
  )
  select f.cohort_week, ((a.wk - f.cohort_week) / 7)::int, count(*)
  from first_seen f join active a using (session_id)
  where f.cohort_week >= v_cohort_cut
  group by 1, 2;
end $$;
revoke all on function app_private.analytics_rollup(int) from public, anon, authenticated;
select app_private.analytics_rollup(400);

-- ---------------------------------------------------------------- super-admin read RPCs (check inside; aggregates only)
-- "visitor_days" = sum of daily distinct visitors. It is NOT the number of distinct people over the period.
create function public.admin_analytics_overview(p_days int default 30)
returns table (day date, page_views bigint, visitor_days bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 400 then raise exception 'invalid window' using errcode = '22023'; end if;
  return query
    select d.day, sum(d.events)::bigint, sum(d.sessions)::bigint
    from public.analytics_daily d
    where d.event = 'page_view' and d.day >= (now() at time zone 'UTC')::date - (p_days - 1)
    group by d.day order by d.day;
end $$;

create function public.admin_event_usage(p_days int default 30)
returns table (surface text, event text, events bigint, visitor_days bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 400 then raise exception 'invalid window' using errcode = '22023'; end if;
  return query
    select d.surface, d.event, sum(d.events)::bigint, sum(d.sessions)::bigint
    from public.analytics_daily d
    where d.day >= (now() at time zone 'UTC')::date - (p_days - 1)
    group by d.surface, d.event order by 3 desc;
end $$;

-- Approximate funnel: visitor-days per step, not a strict "did A then B" path. Fine for spotting the biggest drop.
create function public.admin_funnel(p_days int default 30)
returns table (step text, ord int, visitor_days bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 400 then raise exception 'invalid window' using errcode = '22023'; end if;
  return query
    select f.step, f.ord, coalesce(sum(d.sessions), 0)::bigint
    from (values ('trip_view', 1), ('booking_start', 2), ('booking_submit', 3), ('booking_success', 4)) as f(step, ord)
    left join public.analytics_daily d
      on d.event = f.step and d.day >= (now() at time zone 'UTC')::date - (p_days - 1)
    group by f.step, f.ord order by f.ord;
end $$;

-- What people search and do not find.
create function public.admin_demand_gaps(p_days int default 30, p_min_zero int default 1, p_limit int default 50)
returns table (origin text, destination text, searches bigint, zero_searches bigint, zero_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_days is null or p_days not between 1 and 400 or p_min_zero is null or p_min_zero < 1 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  return query
    select g.origin, g.destination, sum(g.searches)::bigint, sum(g.zero_searches)::bigint,
           round(sum(g.zero_searches)::numeric / nullif(sum(g.searches), 0), 3)
    from public.demand_gaps_daily g
    where g.day >= (now() at time zone 'UTC')::date - (p_days - 1)
    group by g.origin, g.destination
    having sum(g.zero_searches) >= p_min_zero
    order by 4 desc, 3 desc
    limit p_limit;
end $$;

create function public.admin_cohorts()
returns table (cohort_week date, week_offset int, visitors bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.is_platform_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select c.cohort_week, c.week_offset, c.visitors from public.analytics_cohorts_weekly c order by 1, 2;
end $$;

revoke all on function public.admin_analytics_overview(int), public.admin_event_usage(int), public.admin_funnel(int),
  public.admin_demand_gaps(int,int,int), public.admin_cohorts() from public, anon;
grant execute on function public.admin_analytics_overview(int), public.admin_event_usage(int), public.admin_funnel(int),
  public.admin_demand_gaps(int,int,int), public.admin_cohorts() to authenticated;
