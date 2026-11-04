select t.as_admin();
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

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
