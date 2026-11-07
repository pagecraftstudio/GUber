-- 22: M2 dashboard completion - customers, company settings, billing visibility, driver scope. Requires 01 fixtures.
-- Users: 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB (starter). Company A = u(101), B = u(102).
-- Customers: u(251) company A, u(252) company B. Trips: u(241) assigned to driver A, u(242) not.
create or replace function t.cset(p_company uuid) returns integer language sql security definer as
  $$ select booking_cutoff_minutes from public.company_settings where company_id = p_company $$;
create or replace function t.cnote(p_id uuid) returns text language sql security definer as
  $$ select notes from public.customers where id = p_id $$;

-- ============ customers: read ============
select t.as_user(t.u(5));   -- booking staff: customers.read
select t.eq('booking staff sees the company A customer', t.rows(format('select 1 from customers where id = %L', t.u(251))), 1::bigint);
select t.eq('booking staff cannot see a company B customer', t.rows(format('select 1 from customers where id = %L', t.u(252))), 0::bigint);
select t.as_user(t.u(3));
select t.eq('manager sees the company A customer', t.rows(format('select 1 from customers where id = %L', t.u(251))), 1::bigint);
select t.as_user(t.u(4));   -- operations: no customers.read
select t.eq('operations staff cannot read customers', t.rows('select 1 from customers'), 0::bigint);
select t.as_user(t.u(6));   -- driver
select t.eq('driver cannot read customers', t.rows('select 1 from customers'), 0::bigint);
select t.as_user(t.u(7));   -- owner of company B
select t.eq('company B owner cannot read a company A customer', t.rows(format('select 1 from customers where id = %L', t.u(251))), 0::bigint);
select t.as_anon();
select t.raises('anonymous has no privilege on customers', 'select 1 from customers', '42501');

-- ============ customers: write ============
select t.as_user(t.u(7));
select t.eq('company B owner cannot update a company A customer', t.affected(format('update customers set notes = %L where id = %L', 'hijack', t.u(251))), 0::bigint);
select t.as_user(t.u(4));
select t.eq('operations staff cannot update a customer', t.affected(format('update customers set notes = %L where id = %L', 'ops', t.u(251))), 0::bigint);
select t.as_user(t.u(6));
select t.eq('driver cannot update a customer', t.affected(format('update customers set notes = %L where id = %L', 'drv', t.u(251))), 0::bigint);
select t.as_admin();
select t.eq('company A customer notes unchanged by the refused writes', t.cnote(t.u(251)), 'staff note A');

-- ============ company settings ============
select t.as_user(t.u(4));   -- operations: settings.read only
select t.eq('operations staff can read their own settings', t.rows(format('select 1 from company_settings where company_id = %L', t.u(101))), 1::bigint);
select t.eq('operations staff cannot update settings', t.affected(format('update company_settings set booking_cutoff_minutes = 5 where company_id = %L', t.u(101))), 0::bigint);
select t.as_user(t.u(5));   -- booking staff: settings.read only
select t.eq('booking staff cannot update settings', t.affected(format('update company_settings set booking_cutoff_minutes = 6 where company_id = %L', t.u(101))), 0::bigint);
select t.as_user(t.u(6));
select t.eq('driver cannot read settings', t.rows('select 1 from company_settings'), 0::bigint);
select t.as_user(t.u(7));
select t.eq('company B owner cannot read company A settings', t.rows(format('select 1 from company_settings where company_id = %L', t.u(101))), 0::bigint);
select t.eq('company B owner cannot update company A settings', t.affected(format('update company_settings set booking_cutoff_minutes = 7 where company_id = %L', t.u(101))), 0::bigint);
select t.as_admin();
select t.eq('company A settings unchanged by the refused writes', t.cset(t.u(101)) not in (5, 6, 7), true);
select t.as_user(t.u(3));   -- manager: settings.write
select t.eq('manager can update company A settings', t.affected(format('update company_settings set booking_cutoff_minutes = 75 where company_id = %L', t.u(101))), 1::bigint);
select t.as_user(t.u(2));
select t.eq('owner can update company A settings', t.affected(format('update company_settings set booking_cutoff_minutes = 90 where company_id = %L', t.u(101))), 1::bigint);
select t.raises('negative cut-off refused by the database', format('update company_settings set booking_cutoff_minutes = -1 where company_id = %L', t.u(101)), '23514');
select t.raises('default language must be a supported language', format('update company_settings set default_locale = %L, supported_locales = %L where company_id = %L', 'ar', '{en}', t.u(101)), '23514');
select t.raises('company id cannot be moved', format('update company_settings set company_id = %L where company_id = %L', t.u(102), t.u(101)));
select t.as_admin();
select t.eq('owner update persisted', t.cset(t.u(101)), 90);

-- ============ billing is owner-only ============
select t.as_user(t.u(2));
select t.eq('owner can read the company subscription', t.rows(format('select 1 from subscriptions where company_id = %L', t.u(101))) >= 1, true);
select t.as_user(t.u(3));
select t.eq('manager cannot read subscriptions (billing.read is owner-only)', t.rows('select 1 from subscriptions'), 0::bigint);
select t.as_user(t.u(4));
select t.eq('operations staff cannot read subscriptions', t.rows('select 1 from subscriptions'), 0::bigint);
select t.eq('operations staff cannot read invoices', t.rows('select 1 from invoices'), 0::bigint);
select t.as_user(t.u(5));
select t.eq('booking staff cannot read payments', t.rows('select 1 from payments'), 0::bigint);

-- ============ driver sees only assigned trips ============
select t.as_user(t.u(6));
select t.eq('driver sees the assigned trip', t.rows(format('select 1 from trips where id = %L', t.u(241))), 1::bigint);
select t.eq('driver does not see another driver''s trip in the same company', t.rows(format('select 1 from trips where id = %L', t.u(242))), 0::bigint);
select t.eq('driver cannot write trips', t.affected(format('update trips set price = 1 where id = %L', t.u(241))), 0::bigint);
select t.as_admin();

-- ============ trip business rules at the database (what the dashboard messages explain) ============
select t.as_user(t.u(2));   -- owner A; buses: u(221) active cap 40, u(223) inactive; route u(201)
select t.raises('capacity above the bus capacity is refused (insert)', format($$insert into trips (company_id, route_id, bus_id, departure_at, arrival_at, price, capacity) values (%L, %L, %L, now() + interval '30 days', now() + interval '30 days 2 hours', 10, 41)$$, t.u(101), t.u(201), t.u(221)), '23514');
select t.raises('an inactive bus cannot be assigned to a trip (insert)', format($$insert into trips (company_id, route_id, bus_id, departure_at, arrival_at, price, capacity) values (%L, %L, %L, now() + interval '31 days', now() + interval '31 days 2 hours', 10, 20)$$, t.u(101), t.u(201), t.u(223)));
select t.raises('a trip cannot arrive before it departs', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (%L, %L, now() + interval '32 days', now() + interval '32 days' - interval '1 hour', 10, 20)$$, t.u(101), t.u(201)), '23514');
select t.raises('a trip cannot be created on another company route', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (%L, %L, now() + interval '33 days', now() + interval '33 days 2 hours', 10, 20)$$, t.u(101), t.u(203)), '23503');
select t.as_user(t.u(7));
select t.raises('company B owner cannot create a trip in company A', format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (%L, %L, now() + interval '34 days', now() + interval '34 days 2 hours', 10, 20)$$, t.u(101), t.u(201)), '42501');
select t.as_admin();
