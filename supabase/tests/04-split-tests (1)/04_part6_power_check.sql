select t.as_admin();
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

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
