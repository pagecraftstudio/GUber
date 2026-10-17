select t.as_admin();
-- ---- specific tenant-state probes beyond a bare company_id ----
-- trips: B's inactive bus/driver, over-capacity, a real B trip route
select t.as_user(t.u(2));
select t.eq('trip into B with B inactive bus == ghost answer',
  t.err_of($$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity) values (t.u(102), t.u(203), t.u(224), t.u(233), now() + interval '9 day', now() + interval '9 day 1 hour', 1, 5)$$),
  t.err_of($$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity) values (gen_random_uuid(), t.u(203), t.u(224), t.u(233), now() + interval '9 day', now() + interval '9 day 1 hour', 1, 5)$$));
select t.eq('trip into B with capacity above B bus == ghost answer',
  t.err_of($$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity) values (t.u(102), t.u(203), t.u(224), t.u(233), now() + interval '9 day', now() + interval '9 day 1 hour', 1, 999)$$),
  t.err_of($$insert into trips (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity) values (gen_random_uuid(), t.u(203), t.u(224), t.u(232), now() + interval '9 day', now() + interval '9 day 1 hour', 1, 999)$$));
select t.eq('booking into B with a real B trip + stops == ghost answer',
  t.err_of($$insert into bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, seats_count, unit_price, total_amount, currency, status, source) values (t.u(102), 'MB-PROBE', t.u(243), t.u(252), t.u(212), 1, 1, 1, 'EGP', 'pending', 'staff')$$),
  t.err_of($$insert into bookings (company_id, reference, trip_id, customer_id, pickup_stop_id, seats_count, unit_price, total_amount, currency, status, source) values (gen_random_uuid(), 'MB-PROBE', t.u(243), t.u(252), t.u(212), 1, 1, 1, 'EGP', 'pending', 'staff')$$));
select t.eq('membership into B at user limit == ghost answer',
  t.err_of($$insert into company_users (company_id, user_id, role_id) select t.u(102), t.u(33), id from roles where key = 'manager'$$),
  t.err_of($$insert into company_users (company_id, user_id, role_id) select gen_random_uuid(), t.u(33), id from roles where key = 'manager'$$));
select t.eq('own-row update moving company_id to B == plain RLS answer',
  left(t.err_of($$update routes set company_id = t.u(102) where id = t.u(201)$$), 5), '42501');
select t.eq('update moving company_id to ghost == update moving to B',
  t.err_of($$update routes set company_id = t.u(102) where id = t.u(201)$$),
  t.err_of($$update routes set company_id = gen_random_uuid() where id = t.u(201)$$));

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
