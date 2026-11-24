-- 0061: ratings for boarded riders (plan item 14 / P7c; decisions D13 D14 D15 at their recommended values).
-- RULES (all enforced here, none in the browser):
--   * Only the owner of a booking that has a BOARDED ticket can rate it, once (unique per booking), stars only, no edit.
--   * One submission carries two scores, trip 1..5 and driver 1..5. The driver is the one who BOARDED the rider (tickets.boarded_driver_id), falling back to
--     the trip's driver; the company comes from the trip. Neither is taken from the request.
--   * Window (D14): opens 1 hour after trips.ended_at (P7b), closes 14 days after it.
--   * D13: company rating = (trip stars + driver stars) / (2 x ratings), out of 5. Driver rating = driver stars / ratings, out of 5.
--   * D15: riders see only the COMPANY rating, and only from 5 ratings (before that it reads "New"). A driver sees own average, count, distribution.
--     Managers (drivers.read) see their drivers' ratings. The rater is never exposed: the table has no client grants at all.
--   * Aggregates are kept in the same transaction as the rating (no drift); hiding a rating (platform super_admin only, audited) reverses its part.
-- ROLLBACK: drop the functions listed at the end, the three tables, the job row 'notify-rating-requests', the event/templates 'rating.request';
--           re-create driver_my_profile() from 0060.
-- RUNNER NOTE: apply before deploying code that calls these functions.
set search_path = public, extensions;

create table public.trip_ratings (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  trip_id       uuid not null,
  booking_id    uuid not null,
  rater_user_id uuid not null references auth.users (id) on delete cascade,
  driver_id     uuid not null,
  trip_stars    smallint not null check (trip_stars between 1 and 5),
  driver_stars  smallint not null check (driver_stars between 1 and 5),
  created_at    timestamptz not null default now(),
  hidden_at     timestamptz,
  hidden_by     uuid references auth.users (id) on delete set null,
  constraint trip_ratings_booking_key unique (booking_id),
  constraint trip_ratings_trip_fk    foreign key (company_id, trip_id)    references public.trips (company_id, id),
  constraint trip_ratings_booking_fk foreign key (company_id, booking_id) references public.bookings (company_id, id),
  constraint trip_ratings_driver_fk  foreign key (company_id, driver_id)  references public.drivers (company_id, id),
  constraint trip_ratings_hidden_pair check ((hidden_at is null) = (hidden_by is null) or hidden_by is null)
);
create index trip_ratings_driver_idx on public.trip_ratings (driver_id);
create index trip_ratings_company_idx on public.trip_ratings (company_id, created_at desc);
create index trip_ratings_rater_idx on public.trip_ratings (rater_user_id);

create table public.company_rating_stats (
  company_id       uuid primary key references public.companies (id) on delete cascade,
  ratings          integer not null default 0 check (ratings >= 0),
  trip_stars_sum   bigint  not null default 0 check (trip_stars_sum >= 0),
  driver_stars_sum bigint  not null default 0 check (driver_stars_sum >= 0)
);
create table public.driver_rating_stats (
  driver_id    uuid primary key,
  company_id   uuid not null,
  ratings      integer not null default 0 check (ratings >= 0),
  stars_sum    bigint  not null default 0 check (stars_sum >= 0),
  distribution integer[] not null default '{0,0,0,0,0}' check (array_length(distribution, 1) = 5),
  constraint driver_rating_stats_driver_fk foreign key (company_id, driver_id) references public.drivers (company_id, id) on delete cascade
);
-- no client access to any of the three: every read and write goes through the security-definer functions below
alter table public.trip_ratings enable row level security;
alter table public.company_rating_stats enable row level security;
alter table public.driver_rating_stats enable row level security;
revoke all on public.trip_ratings, public.company_rating_stats, public.driver_rating_stats from public, anon, authenticated;

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description)
select v.* from (values ('rating.submit', 60, 10, 'submit_trip_rating per user per minute'), ('rating.read', 60, 60, 'rating reads per user per minute')) as v(bucket, window_seconds, max_hits, description)
 where not exists (select 1 from app_private.rate_limit_policies p where p.bucket = v.bucket);

