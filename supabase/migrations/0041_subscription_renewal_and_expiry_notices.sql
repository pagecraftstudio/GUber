-- 0041 (route subscriptions, Phase E3): renewal before expiry, expiry notices, staff "expiring soon" list.
--
-- 1. RENEWAL BEFORE EXPIRY. A member may request the same plan again during the last N days (app_private.subscription_notice_days(), 7)
--    of an active subscription. Approval starts the new period the day AFTER the current one ends (never overlapping), so a renewal
--    is a second, future-dated 'active' row. Only duration plans can be renewed early: a fixed-window plan has one period.
--    The old rule "one open row per plan and member" becomes "one PENDING row per plan and member"; non-overlap of active rows is
--    guaranteed by decide_route_subscription (it locks the request and starts after the latest active row of the same plan and member).
-- 2. EXPIRY NOTICES. A nightly job writes one in-app notification (table notifications, channel in_app) per subscription that ends
--    within N days and has no renewal pending or queued. One per subscription (unique index), in the member's language. Members read
--    and mark them read only through my_notices() / mark_my_notices_read() (their own rows).
-- 3. subscriptions_expiring(): staff list (bookings.read) of active subscriptions ending within N days, with the phone and language
--    the dashboard needs for a ready-to-send WhatsApp message. Nothing is sent by the platform.
-- ROLLBACK: drop functions public.subscriptions_expiring(uuid, integer), public.my_notices(integer), public.mark_my_notices_read(uuid[]), public.my_renewable_subscriptions(),
--   app_private.notify_expiring_subscriptions(), app_private.subscription_notice_days(); cron.unschedule('notify-expiring-subscriptions');
--   drop index route_subscriptions_one_pending_uq, notifications_expiring_uq;
--   create unique index route_subscriptions_one_open_uq on route_subscriptions(plan_id, user_id) where status in ('pending','active')
--   (only valid while no member has two active rows for one plan); restore request/decide from 0034.
-- RUNNER NOTE: apply BEFORE deploying the code that calls it. Requires 0034-0040.
set search_path = public, extensions;

create function app_private.subscription_notice_days() returns integer language sql immutable as $$ select 7 $$;
revoke all on function app_private.subscription_notice_days() from public, anon, authenticated;

-- ---- 1. renewal ----
drop index public.route_subscriptions_one_open_uq;
create unique index route_subscriptions_one_pending_uq on public.route_subscriptions(plan_id, user_id) where status = 'pending';
create index route_subscriptions_member_plan_idx on public.route_subscriptions(plan_id, user_id, valid_to) where status = 'active';

create or replace function public.request_route_subscription(p_plan_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_pl public.route_plans%rowtype; v_p public.profiles%rowtype; v_phone text; v_cur char(3); v_id uuid;
        v_today date; v_last date;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('booking.create');
  select * into v_p from public.profiles p where p.id = v_uid and p.is_active;
  if not found then raise exception 'account disabled' using errcode = '42501'; end if;
  if not app_private.is_plan_public(p_plan_id) then raise exception 'plan not found' using errcode = 'P0002'; end if;
  select * into v_pl from public.route_plans pl where pl.id = p_plan_id;
  v_phone := app_private.normalize_phone(v_p.phone);
  if v_phone is null then raise exception 'a valid phone number is required on your profile' using errcode = '22023'; end if;
  v_today := app_private.company_day(v_pl.company_id, now());
  -- a lapsed active subscription must not block a renewal
  update public.route_subscriptions set status = 'expired'
   where plan_id = p_plan_id and user_id = v_uid and status = 'active' and valid_to < v_today;
  -- still running: only a duration plan, and only inside the renewal window
  select max(s.valid_to) into v_last from public.route_subscriptions s where s.plan_id = p_plan_id and s.user_id = v_uid and s.status = 'active';
  if v_last is not null then
    if v_pl.validity_type <> 'duration' then
      raise exception 'you already have an active subscription for this plan' using errcode = '23505'; end if;
    if v_last > v_today + app_private.subscription_notice_days() then
      raise exception 'renewal opens % days before your subscription ends', app_private.subscription_notice_days() using errcode = '23514'; end if;
  end if;
  select s.currency into v_cur from public.company_settings s where s.company_id = v_pl.company_id;
  begin
    insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, price, currency)
    values (v_pl.company_id, p_plan_id, v_uid, v_p.masar_id, v_p.full_name, v_phone, v_pl.price, v_cur) returning id into v_id;
  exception when unique_violation then
    raise exception 'you already have an open request or active subscription for this plan' using errcode = '23505';
  end;
  perform app_private.write_audit('customer', v_pl.company_id, 'route_subscription.requested', 'route_subscription', v_id,
    jsonb_build_object('plan_id', p_plan_id, 'price', v_pl.price, 'renewal', v_last is not null));
  return v_id;
