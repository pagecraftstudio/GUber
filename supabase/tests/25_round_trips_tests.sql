-- 25: go-and-return trips (migration 0029). Requires 01 fixtures; run alone or after 02-24.
select t.as_admin();
create temp table s25_limits as select e.plan_id, e.key, e.int_value from public.plan_entitlements e where e.plan_id in (select plan_id from public.subscriptions where company_id in (t.u(101), t.u(102)) and status in ('trial','active')) and e.key in ('max_trips_per_month', 'max_buses', 'max_drivers', 'max_routes');
update public.plan_entitlements e set int_value = null where e.plan_id in (select plan_id from s25_limits);
insert into buses (id, company_id, plate_number, capacity) values (t.u(1001), t.u(101), 'S25-1', 30), (t.u(1002), t.u(101), 'S25-2', 30);
insert into drivers (id, company_id, full_name, phone) values (t.u(1011), t.u(101), 'S25 Driver', '+201250000001'), (t.u(1012), t.u(101), 'S25 Driver 2', '+201250000002');
insert into routes (id, company_id, name, origin_name, destination_name) values
  (t.u(1021), t.u(101), 'S25 Cairo-Galala', 'Cairo', 'Galala'), (t.u(1022), t.u(101), 'S25 Galala-Cairo', 'Galala', 'Cairo'), (t.u(1023), t.u(102), 'S25 B route', 'X', 'Y');
create temp table s25_r (n int, r jsonb);
grant all on s25_r to authenticated;
create function t.d25(h int) returns timestamptz language sql as $$ select date_trunc('day', now()) + interval '70 days' + make_interval(hours => h) $$;

-- authorization: Company A user cannot use Company B route, booking staff cannot create
select t.as_user(t.u(2));
select t.raises('cannot create round trip on another tenant route', format($$select public.create_trip_with_returns(%L, null, null, t.d25(8), t.d25(10), 50, 20, null, 90, %L::jsonb)$$, t.u(1023),
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":50}]', t.u(1022), t.d25(14), t.d25(16))), 'P0002');
select t.as_user(t.u(5));
select t.raises('booking staff cannot create round trips', format($$select public.create_trip_with_returns(%L, null, null, t.d25(8), t.d25(10), 50, 20, null, 90, %L::jsonb)$$, t.u(1021),
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":50}]', t.u(1022), t.d25(14), t.d25(16))), 'P0002');

-- validation
select t.as_user(t.u(2));
select t.raises('needs at least one return option', format($$select public.create_trip_with_returns(%L, null, null, t.d25(8), t.d25(10), 50, 20, null, 90, '[]'::jsonb)$$, t.u(1021)), '22023');
select t.raises('needs a round trip price', format($$select public.create_trip_with_returns(%L, null, null, t.d25(8), t.d25(10), 50, 20, null, null, %L::jsonb)$$, t.u(1021),
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":50}]', t.u(1022), t.d25(14), t.d25(16))), '22023');
select t.raises('return before outbound arrival refused (and nothing is left behind)', format($$select public.create_trip_with_returns(%L, null, null, t.d25(8), t.d25(10), 50, 20, null, 90, %L::jsonb)$$, t.u(1021),
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":50}]', t.u(1022), t.d25(9), t.d25(11))), '23514');
select t.as_admin();
select t.eq('failed creation left no trip behind', (select count(*) from trips where route_id = t.u(1021)), 0::bigint);

-- happy path: 1 outbound + 2 return times, bus/driver inherited
select t.as_user(t.u(2));
insert into s25_r select 1, public.create_trip_with_returns(t.u(1021), t.u(1001), t.u(1011), t.d25(8), t.d25(10), 50, 20, 'x', 90,
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":45},{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":45}]',
    t.u(1022), t.d25(14), t.d25(16), t.u(1022), t.d25(18), t.d25(20))::jsonb);
select t.as_admin();
select t.eq('outbound carries go price and round trip price', (select price = 50 and round_trip_price = 90 and outbound_trip_id is null from trips where id = (select (r->>'id')::uuid from s25_r where n = 1)), true);
select t.eq('two return trips linked to the outbound', (select count(*) from trips where outbound_trip_id = (select (r->>'id')::uuid from s25_r where n = 1)), 2::bigint);
select t.eq('return trips: return-only price, no round trip price, inherited bus+driver, draft', (select count(*) from trips where outbound_trip_id is not null and price = 45 and round_trip_price is null and bus_id = t.u(1001) and driver_id = t.u(1011) and status = 'draft' and route_id = t.u(1022)), 2::bigint);

-- constraints straight at the table
select t.raises('a return trip cannot carry a round trip price', format($$update trips set round_trip_price = 5 where outbound_trip_id is not null and route_id = %L$$, t.u(1022)), '23514');
select t.raises('no chains: a return cannot have returns', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, outbound_trip_id) select company_id, route_id, t.d25(30), t.d25(32), 1, 5, id from trips where outbound_trip_id is not null limit 1$$), '23514');
select t.raises('an outbound cannot become a return trip', format($$update trips set outbound_trip_id = (select id from trips where outbound_trip_id is not null limit 1) where id = %L$$, (select (r->>'id')::uuid from s25_r where n = 1)), '23514');
select t.raises('return cannot link to another company outbound', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, outbound_trip_id) values (%L, %L, t.d25(40), t.d25(42), 1, 5, %L)$$, t.u(102), t.u(1023), (select (r->>'id')::uuid from s25_r where n = 1)), '23514');
select t.as_user(t.u(2));
select t.raises('client cannot set outbound_trip_id (column not granted)', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, outbound_trip_id) values (%L, %L, t.d25(50), t.d25(52), 1, 5, %L)$$, t.u(101), t.u(1021), (select (r->>'id')::uuid from s25_r where n = 1)), '42501');
select t.raises('client cannot set round_trip_price (column not granted)', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, round_trip_price) values (%L, %L, t.d25(50), t.d25(52), 1, 5, 5)$$, t.u(101), t.u(1021)), '42501');

