-- 04: F1 regression suite (migration 0008). Requires 01_helpers_fixtures.sql. Safe to run after 02/03.
-- Company A must not be able to observe ANY tenant-specific state of Company B (plan limits, subscription,
-- suspension, bus/driver state, ...) from the errors of inserts/updates that carry B's company_id.
create table if not exists t.marks (name text primary key, id int);
alter table t.marks disable row level security;   -- Supabase enables RLS on new tables by default
grant all on t.marks to anon, authenticated;
create table if not exists t.oracle (id serial primary key, tbl text, scenario text, err text);
alter table t.oracle disable row level security;   -- Supabase enables RLS on new tables by default
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

select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '04');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '04') order by id;