end $$;

create or replace function public.decide_route_subscription(p_id uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.route_subscriptions%rowtype; v_pl public.route_plans%rowtype; v_today date; v_from date; v_to date; v_prev date;
        v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_s from public.route_subscriptions s where s.id = p_id for update;
  if not found or not app_private.has_permission(v_s.company_id, 'bookings.write') then
    raise exception 'subscription not found' using errcode = 'P0002'; end if;
  if v_s.status <> 'pending' then raise exception 'only a pending request can be decided' using errcode = '23514'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  if p_approve is null then raise exception 'decision required' using errcode = '22023'; end if;
  if p_approve then
    select * into v_pl from public.route_plans pl where pl.company_id = v_s.company_id and pl.id = v_s.plan_id;
    v_today := app_private.company_day(v_s.company_id, now());
    if v_pl.validity_type = 'duration' then
      -- a renewal starts the day after the member's latest active period ends; otherwise today
      select max(a.valid_to) into v_prev from public.route_subscriptions a
       where a.plan_id = v_s.plan_id and a.user_id = v_s.user_id and a.status = 'active' and a.id <> p_id;
      v_from := greatest(v_today, coalesce(v_prev + 1, v_today));
      v_to := (v_from + make_interval(months => v_pl.duration_months))::date - 1;
    else
      if v_pl.ends_on < v_today then raise exception 'plan period already ended' using errcode = '23514'; end if;
      v_from := greatest(v_pl.starts_on, v_today); v_to := v_pl.ends_on;
    end if;
    update public.route_subscriptions set status = 'active', valid_from = v_from, valid_to = v_to, paid_at = now(),
           decided_at = now(), decided_by = auth.uid(), decision_note = v_note where id = p_id;
  else
    update public.route_subscriptions set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_note = v_note where id = p_id;
  end if;
  perform app_private.write_audit('company_user', v_s.company_id,
    case when p_approve then 'route_subscription.approved' else 'route_subscription.rejected' end, 'route_subscription', p_id,
    jsonb_build_object('plan_id', v_s.plan_id));
  return jsonb_build_object('id', p_id, 'status', case when p_approve then 'active' else 'rejected' end, 'valid_from', v_from, 'valid_to', v_to);
end $$;

-- ---- 2. expiry notices ----
create unique index notifications_expiring_uq on public.notifications(related_entity_id) where template_key = 'subscription.expiring';

create function app_private.notify_expiring_subscriptions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with x as (
    insert into public.notifications (company_id, recipient_user_id, channel, template_key, subject, body, related_entity_type, related_entity_id, status, sent_at)
    select s.company_id, s.user_id, 'in_app', 'subscription.expiring',
           case when p.locale = 'en' then 'Your subscription ends soon' else 'ينتهي اشتراكك قريباً' end,
           case when p.locale = 'en'
                then format('Your "%s" subscription on %s ends on %s. Renew from My subscriptions to keep riding.', pl.name, r.name, to_char(s.valid_to, 'YYYY-MM-DD'))
                else format('ينتهي اشتراكك "%s" على خط %s بتاريخ %s. جدّد اشتراكك من صفحة اشتراكاتي لتواصل الركوب.', pl.name, r.name, to_char(s.valid_to, 'YYYY-MM-DD')) end,
           'route_subscription', s.id, 'sent', now()
      from public.route_subscriptions s
      join public.profiles p on p.id = s.user_id and p.is_active
      join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
      join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
     where s.status = 'active'
       and s.valid_to between app_private.company_day(s.company_id, now()) and app_private.company_day(s.company_id, now()) + app_private.subscription_notice_days()
       and not exists (select 1 from public.route_subscriptions o
                        where o.plan_id = s.plan_id and o.user_id = s.user_id and o.id <> s.id
                          and (o.status = 'pending' or (o.status = 'active' and o.valid_from > s.valid_to)))
    on conflict (related_entity_id) where template_key = 'subscription.expiring' do nothing
    returning 1)
  select count(*) into n from x;
  return n;
end $$;
revoke all on function app_private.notify_expiring_subscriptions() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'notify-expiring-subscriptions';
    perform cron.schedule('notify-expiring-subscriptions', '0 6 * * *', 'select app_private.notify_expiring_subscriptions()');
  else
    raise notice 'pg_cron is not available: enable it, then run: select cron.schedule(''notify-expiring-subscriptions'', ''0 6 * * *'', ''select app_private.notify_expiring_subscriptions()'')';
  end if;
end $cron$;

create function public.my_notices(p_limit integer default 20)
returns table (id uuid, subject text, body text, created_at timestamptz, is_read boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select n.id, n.subject, n.body, n.created_at, n.status = 'read'
      from public.notifications n
     where n.recipient_user_id = auth.uid() and n.channel = 'in_app'
       and (n.company_id is null or app_private.is_company_active(n.company_id))
     order by n.created_at desc, n.id
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

create function public.mark_my_notices_read(p_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  with x as (
    update public.notifications set status = 'read', read_at = now()
     where recipient_user_id = auth.uid() and channel = 'in_app' and status <> 'read' and (p_ids is null or id = any(p_ids))
    returning 1)
  select count(*) into n from x;
  return n;
end $$;

-- ---- 3. staff list ----
create function public.subscriptions_expiring(p_company uuid, p_days integer default null)
returns table (id uuid, masar_id text, member_name text, member_phone text, member_locale text, company_name text, plan_name text,
               route_name text, valid_to date, days_left integer, renewal_pending boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date; v_days integer := coalesce(p_days, app_private.subscription_notice_days());
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_company is null or not app_private.has_permission(p_company, 'bookings.read') then
    raise exception 'company not found' using errcode = 'P0002'; end if;
  if v_days < 1 or v_days > 60 then raise exception 'invalid range' using errcode = '22023'; end if;
  v_today := app_private.company_day(p_company, now());
  return query
    select s.id, s.masar_id, s.member_name, s.member_phone, p.locale, c.name, pl.name, r.name, s.valid_to, (s.valid_to - v_today)::integer,
           exists (select 1 from public.route_subscriptions o where o.plan_id = s.plan_id and o.user_id = s.user_id and o.status = 'pending')
      from public.route_subscriptions s
      join public.companies c on c.id = s.company_id
      join public.profiles p on p.id = s.user_id
      join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
      join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
     where s.company_id = p_company and s.status = 'active' and s.valid_to between v_today and v_today + v_days
       and not exists (select 1 from public.route_subscriptions o where o.plan_id = s.plan_id and o.user_id = s.user_id
                         and o.id <> s.id and o.status = 'active' and o.valid_from > s.valid_to)
     order by s.valid_to, s.id
     limit 200;
end $$;

-- the member's own subscriptions that can be renewed right now (same rules request_route_subscription applies), so the UI never guesses the window
create function public.my_renewable_subscriptions() returns table (subscription_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select s.id
      from public.route_subscriptions s
      join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
     where s.user_id = auth.uid() and s.status = 'active' and pl.validity_type = 'duration' and app_private.is_plan_public(pl.id)
       and s.valid_to between app_private.company_day(s.company_id, now()) and app_private.company_day(s.company_id, now()) + app_private.subscription_notice_days()
       and not exists (select 1 from public.route_subscriptions o where o.plan_id = s.plan_id and o.user_id = s.user_id and o.id <> s.id
                         and (o.status = 'pending' or (o.status = 'active' and o.valid_from > s.valid_to)));
end $$;

revoke all on function public.my_renewable_subscriptions() from public, anon;
grant execute on function public.my_renewable_subscriptions() to authenticated;
revoke all on function public.my_notices(integer) from public, anon;
revoke all on function public.mark_my_notices_read(uuid[]) from public, anon;
revoke all on function public.subscriptions_expiring(uuid, integer) from public, anon;
grant execute on function public.my_notices(integer) to authenticated;
grant execute on function public.mark_my_notices_read(uuid[]) to authenticated;
grant execute on function public.subscriptions_expiring(uuid, integer) to authenticated;
