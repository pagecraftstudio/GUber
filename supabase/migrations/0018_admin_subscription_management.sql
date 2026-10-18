-- 0018: Phase 7.4 - superadmin subscription management.
--
-- PURPOSE
--   0015 removed every direct write on `subscriptions`. This migration adds the only write paths: SECURITY DEFINER
--   functions that authorize from auth.uid() -> platform_users, validate input, keep ONE live row per company, and write
--   an audit row with before/after. One read function feeds the /admin/subscriptions list.
--
-- FUNCTIONS                                  WHO                       AUDIT ACTION(S)
--   admin_list_subscriptions(...)            super_admin, support,     none (read)
--                                            billing
--   admin_assign_subscription(...)           super_admin, billing      subscription.assigned
--   admin_set_subscription_status(...)       super_admin, billing      subscription.status_changed | .cancelled | .expired
--   admin_set_subscription_period(...)       super_admin, billing      subscription.period_changed
--   admin_expire_subscriptions()             super_admin, billing      subscription.expired (one row per subscription)
--
-- SECURITY
--   * search_path = '' everywhere. Role comes from app_private.assert_platform() (auth.uid()); never a parameter.
--   * Company and subscription ids are TARGETS. The company row is locked FOR UPDATE before its subscriptions are touched,
--     in every function, so concurrent calls cannot create two live rows or deadlock on lock order.
--   * EXECUTE: authenticated only. PUBLIC and anon revoked. Everyone else gets 42501 from assert_platform.
--   * History is kept: a replaced subscription becomes 'expired', never deleted.
--
-- BUSINESS RULES DECIDED HERE (flagged in PHASE-7.4-REPORT.md)
--   * "Live" = status in (trialing, active, past_due) AND current_period_end > now() (same as app_private.live_subscription).
--   * A stale row (live status, period ended) still occupies subscriptions_one_live_idx, so assign expires it first.
--   * Assign: plan must be active; status trialing|active; period = now() + 1..1830 days; company must not be cancelled.
--     Downgrades are NOT retroactive: limits only block NEW inserts (0004/0015). Existing rows over the new limit stay.
--   * Status transitions: trialing -> active|cancelled|expired; active -> past_due|cancelled|expired;
--     past_due -> active|cancelled|expired; cancelled and expired are terminal (assign a new subscription instead).
--     Moving to active/past_due needs a period that has not ended (extend it first).
--     cancelled and expired need a reason (3..500 chars).
--   * Period change applies to live-status rows only: new end = (now | current end) + 1..1830 days, must be in the future.
--   * Company suspension does not change subscriptions; subscription changes do not change company status.
--   * No cron is scheduled: expiry already takes effect at query time (0015). admin_expire_subscriptions() only tidies
--     statuses and records the audit trail.
--
-- ROLLBACK
--   drop function if exists public.admin_list_subscriptions(text, text, text, text, integer, integer);
--   drop function if exists public.admin_assign_subscription(uuid, text, text, text, integer);
--   drop function if exists public.admin_set_subscription_status(uuid, text, text);
--   drop function if exists public.admin_set_subscription_period(uuid, integer, text);
--   drop function if exists public.admin_expire_subscriptions();
set search_path = public, extensions;

