-- 04: F1 regression suite (migration 0008). Requires 01_helpers_fixtures.sql. Safe to run after 02/03.
-- Company A must not be able to observe ANY tenant-specific state of Company B (plan limits, subscription,
-- suspension, bus/driver state, ...) from the errors of inserts/updates that carry B's company_id.
create table if not exists t.marks (name text primary key, id int);
grant all on t.marks to anon, authenticated;
create table if not exists t.oracle (id serial primary key, tbl text, scenario text, err text);
grant all on t.oracle to anon, authenticated;
grant usage on sequence t.oracle_id_seq to anon, authenticated;
truncate t.oracle;
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
-- Inserts a bare row carrying p_company into EVERY table that has a company_id column and records the error.
create or replace function t.sweep(p_scenario text, p_company uuid) returns void language plpgsql as $$
declare r record;
begin
  for r in select c.relname::text as tbl from pg_class c join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
           where n.nspname = 'public' and c.relkind = 'r' order by 1
  loop
    insert into t.oracle (tbl, scenario, err)
    values (r.tbl, p_scenario, t.err_of(format('insert into public.%I (company_id) values (%L)', r.tbl, p_company)));
  end loop;
end $$;
delete from t.marks where name = '04';
insert into t.marks select '04', coalesce(max(id), 0) from t.results;

select t.as_admin();
-- Fill Company B (starter: 5 buses, 5 drivers, 5 routes, 3 users) to EVERY plan limit, whatever earlier suites left.
insert into auth.users (id, email) select t.u(n), 'g' || n || '@test.dev' from generate_series(31, 33) n on conflict do nothing;
do $fill$
declare i int;
begin
  for i in 1..10 loop begin insert into buses (company_id, plate_number, capacity) values (t.u(102), 'G-' || i, 10); exception when sqlstate '53400' then exit; end; end loop;
  for i in 1..10 loop begin insert into drivers (company_id, full_name, phone) values (t.u(102), 'G driver ' || i, '+2010000' || (7000 + i)); exception when sqlstate '53400' then exit; end; end loop;
  for i in 1..10 loop begin insert into routes (company_id, name, origin_name, destination_name) values (t.u(102), 'G route ' || i, 'a', 'b'); exception when sqlstate '53400' then exit; end; end loop;
  for i in 31..33 loop begin insert into company_users (company_id, user_id, role_id) select t.u(102), t.u(i), id from roles where key = 'manager'; exception when sqlstate '53400' then exit; end; end loop;
end $fill$;
-- B's bus 224 and driver 233 become inactive (state an attacker would love to learn)
update buses set status = 'inactive' where id = t.u(224);
update drivers set status = 'inactive' where id = t.u(233);
-- a bus that is active with a tiny capacity, to probe the capacity rule
update buses set capacity = 1 where company_id = t.u(102) and plate_number = 'G-2';

-- ---- control: the state we are trying to hide REALLY exists, and B's own owner sees it ----
select t.as_user(t.u(7));
select t.eq('control: B owner gets plan_limit on buses', left(t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(102), 'ZZ-1', 10)$$), 5), '53400');
select t.eq('control: B owner gets plan_limit on drivers', left(t.err_of($$insert into drivers (company_id, full_name, phone) values (t.u(102), 'x', '+201000000099')$$), 5), '53400');
select t.eq('control: B owner gets plan_limit on routes', left(t.err_of($$insert into routes (company_id, name, origin_name, destination_name) values (t.u(102), 'x', 'a', 'b')$$), 5), '53400');

