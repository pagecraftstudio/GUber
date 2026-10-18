-- 0016: Phase 7.2 - platform overview read model.
--
-- PURPOSE
--   One read-only RPC that feeds the /admin overview page: company counts, subscription health, usage totals and the
--   latest audit rows. Aggregates span ALL tenants, so it must not be assembled from client-side table reads.
--
-- SECURITY
--   * SECURITY DEFINER, search_path = ''. Authorization is app_private.assert_platform(all three platform roles),
--     which reads auth.uid() -> platform_users (+ active profile). No role, company id or flag is a parameter.
--   * Read-only: no writes, therefore no audit row (audit is for privileged MUTATIONS).
--   * Returns counts and audit headers only. Audit `metadata` (before/after snapshots) is deliberately NOT returned
--     here; the audit page (7.5) decides what to expose.
--   * EXECUTE: authenticated only; anon and PUBLIC revoked. Tenant users and customers get 42501 from assert_platform.
--
-- ROLLBACK
--   drop function if exists public.admin_platform_overview();
set search_path = public, extensions;

create or replace function public.admin_platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_companies jsonb;
  v_subs jsonb;
  v_usage jsonb;
  v_recent jsonb;
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);

  select jsonb_build_object(
    'total',     count(*),
    'trial',     count(*) filter (where status = 'trial'),
    'active',    count(*) filter (where status = 'active'),
    'suspended', count(*) filter (where status = 'suspended'),
    'cancelled', count(*) filter (where status = 'cancelled'))
    into v_companies
    from public.companies where deleted_at is null;

  select jsonb_build_object(
    'trialing',  count(*) filter (where s.status = 'trialing' and s.current_period_end > now()),
    'active',    count(*) filter (where s.status = 'active'   and s.current_period_end > now()),
    'past_due',  count(*) filter (where s.status = 'past_due' and s.current_period_end > now()),
    -- live and ending within 14 days: needs attention soon
    'expiring_14d', count(*) filter (where s.status in ('trialing','active','past_due')
                                       and s.current_period_end > now()
                                       and s.current_period_end <= now() + interval '14 days'),
    -- status still says live but the period is over: entitlement checks already treat these as expired (0015)
    'stale_live', count(*) filter (where s.status in ('trialing','active','past_due') and s.current_period_end <= now()),
    -- trial/active companies with no live subscription: new trips/buses/bookings are blocked for them
    'companies_without_live', (select count(*) from public.companies c
                                where c.deleted_at is null and c.status in ('trial','active')
                                  and not exists (select 1 from app_private.live_subscription(c.id))))
    into v_subs
    from public.subscriptions s
    join public.companies c2 on c2.id = s.company_id and c2.deleted_at is null;

  select jsonb_build_object(
    'trips_total',     (select count(*) from public.trips),
    'trips_30d',       (select count(*) from public.trips where departure_at >= now() - interval '30 days'),
    'bookings_total',  (select count(*) from public.bookings),
    'bookings_30d',    (select count(*) from public.bookings where created_at >= now() - interval '30 days'),
    'customers_total', (select count(*) from public.customers))
    into v_usage;

  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into v_recent from (
    select a.id, a.created_at, a.action, a.entity_type, a.actor_type, a.company_id, c.name as company_name
      from public.audit_logs a left join public.companies c on c.id = a.company_id
     order by a.created_at desc, a.id desc
     limit 10) r;

  return jsonb_build_object(
    'generated_at', now(),
    'companies', v_companies,
    'subscriptions', v_subs,
    'usage', v_usage,
    'recent_activity', v_recent);
end $$;
revoke all on function public.admin_platform_overview() from public, anon;
grant execute on function public.admin_platform_overview() to authenticated;
