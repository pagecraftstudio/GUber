-- Run ONCE on your Supabase branch, then continue with 04_part3. Re-runnable.
alter table if exists t.results disable row level security;
alter table if exists t.marks   disable row level security;
alter table if exists t.oracle  disable row level security;
alter table if exists t.ids     disable row level security;
alter table if exists t.tokens  disable row level security;
select tablename, rowsecurity from pg_tables where schemaname = 't' order by 1;