-- ---- Company A (ownerA) probes B in every state B can be in ----
select t.as_user(t.u(2));
select t.sweep('B_at_plan_limits', t.u(102));
select t.sweep('ghost_company_1', gen_random_uuid());
select t.sweep('C_suspended', t.u(103));
select t.as_admin();
update subscriptions set status = 'cancelled' where company_id = t.u(102);
select t.as_user(t.u(2));
select t.sweep('B_no_subscription', t.u(102));
select t.as_admin();
update subscriptions set status = 'active' where company_id = t.u(102);
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 'x' where id = t.u(102);
select t.as_user(t.u(2));
select t.sweep('B_suspended', t.u(102));
select t.as_admin();
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(102);
delete from buses where company_id = t.u(102) and plate_number = (select max(plate_number) from buses where company_id = t.u(102) and plate_number like 'G-%');
select t.as_user(t.u(2));
select t.sweep('B_with_room', t.u(102));
select t.sweep('ghost_company_2', gen_random_uuid());
select t.as_admin();
insert into t.results (ok, name, detail)
select count(distinct o.err) = 1, 'sweep indistinguishable: ' || o.tbl, string_agg(distinct o.scenario || ' => ' || o.err, E'\n')
from t.oracle o group by o.tbl;
insert into t.results (ok, name, detail)
select o.err like '42501|%', 'sweep error is the plain 42501 (RLS-style) for ' || o.tbl, min(o.err)
from t.oracle o group by o.tbl, (o.err like '42501|%');

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

-- ---- guard fires BEFORE the advisory lock / counting (see also tests/lock-oracle.sh) ----
select t.as_admin();
select t.eq('every tenant table has the guard and it fires first', (select count(*) from app_private.tenant_guard_problems()), 0::bigint);
select t.eq('guard is installed on all tenant tables (>= 25)', (select count(*) >= 25 from pg_trigger where tgname = '000_tenant_guard'), true);

-- ---- the test has power: with the guard off, the leak is visible ----
alter table buses disable trigger "000_tenant_guard";
select t.as_user(t.u(2));
select t.eq('POWER CHECK: without the guard the buses probe DOES differ (limit vs ghost)',
  t.err_of($$insert into buses (company_id) values (t.u(102))$$) <> t.err_of($$insert into buses (company_id) values (gen_random_uuid())$$), true);
select t.as_admin();
alter table buses enable trigger "000_tenant_guard";
select t.as_user(t.u(2));
select t.eq('guard re-enabled: probe identical again',
  t.err_of($$insert into buses (company_id) values (t.u(102))$$), t.err_of($$insert into buses (company_id) values (gen_random_uuid())$$));

-- ---- legitimate operations still work ----
select t.as_user(t.u(2));   -- owner A (professional)
select t.passes('owner A inserts a bus into A', $$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'OK-1', 20)$$);
select t.eq('owner A updates own route', t.affected($$update routes set description = 'ok' where id = t.u(201)$$), 1::bigint);
select t.as_user(t.u(3));   -- manager A
select t.passes('manager A inserts a route into A', $$insert into routes (company_id, name, origin_name, destination_name) values (t.u(101), 'OK route', 'a', 'b')$$);
select t.as_user(t.u(4));   -- operations A
select t.eq('operations A updates a trip price', t.affected($$update trips set price = 51 where id = t.u(242)$$), 1::bigint);
select t.as_user(t.u(1));   -- platform super_admin
select t.passes('super_admin inserts a bus into A (platform path)', $$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'PLAT-1', 20)$$);
select t.passes('super_admin inserts a customer into B (platform path)', $$insert into customers (company_id, full_name, phone) values (t.u(102), 'Plat cust', '+201999000111')$$);
select t.eq('super_admin updates a company-A route', t.affected($$update routes set description = 'by platform' where id = t.u(201)$$), 1::bigint);
select t.as_user(t.u(9));   -- platform support: read-only on tenants
select t.eq('support insert into A is stopped by RLS (42501)', left(t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'SUP-1', 20)$$), 5), '42501');
select t.as_user(t.u(10));  -- platform billing
select t.passes('billing inserts an invoice for B', $$insert into invoices (company_id, invoice_number, status, currency, subtotal, total) values (t.u(102), 'INV-G1', 'open', 'EGP', 1, 1)$$);
select t.as_user(t.u(8));   -- owner of suspended C
select t.eq('suspended owner insert into C: plain 42501', left(t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(103), 'C-1', 5)$$), 5), '42501');
select t.as_anon();
select t.eq('anon insert: 42501', left(t.err_of($$insert into routes (company_id, name, origin_name, destination_name) values (t.u(101), 'x', 'a', 'b')$$), 5), '42501');
select t.as_admin();
select t.eq('platform/trusted superuser path unaffected', t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(101), 'SU-1', 20)$$), 'NO ERROR');

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed
from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
