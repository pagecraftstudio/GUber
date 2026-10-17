-- 0015: Phase 7.1 - platform security foundation.
--
-- PURPOSE
--   Before any superadmin UI exists, close the database holes found in the Phase 7 audit:
--   R1  super_admin could write companies / subscriptions / plans / ... directly through the API, unaudited.
--   R2  super_admin could grant or change platform roles through the API (platform_users), unaudited.
--   R3  an expired subscription (current_period_end in the past) kept working: nothing compared the period to now().
--   R5  nothing stopped the last active super_admin from being removed.
--   After this migration every privileged mutation on these tables must go through a SECURITY DEFINER function that
--   authorizes from auth.uid() -> platform_users and writes audit_logs. Those functions arrive in 7.3 / 7.4.
--
-- WHAT CHANGES
--   1. Direct INSERT/UPDATE paths removed for platform roles on: companies, subscriptions, invoices, payments,
--      platform_users, plans, plan_entitlements, entitlement_definitions, company_notes.
--      (RLS policies dropped AND table privileges revoked from `authenticated`, so a future mistaken policy cannot reopen it.)
--      KEPT: every platform_select policy; every platform write policy on tenant-operational tables.
--      NOT CHANGED (known, accepted gap until Phase 12): direct super_admin writes to `domains`.
--      Trusted owner paths keep working: migrations, SECURITY DEFINER functions, supabase/bootstrap/first_super_admin.sql.
--   2. Last-super-admin guard on platform_users and profiles.is_active.
--   3. app_private.live_subscription(); entitlement_limit() now requires current_period_end > now().
--      Effect: an expired subscription blocks NEW users/buses/drivers/routes/trips/bookings; reads keep working.
--      is_company_active() is NOT changed: suspension stays the only full lockout.
--   4. companies.contact_name (responsible person), nullable.
--   5. Helpers for later subphases: app_private.assert_platform(), app_private.audit_platform().
--
-- NOTE FOR 7.4: subscriptions_one_live_idx counts a stale 'active' row whose period ended as live, so assigning a new
-- subscription must expire/cancel the old row first (the admin RPC will do that).
--
-- ROLLBACK (manual, in this order)
--   drop trigger if exists keep_one_super_admin on public.platform_users;
--   drop trigger if exists keep_one_super_admin_profile on public.profiles;
--   drop function if exists app_private.keep_one_super_admin(), app_private.keep_one_super_admin_profile(),
--                           app_private.assert_platform(text[]), app_private.audit_platform(uuid,text,text,uuid,jsonb,jsonb);
--   -- restore the previous entitlement_limit() body from 0004_triggers.sql (copy the create or replace there), then:
--   drop function if exists app_private.live_subscription(uuid);
--   alter table public.companies drop column if exists contact_name;
--   grant insert, update on public.companies, public.subscriptions, public.invoices, public.payments, public.platform_users,
--         public.plans, public.plan_entitlements, public.entitlement_definitions, public.company_notes to authenticated;
--   -- recreate per table (same text as 0006):
--   --   create policy platform_insert on public.<t> for insert to authenticated with check (app_private.platform_role() = 'super_admin');
--   --   create policy platform_update on public.<t> for update to authenticated using (app_private.platform_role() = 'super_admin')
--   --                                                          with check (app_private.platform_role() = 'super_admin');
--   --   subscriptions/invoices/payments additionally: platform_billing_insert / platform_billing_update (role = 'billing');
--   --   company_notes additionally: platform_support_note_insert (role = 'support' and author_id = auth.uid()).
set search_path = public, extensions;

-- ======================= 1. NO DIRECT PLATFORM WRITES ON SENSITIVE TABLES =======================
drop policy if exists platform_insert on public.companies;
drop policy if exists platform_update on public.companies;

drop policy if exists platform_insert on public.subscriptions;
drop policy if exists platform_update on public.subscriptions;
drop policy if exists platform_billing_insert on public.subscriptions;
drop policy if exists platform_billing_update on public.subscriptions;

drop policy if exists platform_insert on public.invoices;
drop policy if exists platform_update on public.invoices;
drop policy if exists platform_billing_insert on public.invoices;
drop policy if exists platform_billing_update on public.invoices;

drop policy if exists platform_insert on public.payments;
drop policy if exists platform_update on public.payments;
drop policy if exists platform_billing_insert on public.payments;
drop policy if exists platform_billing_update on public.payments;

drop policy if exists platform_insert on public.platform_users;
drop policy if exists platform_update on public.platform_users;

drop policy if exists platform_insert on public.plans;
drop policy if exists platform_update on public.plans;

drop policy if exists platform_insert on public.plan_entitlements;
drop policy if exists platform_update on public.plan_entitlements;

drop policy if exists platform_insert on public.entitlement_definitions;
drop policy if exists platform_update on public.entitlement_definitions;

