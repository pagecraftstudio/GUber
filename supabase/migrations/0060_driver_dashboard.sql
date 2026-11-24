-- 0060: P7b driver dashboard backend (plan item 15, decision D16). NOT RUN against Postgres when written: run suite 56 before approving.
--   * trips.ended_at: when the trip really ended. Set by ONE trigger for every path that completes a trip (driver, staff transition_trip, auto-close),
--     so ratings (P7c) can rely on it. Older completed trips keep ended_at = null (no backfill: inventing a time is worse than none).
--   * driver_trip_manifest(trip): the assigned driver's passenger list. Name, seats, boarded count, subscriber marker, stops, booking reference.
--     NO phone, email, price or payment fields.
--   * driver_end_trip(trip): assigned active driver only, once (a repeat is a harmless no-op), only after departure. boarding/scheduled go through
--     in_progress first because the 0011 state machine only allows in_progress -> completed. Audited as trip.completed (metadata by = driver).
--   * driver_my_profile(): the caller's own driver record. The rating (P7c) is NOT here yet.
--   * app_private.close_overdue_trips(): D16 safety net. A boarding / in_progress trip whose scheduled arrival passed 2 h ago is completed with
--     ended_at = arrival + 2 h. A trip still only 'scheduled' is left alone (nobody boarded: it may never have run, a person must decide).
--     Idempotent, batch-limited, writes a heartbeat; scheduled every 10 minutes when pg_cron exists (same pattern as 0038).
-- Every function: security definer, search_path = '', company derived from the trip / auth.uid(), never from the request, rate-limited.
-- ROLLBACK: drop the four public functions and app_private.close_overdue_trips; drop trigger "110_trip_ended_at" and its function; drop constraint
--   trips_ended_only_when_completed; alter table trips drop column ended_at; drop table app_private.job_heartbeats;
--   delete from app_private.rate_limit_policies where bucket in ('driver.end_trip','driver.manifest','driver.profile');
--   select cron.unschedule(jobid) from cron.job where jobname = 'close-overdue-trips'.
-- RUNNER NOTE: apply BEFORE deploying code that calls these functions (the rule from incident 0033). Requires 0011, 0014, 0020, 0052.
set search_path = public, extensions;

-- ---------- ended_at ----------
alter table public.trips add column ended_at timestamptz;
alter table public.trips add constraint trips_ended_only_when_completed check (ended_at is null or status = 'completed');

create or replace function app_private.trips_ended_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.ended_at := coalesce(new.ended_at, now());   -- the auto-close job passes its own time; everybody else gets now()
  return new;
end $$;
revoke all on function app_private.trips_ended_at() from public, anon, authenticated;
-- named to fire AFTER "100_trip_status" (the state machine judges the transition first)
create trigger "110_trip_ended_at" before update of status on public.trips
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function app_private.trips_ended_at();

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('driver.end_trip', 60, 10, 'driver_end_trip per driver per minute'),
  ('driver.manifest', 60, 60, 'driver_trip_manifest per driver per minute (screen opens and refreshes)'),
  ('driver.profile',  60, 30, 'driver_my_profile per driver per minute');

