select t.as_admin();
-- ---- guard fires BEFORE the advisory lock / counting (see also tests/lock-oracle.sh) ----
select t.as_admin();
select t.eq('every tenant table has the guard and it fires first', (select count(*) from app_private.tenant_guard_problems()), 0::bigint);
select t.eq('guard is installed on all tenant tables (>= 25)', (select count(*) >= 25 from pg_trigger where tgname = '000_tenant_guard'), true);

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
