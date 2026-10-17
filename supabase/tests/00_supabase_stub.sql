-- SAFETY: these files create fake users/companies and change settings. They must NEVER run on a real Supabase project.
do $$ begin
  if to_regclass('auth.refresh_tokens') is not null or exists (select 1 from pg_extension where extname in ('supabase_vault','pg_graphql')) then
    raise exception 'REFUSING: this looks like a real Supabase project (GoTrue tables / Supabase extensions found). Run test suites only on a throw-away local Postgres (tests/integration/reset-db.sh).';
  end if;
end $$;
-- LOCAL TEST ONLY. Mimics the parts of Supabase the migrations rely on.
create schema if not exists extensions;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  phone text unique,   -- real GoTrue: users_phone_key UNIQUE(phone). The stub must be as strict.
  phone_confirmed_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