-- ---- constants kept in one place ----
create or replace function app_private.rating_window(out opens interval, out closes interval, out min_public integer) language sql immutable set search_path = '' as
$$ select interval '1 hour', interval '14 days', 5 $$;

-- ---- aggregates: apply one rating with sign +1 (submit / unhide) or -1 (hide) ----
create or replace function app_private.rating_apply(p_company uuid, p_driver uuid, p_trip_stars integer, p_driver_stars integer, p_sign integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.company_rating_stats (company_id) values (p_company) on conflict do nothing;
  update public.company_rating_stats set ratings = ratings + p_sign, trip_stars_sum = trip_stars_sum + p_sign * p_trip_stars, driver_stars_sum = driver_stars_sum + p_sign * p_driver_stars
   where company_id = p_company;
  insert into public.driver_rating_stats (driver_id, company_id) values (p_driver, p_company) on conflict do nothing;
  update public.driver_rating_stats set ratings = ratings + p_sign, stars_sum = stars_sum + p_sign * p_driver_stars,
         distribution = (select array_agg(case when g = p_driver_stars then distribution[g] + p_sign else distribution[g] end order by g) from generate_series(1, 5) g)
   where driver_id = p_driver;
end $$;
revoke all on function app_private.rating_apply(uuid, uuid, integer, integer, integer) from public, anon, authenticated;

-- ---- submit ----
create or replace function public.submit_trip_rating(p_booking_id uuid, p_trip_stars integer, p_driver_stars integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); b record; t public.trips%rowtype; v_driver uuid; w record;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('rating.submit');
  if p_trip_stars is null or p_driver_stars is null or p_trip_stars not between 1 and 5 or p_driver_stars not between 1 and 5 then
    raise exception 'invalid stars' using errcode = '22023'; end if;
  -- ownership: through the customer row linked to this login. A walk-in booked by staff has no login and can never match.
  select bk.id, bk.company_id, bk.trip_id into b from public.bookings bk join public.customers c on c.company_id = bk.company_id and c.id = bk.customer_id
   where bk.id = p_booking_id and c.user_id = v_uid;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select * into t from public.trips x where x.id = b.trip_id and x.company_id = b.company_id;
  if t.status <> 'completed' or t.ended_at is null then raise exception 'trip not rateable' using errcode = '23514'; end if;
  select * into w from app_private.rating_window();
  if now() < t.ended_at + w.opens then raise exception 'rating not open yet' using errcode = '23514'; end if;
  if now() >= t.ended_at + w.closes then raise exception 'rating window closed' using errcode = '23514'; end if;
  select k.boarded_driver_id into v_driver from public.tickets k
   where k.company_id = b.company_id and k.booking_id = b.id and k.status = 'boarded' order by k.boarded_at limit 1;
  if not found then raise exception 'not boarded' using errcode = '23514'; end if;
  v_driver := coalesce(v_driver, t.driver_id);
  if v_driver is null then raise exception 'not boarded' using errcode = '23514'; end if;
  begin
    insert into public.trip_ratings (company_id, trip_id, booking_id, rater_user_id, driver_id, trip_stars, driver_stars)
    values (b.company_id, b.trip_id, b.id, v_uid, v_driver, p_trip_stars, p_driver_stars);
  exception when unique_violation then raise exception 'already rated' using errcode = '23505'; end;
  perform app_private.rating_apply(b.company_id, v_driver, p_trip_stars, p_driver_stars, 1);
  perform app_private.write_audit('customer', b.company_id, 'rating.submitted', 'trip', b.trip_id, '{}'::jsonb);   -- no stars, no identity in the audit row
  return jsonb_build_object('booking_id', b.id, 'trip_stars', p_trip_stars, 'driver_stars', p_driver_stars);
end $$;

-- ---- platform moderation ----
create or replace function public.set_trip_rating_hidden(p_rating_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.trip_ratings%rowtype;
begin
  if auth.uid() is null or app_private.platform_role() is distinct from 'super_admin' then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.trip_ratings where id = p_rating_id for update;
  if not found then raise exception 'rating not found' using errcode = 'P0002'; end if;
  if (r.hidden_at is not null) = p_hidden then return; end if;       -- already in that state: nothing to reverse twice
  update public.trip_ratings set hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then auth.uid() end where id = r.id;
  perform app_private.rating_apply(r.company_id, r.driver_id, r.trip_stars, r.driver_stars, case when p_hidden then -1 else 1 end);
  perform app_private.write_audit('platform_user', r.company_id, case when p_hidden then 'rating.hidden' else 'rating.unhidden' end, 'trip', r.trip_id, jsonb_build_object('rating_id', r.id));
end $$;

-- ---- reads ----
-- what the rider sees on my-bookings: boarded bookings of finished trips and where they stand in the window
create or replace function public.my_rateable_bookings() returns table (
  booking_id uuid, trip_id uuid, company_name text, origin_name text, destination_name text, departure_at timestamptz, ended_at timestamptz,
  state text, opens_at timestamptz, closes_at timestamptz, my_trip_stars smallint, my_driver_stars smallint)
language plpgsql stable security definer set search_path = '' as $$
declare w record;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('rating.read');
  select * into w from app_private.rating_window();
  return query
    select bk.id, t.id, co.name::text, ro.origin_name::text, ro.destination_name::text, t.departure_at, t.ended_at,
           case when r.id is not null then 'rated' when now() < t.ended_at + w.opens then 'not_open_yet' when now() >= t.ended_at + w.closes then 'closed' else 'open' end,
           t.ended_at + w.opens, t.ended_at + w.closes, r.trip_stars, r.driver_stars
      from public.bookings bk
      join public.customers c on c.company_id = bk.company_id and c.id = bk.customer_id and c.user_id = auth.uid()
      join public.trips t on t.company_id = bk.company_id and t.id = bk.trip_id and t.status = 'completed' and t.ended_at is not null
      join public.companies co on co.id = bk.company_id
      join public.routes ro on ro.company_id = t.company_id and ro.id = t.route_id
      left join public.trip_ratings r on r.booking_id = bk.id
     where exists (select 1 from public.tickets k where k.company_id = bk.company_id and k.booking_id = bk.id and k.status = 'boarded')
     order by t.ended_at desc limit 50;
end $$;

-- company rating for the marketplace and the company site: only from 5 ratings, otherwise average is null ("New")
create or replace function public.company_public_ratings(p_company_ids uuid[]) returns table (company_id uuid, ratings integer, average numeric)
language sql stable security definer set search_path = '' as $$
  select c.id, coalesce(s.ratings, 0),
         case when coalesce(s.ratings, 0) >= (select min_public from app_private.rating_window())
              then round((s.trip_stars_sum + s.driver_stars_sum)::numeric / (2 * s.ratings), 1) end
    from public.companies c left join public.company_rating_stats s on s.company_id = c.id
   where c.id = any (p_company_ids) and app_private.company_is_live(c.id) and cardinality(p_company_ids) <= 100
$$;

-- managers: their drivers' ratings
create or replace function public.company_driver_ratings() returns table (driver_id uuid, full_name text, ratings integer, average numeric, distribution integer[])
language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid := app_private.caller_company('drivers.read');
begin
  if v_company is null then raise exception 'not allowed' using errcode = '42501'; end if;
  perform app_private.rate_limit_hit('rating.read');
  return query
    select d.id, d.full_name::text, coalesce(s.ratings, 0), case when coalesce(s.ratings, 0) > 0 then round(s.stars_sum::numeric / s.ratings, 1) end,
           coalesce(s.distribution, '{0,0,0,0,0}'::integer[])
      from public.drivers d left join public.driver_rating_stats s on s.driver_id = d.id and s.company_id = d.company_id
     where d.company_id = v_company order by d.full_name;
end $$;

-- the driver's own profile now carries the rating (D15)
create or replace function public.driver_my_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.drivers%rowtype; v_tz text; v_name text; v_done bigint; s public.driver_rating_stats%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform app_private.rate_limit_hit('driver.profile');
  select x.* into d from public.drivers x
   where x.user_id = auth.uid() and x.status = 'active' and app_private.has_permission(x.company_id, 'trips.read_assigned')
   order by x.created_at limit 1;
  if not found then raise exception 'driver not found' using errcode = 'P0002'; end if;
  select cs.timezone into v_tz from public.company_settings cs where cs.company_id = d.company_id;
  select c.name into v_name from public.companies c where c.id = d.company_id;
  select count(*) into v_done from public.trips tr where tr.company_id = d.company_id and tr.driver_id = d.id and tr.status = 'completed';
  select * into s from public.driver_rating_stats x where x.driver_id = d.id;
  return jsonb_build_object(
    'company_name', v_name, 'full_name', d.full_name, 'phone', d.phone, 'license_number', d.license_number,
    'license_expiry', d.license_expiry,
    'license_days_left', case when d.license_expiry is null then null else d.license_expiry - (now() at time zone coalesce(v_tz, 'UTC'))::date end,
    'photo_media_id', d.photo_media_id, 'trips_completed', v_done,
    'rating_count', coalesce(s.ratings, 0),
    'rating_average', case when coalesce(s.ratings, 0) > 0 then round(s.stars_sum::numeric / s.ratings, 1) end,
    'rating_distribution', to_jsonb(coalesce(s.distribution, '{0,0,0,0,0}'::integer[])));
end $$;

revoke all on function public.submit_trip_rating(uuid, integer, integer), public.set_trip_rating_hidden(uuid, boolean), public.my_rateable_bookings(),
  public.company_driver_ratings(), public.driver_my_profile() from public, anon;
grant execute on function public.submit_trip_rating(uuid, integer, integer), public.set_trip_rating_hidden(uuid, boolean), public.my_rateable_bookings(),
  public.company_driver_ratings(), public.driver_my_profile() to authenticated;
revoke all on function public.company_public_ratings(uuid[]) from public;
grant execute on function public.company_public_ratings(uuid[]) to anon, authenticated;

-- ---- notification: rating.request at ended_at + 1 h, a reminder the next day, nothing after the window ----
insert into public.notification_events (key, audience, default_channels, mandatory, is_live, description)
values ('rating.request', 'student', '{in_app}', false, true, 'Ask a rider who boarded to rate the trip and the driver')
on conflict (key) do update set is_live = true;
insert into public.notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'rating.request', 'in_app', 'en', 'How was your trip?', 'Rate {{trip}} and your driver. It takes a few seconds.'),
  (null, 'rating.request', 'in_app', 'ar', 'كيف كانت رحلتك؟', 'قيّم رحلتك {{trip}} والسائق. يستغرق الأمر ثوانٍ.');

create or replace function app_private.notify_rating_requests() returns integer language plpgsql security definer set search_path = '' as $$
declare r record; w record; v_n integer := 0; v_slot text;
begin
  select * into w from app_private.rating_window();
  for r in select bk.id as booking_id, bk.company_id, bk.trip_id, c.user_id, t.ended_at, app_private.trip_label(t.id) as label
             from public.trips t
             join public.bookings bk on bk.company_id = t.company_id and bk.trip_id = t.id
             join public.customers c on c.company_id = bk.company_id and c.id = bk.customer_id and c.user_id is not null
            where t.status = 'completed' and t.ended_at <= now() - w.opens and t.ended_at > now() - w.closes
              and exists (select 1 from public.tickets k where k.company_id = bk.company_id and k.booking_id = bk.id and k.status = 'boarded')
              and not exists (select 1 from public.trip_ratings x where x.booking_id = bk.id)
              and app_private.company_is_live(t.company_id)
            limit 500 loop
    v_slot := case when r.ended_at <= now() - interval '25 hours' then 'day2' else 'first' end;     -- the first ask, then one reminder the next day; dedupe key stops repeats
    v_n := v_n + app_private.enqueue_notification('rating.request', r.user_id, r.company_id, jsonb_build_object('trip', r.label), 'booking', r.booking_id,
                                                  'rating.request:' || r.booking_id || ':' || v_slot, '/my-bookings');
  end loop;
  return v_n;
end $$;
revoke all on function app_private.notify_rating_requests() from public, anon, authenticated;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('notify-rating-requests', 'notify_rating_requests', 600, 1800);

-- tenant guard on every table that carries a company_id (the platform audit in suite 04 insists)
create trigger "000_tenant_guard" before insert or update on public.trip_ratings for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on public.company_rating_stats for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on public.driver_rating_stats for each row execute function app_private.tenant_guard();
