-- 0021: Phase 8 follow-up - the public marketplace lists only trips whose company can actually take bookings.
--
-- PROBLEM (found in 8E, documented in docs/SMOKE-TESTS.md)
--   create_my_booking refuses a company without a live subscription (42501 'no active subscription', via the
--   entitlement checks of 0004/0015), but public_search_trips and public_trip_stops (0013) only checked company status,
--   so customers saw trips they could never book.
--
-- RULE
--   A trip is LISTED only if its company has a live subscription: the single definition app_private.live_subscription()
--   (0015): status in (trialing, active, past_due) AND current_period_end > now(). So listing eligibility equals
--   booking eligibility for subscription reasons; there is no second definition that could drift.
--
-- WHAT DOES NOT CHANGE (on purpose)
--   * app_private.is_trip_public() is NOT touched. create_my_booking / 0013b still call it exactly as before, and the
--     subscription refusal for a booking still comes from the entitlement checks inside the booking path. Hiding a trip
--     from search is presentation; it is never what protects a booking. A direct create_my_booking call for an expired
--     company is still refused with 42501 (pinned in supabase/tests/17_lifecycle_policy_tests.sql).
--   * Company staff, drivers, platform admins and customers' own bookings/tickets: untouched (they do not use these
--     two functions). An expired company stays fully reachable for staff so it can be restored.
--   * Signatures, return columns, grants and security-definer settings of the two functions are identical to 0013.
--   * Tenant isolation: the helper takes a company id and returns a boolean only; it reads no rows for the caller.
--
-- RUNNER NOTE: file sorts after 0020 in byte order; apply with scripts/db/apply-migrations.sh (never supabase db push).
-- ROLLBACK: re-run the two `create or replace function` statements from 0013_customer_booking_web.sql, then
--   drop function app_private.has_live_subscription(uuid);

create or replace function app_private.has_live_subscription(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app_private.live_subscription(p_company))
$$;
revoke all on function app_private.has_live_subscription(uuid) from public, anon, authenticated;

create or replace function public.public_search_trips(
  p_origin text default null, p_destination text default null, p_date date default null,
  p_company_id uuid default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  trip_id uuid, company_id uuid, company_name text, company_slug text,
  route_id uuid, origin_name text, destination_name text,
  departure_at timestamptz, arrival_at timestamptz,
  price numeric, currency char(3), capacity smallint, seats_available integer,
  max_seats_per_booking smallint, timezone text)
language sql stable security definer set search_path = '' as $$
  select t.id, c.id, c.name, c.slug::text,
         r.id, r.origin_name, r.destination_name,
         t.departure_at, t.arrival_at,
         t.price, s.currency, t.capacity, (t.capacity - t.seats_booked)::integer,
         s.max_seats_per_booking, s.timezone
  from public.trips t
  join public.companies c        on c.id = t.company_id
  join public.company_settings s on s.company_id = t.company_id
  join public.website_settings w on w.company_id = t.company_id
  join public.routes r           on r.company_id = t.company_id and r.id = t.route_id
  where t.status = 'scheduled'
    and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
    and s.booking_enabled and w.is_published
    and c.deleted_at is null and c.status in ('trial', 'active')
    and app_private.has_live_subscription(c.id)
    and r.is_active and r.deleted_at is null
    and (p_company_id  is null or t.company_id = p_company_id)
    and (p_origin      is null or lower(r.origin_name)      = lower(trim(p_origin)))
    and (p_destination is null or lower(r.destination_name) = lower(trim(p_destination)))
    and (p_date        is null or (t.departure_at at time zone s.timezone)::date = p_date)
  order by t.departure_at, t.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.public_search_trips(text, text, date, uuid, integer, integer) from public;
grant execute on function public.public_search_trips(text, text, date, uuid, integer, integer) to anon, authenticated;

create or replace function public.public_trip_stops(p_trip_id uuid)
returns table (stop_id uuid, name text, address text, stop_order smallint, stop_type text, offset_minutes smallint)
language sql stable security definer set search_path = '' as $$
  select rs.id, rs.name, rs.address, rs.stop_order, rs.stop_type, rs.offset_minutes
  from public.trips t
  join public.route_stops rs on rs.company_id = t.company_id and rs.route_id = t.route_id and rs.is_active
  where t.id = p_trip_id and app_private.is_trip_public(t.id) and app_private.has_live_subscription(t.company_id)
  order by rs.stop_order
$$;
revoke all on function public.public_trip_stops(uuid) from public;
grant execute on function public.public_trip_stops(uuid) to anon, authenticated;
