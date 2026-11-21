-- 0052 (W8): public_trip_detail(trip) - ONE bookable trip, for the booking page opened from a company website.
--
-- WHY: the booking page is opened with only a trip id (the website's "Book" button). There was no single-trip public read; search can only
--   filter by place/date/company, so finding one id would need paging through up to 1100 rows.
-- RULES: exactly the eligibility of public_search_trips (0030) - scheduled, past the cutoff, booking enabled, website published, company
--   active with a live subscription, active route - so an unknown, hidden or not-yet-public trip answers with NO ROWS, indistinguishably.
--   Same allow-listed columns as search (no internal ids beyond what search already returns). Booking itself is unchanged: create_my_booking
--   still decides everything again; this read is presentation only.
-- GRANT: anon + authenticated, like search.
-- ROLLBACK: drop function public.public_trip_detail(uuid);
-- RUNNER NOTE: requires 0030 and 0021. Apply BEFORE deploying code that calls it.
set search_path = public, extensions;

create function public.public_trip_detail(p_trip_id uuid)
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
  where t.id = p_trip_id
    and t.status = 'scheduled'
    and t.departure_at > now() + make_interval(mins => s.booking_cutoff_minutes)
    and s.booking_enabled and w.is_published
    and c.deleted_at is null and c.status in ('trial', 'active')
    and app_private.has_live_subscription(c.id)
    and r.is_active and r.deleted_at is null
$$;
revoke all on function public.public_trip_detail(uuid) from public;
grant execute on function public.public_trip_detail(uuid) to anon, authenticated;
