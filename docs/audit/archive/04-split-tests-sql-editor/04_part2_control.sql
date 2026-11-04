select t.as_admin();
-- ---- control: the state we are trying to hide REALLY exists, and B's own owner sees it ----
select t.as_user(t.u(7));
select t.eq('control: B owner gets plan_limit on buses', left(t.err_of($$insert into buses (company_id, plate_number, capacity) values (t.u(102), 'ZZ-1', 10)$$), 5), '53400');
select t.eq('control: B owner gets plan_limit on drivers', left(t.err_of($$insert into drivers (company_id, full_name, phone) values (t.u(102), 'x', '+201000000099')$$), 5), '53400');
select t.eq('control: B owner gets plan_limit on routes', left(t.err_of($$insert into routes (company_id, name, origin_name, destination_name) values (t.u(102), 'x', 'a', 'b')$$), 5), '53400');

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