-- deleting the draft outbound removes its draft returns; a scheduled return blocks it
select t.passes('draft outbound deletes with its draft returns', format($$select public.delete_draft_trip(%L)$$, (select (r->>'id')::uuid from s25_r where n = 1)));
select t.as_admin();
select t.eq('outbound and returns all gone', (select count(*) from trips where route_id in (t.u(1021), t.u(1022))), 0::bigint);
select t.as_user(t.u(2));
insert into s25_r select 2, public.create_trip_with_returns(t.u(1021), t.u(1002), t.u(1012), t.d25(8), t.d25(10), 50, 20, null, 90,
  format('[{"route_id":"%s","departure_at":"%s","arrival_at":"%s","price":45}]', t.u(1022), t.d25(14), t.d25(16))::jsonb);
select public.transition_trip((select id from trips where outbound_trip_id is not null and route_id = t.u(1022)), 'scheduled');
select t.raises('draft outbound cannot be deleted once a return is scheduled', format($$select public.delete_draft_trip(%L)$$, (select (r->>'id')::uuid from s25_r where n = 2)), '23514');

-- regular trips with returns
select t.as_admin();
insert into trip_templates (id, company_id, name, route_id, bus_id, driver_id, departure_time, duration_minutes, days_of_week, start_date, price, capacity,
                            return_route_id, return_price, round_trip_price, return_times, return_day_offset) values
  (t.u(1031), t.u(101), 'S25 daily w/ return', t.u(1021), t.u(1001), t.u(1011), '05:00', 120, array[1,2,3,4,5,6,7]::smallint[], current_date + 1, 50, 20,
   t.u(1022), 45, 90, array['09:00','12:00']::time[], 0);
select t.raises('return times without prices are refused', format($$insert into trip_templates (company_id, name, route_id, departure_time, duration_minutes, days_of_week, start_date, price, capacity, return_times) values (%L, 'bad', %L, '05:00', 60, array[1]::smallint[], current_date, 1, 5, array['09:00']::time[])$$, t.u(101), t.u(1021)), '23514');
select t.as_user(t.u(2));
insert into s25_r select 3, public.generate_template_trips(t.u(1031), 3);
select t.as_admin();
select t.eq('3 days: 3 outbound + 6 return trips', (select (r->>'created')::int * 10 + (r->>'return_trips_created')::int from s25_r where n = 3), 36);
select t.eq('every generated return links to an outbound of the same template, after its arrival', (select count(*) from trips r join trips o on o.id = r.outbound_trip_id where r.template_id = t.u(1031) and o.template_id = t.u(1031) and r.departure_at >= o.arrival_at and r.price = 45 and o.round_trip_price = 90), 6::bigint);
select t.as_user(t.u(2));
insert into s25_r select 4, public.generate_template_trips(t.u(1031), 3);
select t.as_admin();
select t.eq('second run creates nothing new', (select (r->>'created')::int + (r->>'return_trips_created')::int from s25_r where n = 4), 0);

update public.plan_entitlements e set int_value = l.int_value from s25_limits l where e.plan_id = l.plan_id and e.key = l.key;
