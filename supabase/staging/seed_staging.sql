-- STAGING SEED. Creates one demo company that is visible in the public marketplace, so the 8E smoke tests have something to book.
--
-- THIS FILE REFUSES TO RUN ANYWHERE EXCEPT A DATABASE EXPLICITLY MARKED AS STAGING.
--   One-time, by you, on the STAGING project only (SQL editor, role postgres):
--       alter database postgres set app.environment = 'staging';
--   then open a NEW SQL editor tab/session (database-level settings apply to new sessions) and run this file.
--   A production project never has that marker, so pasting this file there changes nothing: it raises first.
--   (Do NOT set the marker on production. Verify with:  select current_setting('app.environment', true);  -> NULL on production.)
--
-- WHAT IT CREATES (idempotent: re-running does nothing when the slug already exists)
--   company slug 'staging-demo' (status active) + active subscription on plan 'starter' (365 days) + published website,
--   1 route (Cairo -> Galala University) with 2 stops, 1 bus (20 seats), 1 driver WITHOUT a login, and 3 scheduled trips:
--   tomorrow 08:00, in 2 days 14:00, in 3 days 20:00 (Africa/Cairo), price 150 EGP.
-- WHAT IT DELIBERATELY DOES NOT CREATE
--   Auth users. Create them in the dashboard (Authentication -> Users, Auto Confirm) and link the driver with section 2 below.
--   Never put real people's data in staging.
do $$
declare v_env text := current_setting('app.environment', true);
begin
  if v_env is distinct from 'staging' then
    raise exception 'REFUSING: this database is not marked as staging (app.environment = %). Nothing was changed.', coalesce(v_env, 'NULL');
  end if;
end $$;

-- ===================== 1. demo company and operations =====================
do $$
declare
  v_c uuid; v_plan uuid; v_route uuid; v_bus uuid; v_drv uuid;
begin
  if exists (select 1 from public.companies where slug = 'staging-demo') then
    raise notice 'staging-demo already exists: section 1 skipped';
    return;
  end if;
  select id into v_plan from public.plans where code = 'starter';
  if v_plan is null then raise exception 'plan starter missing: migrations not applied?'; end if;

  insert into public.companies (name, slug, status, contact_email) values ('Staging Demo Transport', 'staging-demo', 'active', 'staging-demo@example.invalid') returning id into v_c;
  insert into public.subscriptions (company_id, plan_id, status, billing_interval, current_period_start, current_period_end)
  values (v_c, v_plan, 'active', 'yearly', now(), now() + interval '365 days');
  insert into public.website_settings (company_id, is_published) values (v_c, true)
  on conflict (company_id) do update set is_published = true;

  insert into public.routes (company_id, name, code, origin_name, destination_name) values (v_c, 'Cairo - Galala University', 'STG-CAI-GAL', 'Cairo', 'Galala University') returning id into v_route;
  insert into public.route_stops (company_id, route_id, name, stop_order, stop_type, offset_minutes)
  values (v_c, v_route, 'Cairo - Ramses', 1, 'pickup', 0), (v_c, v_route, 'Galala University gate', 2, 'dropoff', 180);
  insert into public.buses (company_id, plate_number, name, capacity) values (v_c, 'STG-0001', 'Staging bus 1', 20) returning id into v_bus;
  insert into public.drivers (company_id, full_name, phone) values (v_c, 'Staging Driver', '+201000000001') returning id into v_drv;

  -- one bus and one driver: a single trip per day keeps the overlap rules satisfied (tomorrow 08:00, +2 days 14:00, +3 days 20:00)
  insert into public.trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
  select v_c, v_route, v_bus, v_drv,
         (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => v.d, hours => v.h)) at time zone 'Africa/Cairo',
         (date_trunc('day', now() at time zone 'Africa/Cairo') + make_interval(days => v.d, hours => v.h + 3)) at time zone 'Africa/Cairo',
         150, 20, 'scheduled'
  from (values (1, 8), (2, 14), (3, 20)) as v(d, h);
  raise notice 'staging-demo created with 3 scheduled trips';
end $$;

-- ===================== 2. OPTIONAL: link an existing Auth user as the demo driver =====================
-- Create the user first (Authentication -> Users -> Add user, Auto Confirm User). Put the e-mail here, then re-run this file.
do $$
declare
  v_email constant text := lower(trim('REPLACE_WITH_DRIVER_EMAIL'));
  v_uid uuid; v_c uuid; v_drv uuid; v_role uuid;
begin
  if v_email like 'replace_with%' then raise notice 'section 2 skipped (no driver e-mail set)'; return; end if;
  select id into v_uid from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_uid is null then raise exception 'no confirmed Auth user with that e-mail'; end if;
  select id into v_c from public.companies where slug = 'staging-demo';
  select id into v_drv from public.drivers where company_id = v_c and full_name = 'Staging Driver';
  select id into v_role from public.roles where key = 'driver';
  insert into public.company_users (company_id, user_id, role_id) values (v_c, v_uid, v_role) on conflict do nothing;
  update public.drivers set user_id = v_uid where id = v_drv;
  raise notice 'driver login linked: sign in at /company/login, expect /driver';
end $$;

select c.slug, c.status, w.is_published,
       (select count(*) from public.trips t where t.company_id = c.id and t.status = 'scheduled' and t.departure_at > now()) as upcoming_trips
from public.companies c left join public.website_settings w on w.company_id = c.id where c.slug = 'staging-demo';
