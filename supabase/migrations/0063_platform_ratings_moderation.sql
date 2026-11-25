-- 0063: platform moderation list for trip ratings (P7c follow-up).
-- 0061 shipped set_trip_rating_hidden (super_admin only, audited) but nothing that LISTS ratings, and the table has no client grants, so a moderator had no way to
-- find a rating id. This adds the one read the admin page needs.
-- RULES (all enforced here, none in the browser):
--   * super_admin only, same as hiding. Any other caller, including other platform roles, a company owner, a rider and anon: 42501.
--   * The rater is NEVER returned (no user id, no booking id, no customer name): moderators judge the stars and the trip, not the person. The columns are pinned by suite 58.
--   * Keyset paging (created_at desc, id desc), page size clamped to 1..100. Optional filters: one company, and visible / hidden / all.
--   * Reads share the 'rating.read' rate-limit bucket of 0061.
-- ROLLBACK: drop function public.platform_list_ratings(uuid, text, timestamptz, uuid, integer);
set search_path = public, extensions;

create or replace function public.platform_list_ratings(
  p_company_id uuid default null, p_visibility text default 'all', p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 50)
returns table (rating_id uuid, company_id uuid, company_name text, driver_id uuid, driver_name text, trip_id uuid, origin_name text, destination_name text,
               departure_at timestamptz, trip_stars smallint, driver_stars smallint, created_at timestamptz, hidden_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is null or app_private.platform_role() is distinct from 'super_admin' then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_visibility is null or p_visibility not in ('all', 'visible', 'hidden') then raise exception 'invalid visibility' using errcode = '22023'; end if;
  perform app_private.rate_limit_hit('rating.read');
  return query
    select r.id, r.company_id, co.name::text, r.driver_id, d.full_name::text, r.trip_id, ro.origin_name::text, ro.destination_name::text,
           t.departure_at, r.trip_stars, r.driver_stars, r.created_at, r.hidden_at
      from public.trip_ratings r
      join public.companies co on co.id = r.company_id
      join public.drivers d on d.company_id = r.company_id and d.id = r.driver_id
      join public.trips t on t.company_id = r.company_id and t.id = r.trip_id
      join public.routes ro on ro.company_id = t.company_id and ro.id = t.route_id
     where (p_company_id is null or r.company_id = p_company_id)
       and (p_visibility = 'all' or (p_visibility = 'hidden' and r.hidden_at is not null) or (p_visibility = 'visible' and r.hidden_at is null))
       and (p_before is null or r.created_at < p_before or (r.created_at = p_before and p_before_id is not null and r.id < p_before_id))
     order by r.created_at desc, r.id desc
     limit v_limit;
end $$;

revoke all on function public.platform_list_ratings(uuid, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.platform_list_ratings(uuid, text, timestamptz, uuid, integer) to authenticated;
