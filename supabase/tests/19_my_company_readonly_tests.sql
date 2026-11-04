-- 19: tests for migration 0023 (my_company is read-only for tenants). Runs after 01..18 on the same throw-away DB.
-- Local note: the local stub lacks Supabase's default grants, so this guards against a regression that re-grants writes;
-- the real exploit (UPDATE through the view) was proven on hosted Supabase, see MILESTONE-M1-HOSTED-REPORT.md.
select t.eq('19: authenticated can SELECT my_company', has_table_privilege('authenticated', 'public.my_company', 'select'), true);
select t.eq('19: authenticated cannot INSERT my_company', has_table_privilege('authenticated', 'public.my_company', 'insert'), false);
select t.eq('19: authenticated cannot UPDATE my_company', has_table_privilege('authenticated', 'public.my_company', 'update'), false);
select t.eq('19: authenticated cannot DELETE my_company', has_table_privilege('authenticated', 'public.my_company', 'delete'), false);
select t.eq('19: authenticated cannot TRUNCATE my_company', has_table_privilege('authenticated', 'public.my_company', 'truncate'), false);
select t.eq('19: anon has no privilege on my_company', has_table_privilege('anon', 'public.my_company', 'select,insert,update,delete'), false);
select t.eq('19: no public view grants write to anon/authenticated',
  (select count(*) from information_schema.role_table_grants g join pg_class c on c.relname = g.table_name and c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
    where g.table_schema = 'public' and g.grantee in ('anon','authenticated') and g.privilege_type <> 'SELECT'), 0::bigint);
