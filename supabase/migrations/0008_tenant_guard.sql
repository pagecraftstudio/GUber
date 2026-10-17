-- 0008: F1 fix. Tenant guard on every tenant-owned table.
--
-- PROBLEM (found in Phase 4): Postgres fires BEFORE ROW triggers BEFORE the RLS WITH CHECK. Several of our
-- triggers are SECURITY DEFINER and read tenant state keyed by NEW.company_id (plan limits, subscription,
-- bus/driver status, stop/route links). Company A could insert a row carrying Company B's company_id and learn
-- B's state from WHICH error came back (53400 plan limit, "no active subscription", "bus is not active", ...).
--
-- FIX: a first-firing BEFORE INSERT OR UPDATE trigger on every table that has a company_id column. For the two API
-- roles it rejects any company_id the caller is not a member of, with EXACTLY the message and SQLSTATE that RLS
-- would produce, before any other trigger can read or lock anything.
--
-- Design notes
--  * Authorization is derived from auth.uid() (signed JWT) -> company_users / platform_users in the database.
--    No client-supplied company id, role or metadata is trusted.
--  * Trigger functions run in the order of their NAMES. The guard is named "000_tenant_guard" so it sorts before
--    every other trigger; a test asserts this for every guarded table.
--  * The function is SECURITY INVOKER on purpose: inside a SECURITY DEFINER function current_user is the
--    function owner, so only an invoker function can see that the statement came from the API role.
--  * It only governs 'anon' and 'authenticated'. Code that runs as a trusted owner (SECURITY DEFINER RPCs such as
--    accept_invite, which legitimately inserts a membership for a user who is not yet a member; migrations;
--    service jobs) is not touched. Those RPCs do their own authorization.
--  * Platform staff (verified through platform_users, not through anything the client sends) pass the guard and
--    are then judged by the platform RLS policies, so legitimate operations keep working.
--  * DELETE is not guarded: Postgres only fires row triggers for rows that survived the RLS USING filter, so a
--    tenant cannot reach another tenant's rows with a DELETE trigger.
set search_path = public, extensions;

create or replace function app_private.tenant_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'anon' then
    raise exception 'new row violates row-level security policy for table "%"', tg_table_name using errcode = '42501';
  end if;
  if current_user = 'authenticated' then
    if auth.uid() is null
       or new.company_id is null
       or not (new.company_id in (select app_private.current_company_ids()))
    then
      -- not a member of the target company: only verified platform staff may continue (to platform RLS)
      if auth.uid() is null or not app_private.is_platform_user() then
        raise exception 'new row violates row-level security policy for table "%"', tg_table_name using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'company_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop trigger if exists "000_tenant_guard" on public.%I', t);
    execute format('create trigger "000_tenant_guard" before insert or update on public.%I
                    for each row execute function app_private.tenant_guard()', t);
  end loop;
end $$;

-- CI / test helper: tables that have a company_id column but no guard, or whose guard is not the first
-- BEFORE INSERT/UPDATE row trigger. Must return zero rows. Run it after every migration that adds a table.
create or replace function app_private.tenant_guard_problems() returns table (table_name text, problem text)
language sql stable security definer set search_path = '' as $$
  with tenant_tables as (
    select c.relname::text as t, c.oid as oid
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ), row_triggers as (
    select tg.tgrelid as oid, tg.tgname::text as name
    from pg_trigger tg
    where not tg.tgisinternal and (tg.tgtype & 1) = 1      -- row level
      and (tg.tgtype & 2) = 2                              -- BEFORE
      and (tg.tgtype & 20) <> 0                            -- INSERT or UPDATE
  )
  select tt.t, 'missing 000_tenant_guard'
  from tenant_tables tt
  where not exists (select 1 from row_triggers r where r.oid = tt.oid and r.name = '000_tenant_guard')
  union all
  select tt.t, 'guard does not fire first (' || (select min(r.name collate "C") from row_triggers r where r.oid = tt.oid) || ')'
  from tenant_tables tt
  where exists (select 1 from row_triggers r where r.oid = tt.oid and r.name = '000_tenant_guard')
    and (select min(r.name collate "C") from row_triggers r where r.oid = tt.oid) <> '000_tenant_guard'
$$;
revoke all on function app_private.tenant_guard_problems() from public, anon, authenticated;
