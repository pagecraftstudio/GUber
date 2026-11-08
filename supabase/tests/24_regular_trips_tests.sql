-- 24: regular trips generated from templates (migration 0028). Requires 01 fixtures; run alone or after 02-23.
select t.as_admin();
create temp table s24_limits as select e.plan_id, e.key, e.int_value from public.plan_entitlements e where e.plan_id in (select plan_id from public.subscriptions where company_id in (t.u(101), t.u(102)) and status in ('trial','active')) and e.key in ('max_trips_per_month', 'max_buses', 'max_drivers');
update public.plan_entitlements e set int_value = null where e.plan_id in (select plan_id from s24_limits) and e.key in ('max_trips_per_month', 'max_buses', 'max_drivers');
insert into buses (id, company_id, plate_number, capacity) values (t.u(901), t.u(101), 'S24-1', 30), (t.u(902), t.u(102), 'S24-B', 30);
insert into drivers (id, company_id, full_name, phone) values (t.u(911), t.u(101), 'S24 Driver', '+201240000001');
insert into trip_templates (id, company_id, name, route_id, bus_id, driver_id, departure_time, duration_minutes, days_of_week, start_date, price, capacity) values
  (t.u(921), t.u(101), 'Daily 03:00', t.u(201), t.u(901), t.u(911), '03:00', 120, array[1,2,3,4,5,6,7]::smallint[], current_date - 3, 50, 20),
  (t.u(922), t.u(101), 'No resources', t.u(201), null, null, '04:00', 90, array[1,2,3,4,5,6,7]::smallint[], current_date, 50, 20),
  (t.u(923), t.u(101), 'Inactive', t.u(201), null, null, '05:00', 90, array[1]::smallint[], current_date, 50, 20);
update trip_templates set is_active = false where id = t.u(923);

-- authorization
select t.as_user(t.u(7));
select t.raises('other tenant cannot generate from A template (not found)', format('select public.generate_template_trips(%L, 7)', t.u(921)), 'P0002');
select t.as_user(t.u(5));
select t.raises('booking staff (no trips.write) cannot generate', format('select public.generate_template_trips(%L, 7)', t.u(921)), 'P0002');
select t.as_anon();
select t.raises('anonymous cannot call it', format('select public.generate_template_trips(%L, 7)', t.u(921)), '42501');

-- generation
select t.as_user(t.u(2));
select t.raises('inactive template refused', format('select public.generate_template_trips(%L, 7)', t.u(923)), '23514');
create temp table s24_r (n int, r jsonb);
grant all on s24_r to authenticated;
insert into s24_r select 1, public.generate_template_trips(t.u(921), 7);
select t.as_admin();
select t.eq('7-day daily template creates 7 or 8 trips (today only if 03:00 is still ahead)', (select (r->>'created')::int between 7 and 8 from s24_r where n = 1), true);
select t.eq('trips carry the template id', (select count(*) from trips where template_id = t.u(921)) = (select (r->>'created')::int from s24_r where n = 1), true);
select t.eq('bus + driver => scheduled', (select count(*) from trips where template_id = t.u(921) and status <> 'scheduled'), 0::bigint);
select t.eq('arrival = departure + duration', (select count(*) from trips where template_id = t.u(921) and arrival_at - departure_at <> interval '120 minutes'), 0::bigint);
select t.eq('no trip in the past', (select count(*) from trips where template_id = t.u(921) and departure_at <= now()), 0::bigint);
select t.eq('generated_through set', (select generated_through is not null from trip_templates where id = t.u(921)), true);
select t.as_user(t.u(2));
insert into s24_r select 2, public.generate_template_trips(t.u(921), 7);
select t.as_admin();
select t.eq('second run is idempotent (creates 0)', (select (r->>'created')::int from s24_r where n = 2), 0::int);
select t.eq('second run reports the existing ones', (select (r->>'already_existed')::int from s24_r where n = 2), (select (r->>'created')::int from s24_r where n = 1));
select t.eq('no duplicate departures', (select count(*) - count(distinct departure_at) from trips where template_id = t.u(921)), 0::bigint);

-- no bus/driver => drafts
select t.as_user(t.u(2));
insert into s24_r select 3, public.generate_template_trips(t.u(922), 3);
select t.as_admin();
select t.eq('template without resources creates drafts', (select count(*) from trips where template_id = t.u(922) and status = 'draft') > 0, true);

-- a conflicting bus is skipped, not forced
select t.as_admin();
insert into trip_templates (id, company_id, name, route_id, bus_id, driver_id, departure_time, duration_minutes, days_of_week, start_date, price, capacity) values
  (t.u(924), t.u(101), 'Clash same bus', t.u(201), t.u(901), t.u(911), '03:30', 60, array[1,2,3,4,5,6,7]::smallint[], current_date, 50, 20);
select t.as_user(t.u(2));
insert into s24_r select 4, public.generate_template_trips(t.u(924), 3);
select t.as_admin();
select t.eq('overlapping bus days are skipped and counted', (select (r->>'created')::int = 0 and (r->>'conflicts')::int > 0 from s24_r where n = 4), true);

-- end_date caps the horizon
insert into trip_templates (id, company_id, name, route_id, departure_time, duration_minutes, days_of_week, start_date, end_date, price, capacity) values
  (t.u(925), t.u(101), 'Ends in 2 days', t.u(201), '23:00', 60, array[1,2,3,4,5,6,7]::smallint[], current_date, current_date + 2, 50, 20);
select t.as_user(t.u(2));
insert into s24_r select 5, public.generate_template_trips(t.u(925), 30);
select t.as_admin();
select t.eq('end_date caps generation (max 3 days)', (select (r->>'created')::int <= 3 from s24_r where n = 5), true);

-- plan limit stops generation, keeps what exists
update public.plan_entitlements e set int_value = 1 where e.plan_id in (select plan_id from s24_limits) and e.key = 'max_trips_per_month';
insert into trip_templates (id, company_id, name, route_id, departure_time, duration_minutes, days_of_week, start_date, price, capacity) values
  (t.u(926), t.u(101), 'Limit probe', t.u(201), '22:00', 60, array[1,2,3,4,5,6,7]::smallint[], current_date, 50, 20);
select t.as_user(t.u(2));
insert into s24_r select 6, public.generate_template_trips(t.u(926), 10);
select t.as_admin();
select t.eq('plan limit is reported, not silently ignored', (select (r->>'limit_reached')::boolean from s24_r where n = 6), true);

update public.plan_entitlements e set int_value = l.int_value from s24_limits l where e.plan_id = l.plan_id and e.key = l.key;
