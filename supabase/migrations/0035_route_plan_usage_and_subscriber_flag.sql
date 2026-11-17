-- 0035: route subscriptions PHASE B support (dashboard).
--
-- WHAT
--   1. my_plan_usage() also reports max_route_plans (used = live plans of the caller company). Body otherwise identical to 0033.
--   2. booking_list gains ONE column at the end, is_subscriber (bookings.subscription_id is not null), so staff screens can show
--      the "Subscriber" marker. Still SECURITY INVOKER: RLS of every underlying table applies.
-- ROLLBACK: re-run my_plan_usage from 0033; recreate booking_list from 0032 (drop view public.booking_list first, a view cannot lose a column).
-- RUNNER NOTE: apply only with scripts/db/apply-migrations.sh, BEFORE deploying the Phase B code. Requires 0034.
set search_path = public, extensions;

create or replace function public.my_plan_usage(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_plan uuid;
  v_tz text;
  v_limits jsonb := '{}'::jsonb;
  v_months jsonb := '{}'::jsonb;
  v_key text;
  v_lim integer;
  v_found boolean;
  v_used bigint;
  v_m0 timestamp;
  k int;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_company is null or not exists (select 1 from app_private.current_company_ids() c where c = p_company) then
    raise exception 'company not found' using errcode = 'P0002'; end if;

  select ls.plan_id into v_plan from app_private.live_subscription(p_company) ls;
  if v_plan is null then return jsonb_build_object('status', 'no_subscription'); end if;

  foreach v_key in array array['max_users', 'max_buses', 'max_drivers', 'max_routes', 'max_trips_per_month', 'max_route_plans'] loop
    v_found := null;
    select true, pe.int_value into v_found, v_lim from public.plan_entitlements pe where pe.plan_id = v_plan and pe.key = v_key;
    if v_found is null then v_lim := 0; end if;
    v_used := case v_key
      when 'max_users'   then (select count(*) from public.company_users x where x.company_id = p_company)
      when 'max_buses'   then (select count(*) from public.buses x where x.company_id = p_company)
      when 'max_drivers' then (select count(*) from public.drivers x where x.company_id = p_company)
      when 'max_routes'  then (select count(*) from public.routes x where x.company_id = p_company and x.deleted_at is null and (x.return_route_id is null or x.id < x.return_route_id))   -- a pair counts once (0033)
      when 'max_route_plans' then (select count(*) from public.route_plans x where x.company_id = p_company and x.deleted_at is null)
      else null end;
    v_limits := v_limits || jsonb_build_object(v_key, jsonb_build_object('limit', v_lim, 'used', v_used));
  end loop;

  select coalesce(cs.timezone, 'UTC') into v_tz from public.company_settings cs where cs.company_id = p_company;
  v_tz := coalesce(v_tz, 'UTC');
  v_m0 := date_trunc('month', now() at time zone v_tz);
  for k in 0 .. 3 loop
    select count(*) into v_used from public.trips t
     where t.company_id = p_company and t.status <> 'cancelled'
       and date_trunc('month', t.departure_at at time zone v_tz) = v_m0 + make_interval(months => k);
    v_months := v_months || jsonb_build_object(to_char(v_m0 + make_interval(months => k), 'YYYY-MM'), v_used);
  end loop;
  -- the per-month entry carries the limit; `used` for the current month is repeated for simple callers
  v_limits := jsonb_set(v_limits, '{max_trips_per_month,used}', to_jsonb((v_months -> to_char(v_m0, 'YYYY-MM'))::bigint));

  return jsonb_build_object('status', 'ok', 'limits', v_limits, 'trip_months', v_months);
end $$;
revoke all on function public.my_plan_usage(uuid) from public, anon;
grant execute on function public.my_plan_usage(uuid) to authenticated;

create or replace view public.booking_list with (security_invoker = true) as
select b.id, b.company_id, b.reference, b.trip_id, b.customer_id, b.seats_count, b.unit_price, b.total_amount, b.amount_paid,
       b.currency, b.status, b.payment_status, b.source, b.notes, b.created_at,
       t.departure_at as trip_departure_at, t.status as trip_status, t.route_id, r.name as route_name,
       c.full_name as customer_name, c.phone as customer_phone, c.email::text as customer_email,
       c.student_id as customer_student_id, c.university as customer_university,
       coalesce(k.total, 0)::int as tickets_total, coalesce(k.boarded, 0)::int as tickets_boarded,
       case when coalesce(k.total, 0) = 0 or coalesce(k.boarded, 0) = 0 then 'not_boarded'
            when k.boarded >= k.total then 'boarded'
            else 'partial' end as boarding_status,
       (b.subscription_id is not null) as is_subscriber
  from public.bookings b
  left join public.trips t     on t.company_id = b.company_id and t.id = b.trip_id
  left join public.routes r    on r.company_id = t.company_id and r.id = t.route_id
  left join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
  left join lateral (
    select count(*) filter (where tk.status <> 'void') as total, count(*) filter (where tk.status = 'boarded') as boarded
      from public.tickets tk where tk.company_id = b.company_id and tk.booking_id = b.id
  ) k on true;
revoke all on public.booking_list from public, anon;
grant select on public.booking_list to authenticated;

-- 3. route_subscription_list: the staff inbox read model (request + plan name + route name). SECURITY INVOKER, so the RLS of
--    route_subscriptions (bookings.read), route_plans and routes (routes.read) applies to the caller. A member never reaches it
--    through the company dashboard; members read their own rows from route_subscriptions directly (own_select policy).
create or replace view public.route_subscription_list with (security_invoker = true) as
select s.id, s.company_id, s.plan_id, p.name as plan_name, p.route_id, r.name as route_name,
       s.masar_id, s.member_name, s.member_phone, s.status, s.price, s.currency,
       s.valid_from, s.valid_to, s.paid_at, s.requested_at, s.decided_at, s.decision_note
  from public.route_subscriptions s
  left join public.route_plans p on p.company_id = s.company_id and p.id = s.plan_id
  left join public.routes r      on r.company_id = p.company_id and r.id = p.route_id;
revoke all on public.route_subscription_list from public, anon;
grant select on public.route_subscription_list to authenticated;
comment on view public.route_subscription_list is 'Staff subscription inbox. SECURITY INVOKER: RLS of the underlying tables applies to the caller.';
-- ROLLBACK (3): drop view public.route_subscription_list;
