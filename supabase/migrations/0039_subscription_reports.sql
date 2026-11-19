-- 0039: route subscriptions PHASE E2: company reports (read only).
--
-- Three report functions. Each takes the company the dashboard is acting for, but AUTHORIZATION never trusts it: the caller must hold
-- analytics.read in THAT company (app_private.has_permission), otherwise the answer is the same 'company not found' as for a company that
-- does not exist. Nothing is written. Ranges are limited to 366 days so a report cannot become a table scan on demand.
--
-- DEFINITIONS (shown on the page too)
--   revenue   = price of subscriptions approved in the range (paid_at, company-local day). A later revoke does not remove it: the money was received.
--   active    = status active and valid_to not before today (company-local).
--   no-show   = a subscriber booking (not cancelled) on a trip that already departed whose ticket was never boarded.
--   scans     = rows of route_subscription_scans by service_date (company-local day of the trip).
--   return intent = subscriber go bookings of a trip that were booked together with a return leg (same round_trip_group_id).
-- ROLLBACK: drop function public.subscription_plan_report(uuid, date, date), public.subscription_daily_report(uuid, date, date),
--   public.subscription_trip_demand(uuid, integer), app_private.report_guard(uuid, date, date).
-- RUNNER NOTE: apply BEFORE deploying Phase E2 code. Requires 0034, 0037, 0038.
set search_path = public, extensions;

create function app_private.report_guard(p_company uuid, p_from date, p_to date) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_company is null or not app_private.has_permission(p_company, 'analytics.read') then
    raise exception 'company not found' using errcode = 'P0002'; end if;
  if p_from is not null and (p_to is null or p_to < p_from or p_to - p_from > 366) then
    raise exception 'invalid range' using errcode = '22023'; end if;
end $$;
revoke all on function app_private.report_guard(uuid, date, date) from public, anon, authenticated;

-- 1. per plan
create function public.subscription_plan_report(p_company uuid, p_from date, p_to date)
returns table (plan_id uuid, plan_name text, route_name text, is_active boolean, active_now integer, pending_now integer, new_in_range integer, revenue_in_range numeric, currency text)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date;
begin
  perform app_private.report_guard(p_company, p_from, p_to);
  v_today := app_private.company_day(p_company, now());
  return query
    select pl.id, pl.name, r.name, pl.is_active,
           (count(*) filter (where s.status = 'active' and s.valid_to >= v_today))::integer,
           (count(*) filter (where s.status = 'pending'))::integer,
           (count(*) filter (where s.paid_at is not null and app_private.company_day(p_company, s.paid_at) between p_from and p_to))::integer,
           coalesce(sum(s.price) filter (where s.paid_at is not null and app_private.company_day(p_company, s.paid_at) between p_from and p_to), 0),
           (select cs.currency::text from public.company_settings cs where cs.company_id = p_company)
    from public.route_plans pl
    join public.routes r on r.company_id = pl.company_id and r.id = pl.route_id
    left join public.route_subscriptions s on s.company_id = pl.company_id and s.plan_id = pl.id
    where pl.company_id = p_company and pl.deleted_at is null
    group by pl.id, pl.name, r.name, pl.is_active
    order by 6 desc, pl.name, pl.id
    limit 200;
end $$;
revoke all on function public.subscription_plan_report(uuid, date, date) from public, anon;
grant execute on function public.subscription_plan_report(uuid, date, date) to authenticated;

