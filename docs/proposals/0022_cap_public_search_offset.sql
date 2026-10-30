-- 0022 (PROPOSAL, NOT APPLIED, NOT IN supabase/migrations/): cap the public-search offset in the database.
--
-- PROBLEM: public_search_trips clamps p_limit to 100 but not p_offset. The Next.js route validates offset, the RPC does not,
--   and the RPC is callable directly with the publishable key (docs/RATE-LIMITING.md 3b). A huge offset makes Postgres
--   walk and discard that many rows per call.
-- CHANGE: offset is clamped to 0..1000. Signature, return columns, filters, grants and security settings are identical to 0021.
--   Paging beyond 1100 results is not a supported use of a marketplace listing (limit 100 x offset 1000).
-- WHAT THIS DOES NOT FIX: anonymous direct access itself (still allowed, decision B).
-- ROLLBACK: re-run the public_search_trips statement from 0021.
-- RUNNER NOTE: apply with scripts/db/apply-migrations.sh on STAGING first. Never supabase db push. Needs the owner's approval
--   before it is moved into supabase/migrations/ (immutable once applied).

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
  offset least(greatest(coalesce(p_offset, 0), 0), 1000)
$$;
revoke all on function public.public_search_trips(text, text, date, uuid, integer, integer) from public;
grant execute on function public.public_search_trips(text, text, date, uuid, integer, integer) to anon, authenticated;

