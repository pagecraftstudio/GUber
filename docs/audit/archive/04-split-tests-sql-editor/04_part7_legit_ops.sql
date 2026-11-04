select t.as_admin();
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

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