-- ======================= admin_list_subscriptions =======================
-- p_state: live | stale | expiring | trialing | active | past_due | cancelled | expired  (null = all)
--   live     status live AND period not ended        stale    status live BUT period ended
--   expiring live AND ends within 14 days            others   the raw status column
create or replace function public.admin_list_subscriptions(
  p_q text default null, p_state text default null, p_sort text default 'period_end', p_dir text default 'asc',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_term text := left(trim(coalesce(p_q, '')), 100);
  v_like text;
  v_total bigint;
  v_items jsonb;
begin
  perform app_private.assert_platform(array['super_admin','support','billing']);

  if p_state is not null and p_state not in ('live','stale','expiring','trialing','active','past_due','cancelled','expired') then
    raise exception 'invalid state filter' using errcode = '22023';
  end if;
  if p_sort not in ('period_end','created_at') or p_dir not in ('asc','desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid page' using errcode = '22023';
  end if;

  v_like := case when v_term = '' then null
                 else '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  select count(*) into v_total
    from public.subscriptions s join public.companies c on c.id = s.company_id and c.deleted_at is null
   where (v_like is null or c.name ilike v_like escape '\' or c.slug::text ilike v_like escape '\')
     and (p_state is null
          or (p_state = 'live'     and s.status in ('trialing','active','past_due') and s.current_period_end > now())
          or (p_state = 'stale'    and s.status in ('trialing','active','past_due') and s.current_period_end <= now())
          or (p_state = 'expiring' and s.status in ('trialing','active','past_due') and s.current_period_end > now()
                                       and s.current_period_end <= now() + interval '14 days')
          or (p_state in ('trialing','active','past_due','cancelled','expired') and s.status = p_state));

  select coalesce(jsonb_agg(x.j order by x.rn), '[]'::jsonb) into v_items from (
    select row_number() over (
             order by
               case when p_sort = 'period_end' and p_dir = 'asc' then s.current_period_end end asc,
               case when p_sort = 'period_end' and p_dir = 'desc' then s.current_period_end end desc,
               case when p_sort = 'created_at' and p_dir = 'asc' then s.created_at end asc,
               case when p_sort = 'created_at' and p_dir = 'desc' then s.created_at end desc,
               s.id) as rn,
           jsonb_build_object(
             'id', s.id, 'company_id', c.id, 'company_name', c.name, 'company_slug', c.slug::text, 'company_status', c.status,
             'plan_code', pl.code, 'plan_name', pl.name, 'status', s.status,
             'state', case when s.status in ('trialing','active','past_due')
                           then case when s.current_period_end > now() then 'live' else 'stale' end
                           else s.status end,
             'billing_interval', s.billing_interval, 'current_period_start', s.current_period_start,
             'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
             'created_at', s.created_at) as j
      from public.subscriptions s
      join public.companies c on c.id = s.company_id and c.deleted_at is null
      join public.plans pl on pl.id = s.plan_id
     where (v_like is null or c.name ilike v_like escape '\' or c.slug::text ilike v_like escape '\')
       and (p_state is null
            or (p_state = 'live'     and s.status in ('trialing','active','past_due') and s.current_period_end > now())
            or (p_state = 'stale'    and s.status in ('trialing','active','past_due') and s.current_period_end <= now())
            or (p_state = 'expiring' and s.status in ('trialing','active','past_due') and s.current_period_end > now()
                                         and s.current_period_end <= now() + interval '14 days')
            or (p_state in ('trialing','active','past_due','cancelled','expired') and s.status = p_state))
     order by rn
     limit p_page_size offset (p_page - 1) * p_page_size
  ) x;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', p_page, 'page_size', p_page_size);
end $$;

-- ======================= admin_assign_subscription =======================
-- Replaces the company's live (or stale) subscription with a new one, in one transaction.
create or replace function public.admin_assign_subscription(
  p_company uuid, p_plan_code text, p_billing_interval text, p_status text, p_period_days integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company public.companies%rowtype;
  v_plan public.plans%rowtype;
  v_old record;
  v_new uuid;
  v_now timestamptz := now();
  v_end timestamptz;
begin
  perform app_private.assert_platform(array['super_admin','billing']);

  if p_billing_interval is null or p_billing_interval not in ('monthly','yearly') then
    raise exception 'invalid billing interval' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('trialing','active') then
    raise exception 'invalid subscription status' using errcode = '22023';
  end if;
  if p_period_days is null or p_period_days < 1 or p_period_days > 1830 then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  select * into v_company from public.companies where id = p_company and deleted_at is null for update;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  if v_company.status = 'cancelled' then raise exception 'company cancelled' using errcode = '23514'; end if;

  select * into v_plan from public.plans where code = p_plan_code and is_active;
  if not found then raise exception 'unknown plan' using errcode = '22023'; end if;

  v_end := v_now + make_interval(days => p_period_days);

  -- the unique index counts a stale live-status row as live, so retire it (or the live one) first; history is kept
  select s.id, pl.code as plan_code, s.status, s.current_period_end into v_old
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
   where s.company_id = p_company and s.status in ('trialing','active','past_due')
   limit 1;
  if v_old.id is not null then
    update public.subscriptions set status = 'expired' where id = v_old.id;
  end if;

  insert into public.subscriptions (company_id, plan_id, status, billing_interval, trial_ends_at, current_period_start, current_period_end)
  values (p_company, v_plan.id, p_status, p_billing_interval, case when p_status = 'trialing' then v_end end, v_now, v_end)
  returning id into v_new;

  perform app_private.audit_platform(p_company, 'subscription.assigned', 'subscription', v_new,
    case when v_old.id is null then null
         else jsonb_build_object('subscription_id', v_old.id, 'plan_code', v_old.plan_code, 'status', v_old.status,
                                 'period_end', v_old.current_period_end) end,
    jsonb_build_object('plan_code', v_plan.code, 'status', p_status, 'billing_interval', p_billing_interval,
                       'period_end', v_end, 'replaced_subscription_id', v_old.id));

  return jsonb_build_object('subscription_id', v_new, 'replaced_subscription_id', v_old.id, 'period_end', v_end);
end $$;

-- ======================= admin_set_subscription_status =======================
create or replace function public.admin_set_subscription_status(p_subscription uuid, p_status text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_old public.subscriptions%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_action text;
  v_ok boolean;
begin
  perform app_private.assert_platform(array['super_admin','billing']);
  if p_status is null or p_status not in ('active','past_due','cancelled','expired') then
    raise exception 'invalid subscription status' using errcode = '22023';
  end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'reason required' using errcode = '22023'; end if;

  -- lock order: company first, then subscription (same as assign)
  select s.company_id into v_company
    from public.subscriptions s join public.companies c on c.id = s.company_id and c.deleted_at is null
   where s.id = p_subscription;
  if v_company is null then raise exception 'subscription not found' using errcode = 'P0002'; end if;
  perform 1 from public.companies where id = v_company for update;
  select * into v_old from public.subscriptions where id = p_subscription for update;

  v_ok := case v_old.status
    when 'trialing'  then p_status in ('active','cancelled','expired')
    when 'active'    then p_status in ('past_due','cancelled','expired')
    when 'past_due'  then p_status in ('active','cancelled','expired')
    else false end;           -- cancelled and expired are terminal
  if not v_ok then raise exception 'invalid subscription status transition' using errcode = '23514'; end if;

  if p_status in ('active','past_due') and v_old.current_period_end <= now() then
    raise exception 'subscription period ended' using errcode = '23514';
  end if;
  if p_status in ('cancelled','expired') and (v_reason is null or length(v_reason) < 3) then
    raise exception 'reason required' using errcode = '22023';
  end if;

  update public.subscriptions
     set status = p_status,
         cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end
   where id = p_subscription;

  v_action := case p_status when 'cancelled' then 'subscription.cancelled' when 'expired' then 'subscription.expired'
                            else 'subscription.status_changed' end;
  perform app_private.audit_platform(v_company, v_action, 'subscription', p_subscription,
    jsonb_build_object('status', v_old.status, 'period_end', v_old.current_period_end),
    jsonb_build_object('status', p_status, 'reason', v_reason));

  return jsonb_build_object('id', p_subscription, 'status', p_status, 'previous_status', v_old.status);
end $$;

-- ======================= admin_set_subscription_period =======================
-- New end = base + p_days, where base is now() (p_from = 'now') or the current end (p_from = 'current_end').
create or replace function public.admin_set_subscription_period(p_subscription uuid, p_days integer, p_from text default 'now')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid;
  v_old public.subscriptions%rowtype;
  v_new_end timestamptz;
begin
  perform app_private.assert_platform(array['super_admin','billing']);
  if p_from is null or p_from not in ('now','current_end') then raise exception 'invalid period' using errcode = '22023'; end if;
  if p_days is null or p_days < 1 or p_days > 1830 then raise exception 'invalid period' using errcode = '22023'; end if;

  select s.company_id into v_company
    from public.subscriptions s join public.companies c on c.id = s.company_id and c.deleted_at is null
   where s.id = p_subscription;
  if v_company is null then raise exception 'subscription not found' using errcode = 'P0002'; end if;
  perform 1 from public.companies where id = v_company for update;
  select * into v_old from public.subscriptions where id = p_subscription for update;

  if v_old.status not in ('trialing','active','past_due') then
    raise exception 'subscription not extendable' using errcode = '23514';
  end if;

  v_new_end := (case p_from when 'current_end' then v_old.current_period_end else now() end) + make_interval(days => p_days);
  if v_new_end <= now() or v_new_end <= v_old.current_period_start then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  update public.subscriptions
     set current_period_end = v_new_end,
         trial_ends_at = case when status = 'trialing' then v_new_end else trial_ends_at end
   where id = p_subscription;

  perform app_private.audit_platform(v_company, 'subscription.period_changed', 'subscription', p_subscription,
    jsonb_build_object('period_end', v_old.current_period_end),
    jsonb_build_object('period_end', v_new_end, 'days', p_days, 'from', p_from));

  return jsonb_build_object('id', p_subscription, 'period_end', v_new_end, 'previous_period_end', v_old.current_period_end);
end $$;

-- ======================= admin_expire_subscriptions =======================
-- Flips every stale live-status row (period ended) to 'expired' and audits each one. Idempotent: nothing stale, nothing written.
create or replace function public.admin_expire_subscriptions() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  perform app_private.assert_platform(array['super_admin','billing']);
  for r in
    select s.id, s.company_id, s.status, s.current_period_end
      from public.subscriptions s
     where s.status in ('trialing','active','past_due') and s.current_period_end <= now()
     order by s.id
       for update skip locked
  loop
    update public.subscriptions set status = 'expired' where id = r.id;
    perform app_private.audit_platform(r.company_id, 'subscription.expired', 'subscription', r.id,
      jsonb_build_object('status', r.status, 'period_end', r.current_period_end),
      jsonb_build_object('status', 'expired', 'reason', 'period_ended'));
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('expired', v_n);
end $$;

-- ======================= grants =======================
revoke all on function public.admin_list_subscriptions(text, text, text, text, integer, integer) from public, anon;
revoke all on function public.admin_assign_subscription(uuid, text, text, text, integer) from public, anon;
revoke all on function public.admin_set_subscription_status(uuid, text, text) from public, anon;
revoke all on function public.admin_set_subscription_period(uuid, integer, text) from public, anon;
revoke all on function public.admin_expire_subscriptions() from public, anon;
grant execute on function public.admin_list_subscriptions(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_assign_subscription(uuid, text, text, text, integer) to authenticated;
grant execute on function public.admin_set_subscription_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_subscription_period(uuid, integer, text) to authenticated;
grant execute on function public.admin_expire_subscriptions() to authenticated;