-- 2. per day: scans, bookings, no-shows
create function public.subscription_daily_report(p_company uuid, p_from date, p_to date)
returns table (service_date date, go_scans integer, return_scans integer, go_booked integer, return_booked integer, no_shows integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.report_guard(p_company, p_from, p_to);
  return query
    with days as (select d::date as d from generate_series(p_from, p_to, interval '1 day') d),
    scans as (
      select x.service_date as d, (count(*) filter (where x.direction = 'go'))::integer as g, (count(*) filter (where x.direction = 'return'))::integer as r
      from public.route_subscription_scans x where x.company_id = p_company and x.service_date between p_from and p_to group by 1),
    booked as (
      select app_private.company_day(p_company, t.departure_at) as d,
             (count(*) filter (where t.route_id = pl.route_id))::integer as g,
             (count(*) filter (where t.route_id <> pl.route_id))::integer as r,
             (count(*) filter (where t.departure_at < now() and not exists (
                select 1 from public.tickets k where k.company_id = b.company_id and k.booking_id = b.id and k.status = 'boarded')))::integer as ns
      from public.bookings b
      join public.route_subscriptions s on s.company_id = b.company_id and s.id = b.subscription_id
      join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
      join public.trips t on t.company_id = b.company_id and t.id = b.trip_id
      where b.company_id = p_company and b.subscription_id is not null and b.status <> 'cancelled'
        and t.departure_at >= (p_from::timestamp - interval '1 day') and t.departure_at < (p_to::timestamp + interval '2 days')
      group by 1)
    select days.d, coalesce(scans.g, 0), coalesce(scans.r, 0), coalesce(booked.g, 0), coalesce(booked.r, 0), coalesce(booked.ns, 0)
    from days left join scans on scans.d = days.d left join booked on booked.d = days.d
    order by days.d;
end $$;
revoke all on function public.subscription_daily_report(uuid, date, date) from public, anon;
grant execute on function public.subscription_daily_report(uuid, date, date) to authenticated;

-- 3. capacity planning: upcoming trips carrying subscribers
create function public.subscription_trip_demand(p_company uuid, p_days integer default 7)
returns table (trip_id uuid, route_name text, departure_at timestamptz, capacity integer, seats_available integer, subscriber_seats integer, return_intent integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.report_guard(p_company, null, null);
  if p_days is null or p_days < 1 or p_days > 31 then raise exception 'invalid range' using errcode = '22023'; end if;
  return query
    select t.id, r.name, t.departure_at, t.capacity::integer, (t.capacity - t.seats_booked)::integer,
           coalesce(sum(b.seats_count), 0)::integer,
           (count(*) filter (where b.trip_leg = 'outbound' and b.round_trip_group_id is not null))::integer
    from public.trips t
    join public.routes r on r.company_id = t.company_id and r.id = t.route_id
    join public.bookings b on b.company_id = t.company_id and b.trip_id = t.id and b.subscription_id is not null and b.status in ('pending', 'confirmed')
    where t.company_id = p_company and t.status in ('scheduled', 'boarding') and t.departure_at >= now() and t.departure_at < now() + make_interval(days => p_days)
    group by t.id, r.name, t.departure_at, t.capacity, t.seats_booked
    order by t.departure_at, t.id
    limit 100;
end $$;
revoke all on function public.subscription_trip_demand(uuid, integer) from public, anon;
grant execute on function public.subscription_trip_demand(uuid, integer) to authenticated;

-- Platform usage: one row of subscription counts for a company, for the MALAKY admin company page.
-- Platform staff only (app_private.is_platform_user()); anyone else gets 'company not found'. Counts only, no member data.
create or replace function public.platform_subscription_usage(p_company uuid)
returns table (plans integer, active integer, pending integer, scans_30d integer, revenue_30d numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not app_private.is_platform_user() then raise exception 'company not found' using errcode = 'P0002'; end if;
  return query
    select (select count(*) from public.route_plans rp where rp.company_id = p_company and rp.is_active and rp.deleted_at is null)::integer,
           (select count(*) from public.route_subscriptions s where s.company_id = p_company and s.status = 'active')::integer,
           (select count(*) from public.route_subscriptions s where s.company_id = p_company and s.status = 'pending')::integer,
           (select count(*) from public.route_subscription_scans sc where sc.company_id = p_company and sc.scanned_at >= now() - interval '30 days')::integer,
           coalesce((select sum(s.price) from public.route_subscriptions s where s.company_id = p_company and s.paid_at >= now() - interval '30 days'), 0);
end $$;
revoke all on function public.platform_subscription_usage(uuid) from public, anon;
grant execute on function public.platform_subscription_usage(uuid) to authenticated;
