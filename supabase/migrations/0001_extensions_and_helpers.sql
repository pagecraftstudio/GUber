-- 0001: extensions, private schema, shared trigger functions.
create schema if not exists extensions;
create extension if not exists citext     with schema extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

-- Private schema: NOT exposed through PostgREST. Holds RLS helpers + trigger fns.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated;

create or replace function app_private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- company_id is the tenant anchor: never movable after insert.
create or replace function app_private.forbid_company_id_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function app_private.forbid_modify() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
