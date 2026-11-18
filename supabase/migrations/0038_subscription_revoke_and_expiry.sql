-- 0038: route subscriptions PHASE E1: staff revoke, nightly expiry job.
--
-- REVOKE (decided with the product owner): staff see the member's future bookings first and choose per booking: cancel it or keep it.
--   * a new status 'revoked' (the company ended it) is kept apart from 'cancelled' (the member ended it) and 'expired' (time ran out);
--   * subscription_future_bookings(sub) lists what could still be cancelled (staff, bookings.write);
--   * revoke_route_subscription(sub, booking_ids, reason) revokes and cancels exactly the chosen bookings through the existing
--     public.cancel_booking (same permission, trip-closed check, seat release trigger, audit). Kept bookings stay and keep their seat, but
--     the scan/boarding path already refuses a non-active subscription (0037), so a kept booking cannot be used as a subscriber seat.
-- EXPIRY: app_private.expire_route_subscriptions() flips lapsed active rows to 'expired' (company-local day). Bookings cannot lie past
--   valid_to (the booking RPCs enforce it), so nothing else needs cleaning. Scheduled nightly with pg_cron WHEN the extension exists
--   (Supabase: enable it under Database > Extensions; the migration only schedules it if it is available, otherwise it prints a notice).
-- ROLLBACK: drop function public.revoke_route_subscription(uuid, uuid[], text), public.subscription_future_bookings(uuid),
--   app_private.expire_route_subscriptions(); select cron.unschedule('expire-route-subscriptions') if scheduled; rows with status 'revoked'
--   must first be set to 'cancelled' before the check constraint is restored.
-- RUNNER NOTE: apply with scripts/db/apply-migrations.sh BEFORE deploying Phase E code. Requires 0034, 0037.
set search_path = public, extensions;

alter table route_subscriptions drop constraint route_subscriptions_status_check;
alter table route_subscriptions add constraint route_subscriptions_status_check
  check (status in ('pending', 'active', 'rejected', 'cancelled', 'expired', 'revoked'));
alter table route_subscriptions
  add column revoked_at timestamptz,
  add column revoked_by uuid references profiles(id) on delete set null,
  add column revoke_reason text check (revoke_reason is null or length(revoke_reason) <= 500);
alter table route_subscriptions add constraint route_subscriptions_revoked_complete
  check ((status = 'revoked') = (revoked_at is not null));

-- 1. what staff must see before revoking
create function public.subscription_future_bookings(p_subscription_id uuid)
returns table (booking_id uuid, reference text, trip_id uuid, trip_leg text, direction text, departure_at timestamptz, arrival_at timestamptz,
               origin_name text, destination_name text, status text, can_cancel boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid;
begin
  select s.company_id into v_company from public.route_subscriptions s where s.id = p_subscription_id;
  if v_company is null or not app_private.has_permission(v_company, 'bookings.write') then
    raise exception 'subscription not found' using errcode = 'P0002'; end if;
  return query
    select b.id, b.reference, t.id, b.trip_leg, case when t.route_id = pl.route_id then 'go' else 'return' end,
           t.departure_at, t.arrival_at, r.origin_name, r.destination_name, b.status,
           (t.status in ('scheduled', 'boarding') and not exists (select 1 from public.tickets k where k.company_id = b.company_id and k.booking_id = b.id and k.status = 'boarded'))
    from public.route_subscriptions s
    join public.route_plans pl on pl.company_id = s.company_id and pl.id = s.plan_id
    join public.bookings b on b.company_id = s.company_id and b.subscription_id = s.id and b.status in ('pending', 'confirmed')
    join public.trips t on t.company_id = b.company_id and t.id = b.trip_id and t.status not in ('completed', 'cancelled')
    join public.routes r on r.company_id = t.company_id and r.id = t.route_id
    where s.id = p_subscription_id
    order by t.departure_at, b.id
    limit 200;
end $$;
revoke all on function public.subscription_future_bookings(uuid) from public, anon;
grant execute on function public.subscription_future_bookings(uuid) to authenticated;

-- 2. revoke
create function public.revoke_route_subscription(p_subscription_id uuid, p_cancel_booking_ids uuid[] default '{}', p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); s public.route_subscriptions%rowtype; v_ids uuid[]; v_id uuid; v_kept integer; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(coalesce(v_reason, '')) > 500 then raise exception 'input too long' using errcode = '22023'; end if;
  select * into s from public.route_subscriptions x where x.id = p_subscription_id for update;
  if not found or not app_private.has_permission(s.company_id, 'bookings.write') then
    raise exception 'subscription not found' using errcode = 'P0002'; end if;
  if s.status <> 'active' then raise exception 'subscription is not active' using errcode = '23514'; end if;

  select coalesce(array_agg(distinct u), '{}') into v_ids from unnest(coalesce(p_cancel_booking_ids, '{}')) u;
  if cardinality(v_ids) > 200 then raise exception 'too many bookings' using errcode = '22023'; end if;
  -- every chosen booking must be one that the warning list offered as cancellable (this subscription's, future, not boarded)
  if exists (select 1 from unnest(v_ids) u where not exists (
        select 1 from public.subscription_future_bookings(s.id) f where f.booking_id = u and f.can_cancel)) then
    raise exception 'booking cannot be cancelled' using errcode = '23514'; end if;

  update public.route_subscriptions set status = 'revoked', revoked_at = now(), revoked_by = v_uid, revoke_reason = v_reason where id = s.id;
  foreach v_id in array v_ids loop
    perform public.cancel_booking(v_id, 'Subscription revoked');
  end loop;
  select count(*)::integer into v_kept from public.subscription_future_bookings(s.id);
  perform app_private.write_audit('company_user', s.company_id, 'route_subscription.revoked', 'route_subscription', s.id,
    jsonb_build_object('cancelled_bookings', cardinality(v_ids), 'kept_bookings', v_kept, 'has_reason', v_reason is not null));
  return jsonb_build_object('id', s.id, 'status', 'revoked', 'cancelled', cardinality(v_ids), 'kept', v_kept);
end $$;
revoke all on function public.revoke_route_subscription(uuid, uuid[], text) from public, anon;
grant execute on function public.revoke_route_subscription(uuid, uuid[], text) to authenticated;

-- 3. expiry
create function app_private.expire_route_subscriptions() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with x as (
    update public.route_subscriptions s set status = 'expired'
     where s.status = 'active' and s.valid_to < app_private.company_day(s.company_id, now())
    returning s.id)
  select count(*) into n from x;
  return n;
end $$;
revoke all on function app_private.expire_route_subscriptions() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-route-subscriptions';
    perform cron.schedule('expire-route-subscriptions', '10 0 * * *', 'select app_private.expire_route_subscriptions()');
  else
    raise notice 'pg_cron is not available: enable it, then run: select cron.schedule(''expire-route-subscriptions'', ''10 0 * * *'', ''select app_private.expire_route_subscriptions()'')';
  end if;
end $cron$;