-- ---------- manifest ----------
create or replace function public.driver_trip_manifest(p_trip_id uuid)
returns table (booking_id uuid, reference text, passenger_name text, seats smallint, seats_boarded bigint,
               is_subscriber boolean, pickup_stop text, dropoff_stop text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare t public.trips%rowtype;
begin
  perform app_private.rate_limit_hit('driver.manifest');
  t := app_private.driver_trip(p_trip_id);   -- 28000 not signed in / P0002 not YOUR trip (assigned, active driver, active membership)
  return query
    select b.id, b.reference, c.full_name, b.seats_count,
           (select count(*) from public.tickets k where k.company_id = b.company_id and k.booking_id = b.id and k.status = 'boarded'),
           b.subscription_id is not null, ps.name, ds.name
      from public.bookings b
      join public.customers c on c.company_id = b.company_id and c.id = b.customer_id
      left join public.route_stops ps on ps.company_id = b.company_id and ps.id = b.pickup_stop_id
      left join public.route_stops ds on ds.company_id = b.company_id and ds.id = b.dropoff_stop_id
     where b.company_id = t.company_id and b.trip_id = t.id and b.status in ('confirmed', 'completed')   -- pending holds and cancelled seats are not on the bus
     order by ps.stop_order nulls last, c.full_name, b.reference;
end $$;
revoke all on function public.driver_trip_manifest(uuid) from public, anon;
grant execute on function public.driver_trip_manifest(uuid) to authenticated;

-- ---------- end trip ----------
create or replace function public.driver_end_trip(p_trip_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.trips%rowtype; v_from text; v_end timestamptz;
begin
  perform app_private.rate_limit_hit('driver.end_trip');
  t := app_private.driver_trip(p_trip_id, true);   -- authorises AND locks the row: two taps cannot both end it
  if t.status = 'completed' then
    return jsonb_build_object('trip_id', t.id, 'status', 'completed', 'ended_at', t.ended_at, 'changed', false)
           || app_private.trip_boarding_stats(t.company_id, t.id);
  end if;
  if t.status not in ('scheduled', 'boarding', 'in_progress') then
    raise exception 'trip cannot be ended' using errcode = '23514';   -- draft / cancelled
  end if;
  if now() < t.departure_at then raise exception 'trip has not started' using errcode = '23514'; end if;

  v_from := t.status;
  if t.status in ('scheduled', 'boarding') then update public.trips set status = 'in_progress' where id = t.id; end if;
  update public.trips set status = 'completed' where id = t.id returning ended_at into v_end;   -- machine + effects + ended_at run in triggers

  perform app_private.write_audit('company_user', t.company_id, 'trip.completed', 'trip', t.id, jsonb_build_object('from', v_from, 'by', 'driver'));
  return jsonb_build_object('trip_id', t.id, 'status', 'completed', 'ended_at', v_end, 'changed', true)
         || app_private.trip_boarding_stats(t.company_id, t.id);
end $$;
revoke all on function public.driver_end_trip(uuid) from public, anon;
grant execute on function public.driver_end_trip(uuid) to authenticated;

-- ---------- profile ----------
create or replace function public.driver_my_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.drivers%rowtype; v_tz text; v_name text; v_done bigint;
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
  return jsonb_build_object(
    'company_name', v_name, 'full_name', d.full_name, 'phone', d.phone, 'license_number', d.license_number,
    'license_expiry', d.license_expiry,
    'license_days_left', case when d.license_expiry is null then null else d.license_expiry - (now() at time zone coalesce(v_tz, 'UTC'))::date end,
    'photo_media_id', d.photo_media_id, 'trips_completed', v_done);
end $$;
revoke all on function public.driver_my_profile() from public, anon;
grant execute on function public.driver_my_profile() to authenticated;

-- ---------- D16 auto-close ----------
create table if not exists app_private.job_heartbeats (job text primary key, last_run_at timestamptz not null, last_count integer not null default 0);
alter table app_private.job_heartbeats enable row level security;
revoke all on app_private.job_heartbeats from public, anon, authenticated;

create or replace function app_private.close_overdue_trips(p_limit integer default 200) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select tr.id, tr.company_id, tr.status, tr.arrival_at from public.trips tr
            where tr.status in ('boarding', 'in_progress') and tr.arrival_at + interval '2 hours' < now()
            order by tr.arrival_at limit greatest(1, least(coalesce(p_limit, 200), 1000)) for update skip locked
  loop
    if r.status = 'boarding' then update public.trips set status = 'in_progress' where id = r.id; end if;
    update public.trips set status = 'completed', ended_at = r.arrival_at + interval '2 hours' where id = r.id;
    perform app_private.write_audit('system', r.company_id, 'trip.completed', 'trip', r.id, jsonb_build_object('from', r.status, 'by', 'auto_close'));
    n := n + 1;
  end loop;
  insert into app_private.job_heartbeats (job, last_run_at, last_count) values ('close-overdue-trips', now(), n)
    on conflict (job) do update set last_run_at = excluded.last_run_at, last_count = excluded.last_count;
  return n;
end $$;
revoke all on function app_private.close_overdue_trips(integer) from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'close-overdue-trips';
    perform cron.schedule('close-overdue-trips', '*/10 * * * *', 'select app_private.close_overdue_trips()');
  else
    raise notice 'pg_cron is not available: enable it, then run: select cron.schedule(''close-overdue-trips'', ''*/10 * * * *'', ''select app_private.close_overdue_trips()'')';
  end if;
end $cron$;