drop policy if exists platform_insert on public.company_notes;
drop policy if exists platform_update on public.company_notes;
drop policy if exists platform_support_note_insert on public.company_notes;

-- Defense in depth: no API role may write these tables at all, whatever policies exist later.
-- (No tenant policy grants writes on any of them, so nothing legitimate depends on these privileges.)
revoke insert, update, delete on public.companies, public.subscriptions, public.invoices, public.payments,
  public.platform_users, public.plans, public.plan_entitlements, public.entitlement_definitions, public.company_notes
  from authenticated, anon;

-- ======================= 2. LAST ACTIVE SUPER_ADMIN GUARD =======================
-- "Active super_admin" = active platform row AND active profile (same definition as app_private.platform_role()).
create or replace function app_private.keep_one_super_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_removing boolean; v_others bigint;
begin
  v_removing := old.role = 'super_admin' and old.is_active and (
    tg_op = 'DELETE'
    or new.user_id is distinct from old.user_id
    or new.role <> 'super_admin'
    or not new.is_active);
  if not v_removing then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform:last_super_admin', 0));   -- two admins removing each other concurrently
  select count(*) into v_others
    from public.platform_users pu join public.profiles p on p.id = pu.user_id
   where pu.role = 'super_admin' and pu.is_active and p.is_active and pu.user_id <> old.user_id;
  if v_others = 0 then
    raise exception 'cannot remove the last active super_admin' using errcode = '23514';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;
create trigger keep_one_super_admin before update or delete on public.platform_users
  for each row execute function app_private.keep_one_super_admin();

-- Deactivating the profile of the last active super_admin is the same as removing it.
create or replace function app_private.keep_one_super_admin_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_others bigint;
begin
  if not (old.is_active and not new.is_active) then return new; end if;
  if not exists (select 1 from public.platform_users pu
                  where pu.user_id = old.id and pu.role = 'super_admin' and pu.is_active) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform:last_super_admin', 0));
  select count(*) into v_others
    from public.platform_users pu join public.profiles p on p.id = pu.user_id
   where pu.role = 'super_admin' and pu.is_active and p.is_active and pu.user_id <> old.id;
  if v_others = 0 then
    raise exception 'cannot deactivate the last active super_admin' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger keep_one_super_admin_profile before update of is_active on public.profiles
  for each row execute function app_private.keep_one_super_admin_profile();

revoke all on function app_private.keep_one_super_admin(), app_private.keep_one_super_admin_profile() from public, anon, authenticated;

-- ======================= 3. EXPIRY-AWARE SUBSCRIPTION ENFORCEMENT =======================
-- The single definition of "this company has a live subscription right now".
create or replace function app_private.live_subscription(p_company uuid) returns setof public.subscriptions
language sql stable security definer set search_path = '' as $$
  select s.* from public.subscriptions s
   where s.company_id = p_company
     and s.status in ('trialing','active','past_due')
     and s.current_period_end > now()
   limit 1
$$;
revoke all on function app_private.live_subscription(uuid) from public, anon, authenticated;

-- Same contract as 0004 (missing live subscription -> 42501 'no active subscription'; missing key -> 0; NULL -> unlimited),
-- but "live" now includes "period not yet ended". trips_month_limit / bookings_month_limit / enforce_limit call this.
create or replace function app_private.entitlement_limit(p_company uuid, p_key text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v_plan uuid; v_val integer; v_found boolean;
begin
  select ls.plan_id into v_plan from app_private.live_subscription(p_company) ls;
  if v_plan is null then
    raise exception 'no active subscription' using errcode = '42501';
  end if;
  select true, pe.int_value into v_found, v_val from public.plan_entitlements pe
    where pe.plan_id = v_plan and pe.key = p_key;
  if v_found is null then return 0; end if;
  return v_val;
end $$;

-- ======================= 4. RESPONSIBLE PERSON =======================
alter table public.companies add column contact_name text;
alter table public.companies add constraint companies_contact_name_len
  check (contact_name is null or length(contact_name) between 1 and 120);

-- ======================= 5. HELPERS FOR ADMIN RPCs (7.3+) =======================
-- Role is ALWAYS read from auth.uid() -> platform_users. It is never a parameter and never comes from JWT metadata.
create or replace function app_private.assert_platform(p_allowed text[] default array['super_admin']) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := app_private.platform_role();
begin
  if v_role is null or not (v_role = any (p_allowed)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_role;
end $$;

-- Audit row for a privileged platform action. Refuses to run unless the caller really is active platform staff.
create or replace function app_private.audit_platform(
  p_company uuid, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if app_private.platform_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform app_private.write_audit('platform_user', p_company, p_action, p_entity_type, p_entity_id,
                                  jsonb_build_object('before', p_before, 'after', p_after));
end $$;

revoke all on function app_private.assert_platform(text[]) from public, anon, authenticated;
revoke all on function app_private.audit_platform(uuid, text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
