-- Removes ONLY rows created by supabase/tests/01_helpers_fixtures.sql and suites 02..08, for a database they were run on by mistake.
-- Fixture ids all start with 00000000-0000-4000-8000- (never produced by gen_random_uuid()). Everything is reached through
-- those ids: fixture companies, fixture users, and rows that belong to them. Plans, roles, permissions and all other rows
-- are untouched.
-- USAGE
--   1) PREVIEW (read-only):
--        select 'companies', count(*) from public.companies where id::text like '00000000-0000-4000-8000-%'
--        union all select 'auth.users', count(*) from auth.users where id::text like '00000000-0000-4000-8000-%';
--   2) Run this whole file as the `postgres` role. It is ONE transaction. It deliberately switches off the app's
--      "append-only / never delete" guard triggers on the affected tables FOR THIS TRANSACTION ONLY, then switches them
--      back on. If any fixture row survives, or anything errors, EVERYTHING rolls back (including the trigger changes).
begin;
do $$
declare
  pat constant text := '00000000-0000-4000-8000-%';
  tbl record; n int; pass int := 0; remaining int; total int := 0;
  tables text[] := array[]::text[]; t text;
begin
  for tbl in
    select c.table_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'company_id'
  loop tables := tables || tbl.table_name::text; end loop;
  tables := tables || array['companies', 'profiles', 'platform_users']::text[];
  tables := array(select distinct u.x from unnest(tables) as u(x) where to_regclass('public.' || u.x) is not null);

  -- guard triggers (append-only audit log, "bookings are never deleted", ...) off for this transaction only
  foreach t in array tables loop execute format('alter table public.%I disable trigger user', t); end loop;

  delete from public.audit_logs where company_id::text like pat or actor_id::text like pat;

  -- every company-scoped table: delete the fixture companies' rows; retry passes to satisfy FK order
  loop
    pass := pass + 1; remaining := 0;
    foreach t in array tables loop
      continue when t in ('companies', 'profiles', 'platform_users');
      begin
        execute format('delete from public.%I where company_id::text like %L', t, pat);
        get diagnostics n = row_count; total := total + n;
      exception when foreign_key_violation or restrict_violation then remaining := remaining + 1;
      end;
    end loop;
    exit when remaining = 0 or pass >= 12;
  end loop;
  if remaining > 0 then raise exception 'cleanup stuck: % tables still blocked by foreign keys', remaining; end if;

  delete from public.companies where id::text like pat;
  if to_regclass('public.platform_users') is not null then execute format('delete from public.platform_users where user_id::text like %L', pat); end if;
  delete from public.profiles where id::text like pat;
  delete from auth.users where id::text like pat;
  drop schema if exists t cascade;

  foreach t in array tables loop execute format('alter table public.%I enable trigger user', t); end loop;

  -- verify: nothing fixture-shaped may remain in public / auth (raises => full rollback)
  for tbl in
    select c.table_schema, c.table_name, c.column_name from information_schema.columns c
    join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'auth') and c.column_name in ('id', 'company_id', 'user_id') and c.data_type = 'uuid'
  loop
    execute format('select count(*) from %I.%I where %I::text like %L', tbl.table_schema, tbl.table_name, tbl.column_name, pat) into n;
    if n > 0 then raise exception 'cleanup incomplete: %.%.% still has % fixture rows (rolled back)', tbl.table_schema, tbl.table_name, tbl.column_name, n; end if;
  end loop;
  raise notice 'cleanup ok: % company-scoped rows deleted; fixture companies, users and schema t removed; guard triggers re-enabled', total;
end $$;
commit;
