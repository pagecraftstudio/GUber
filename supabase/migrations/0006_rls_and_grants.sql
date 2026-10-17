-- 0006: RLS helpers, policies, grants, public RPCs. Tables and policies ship together.
-- Rules: tenant is ALWAYS derived from auth.uid() -> company_users. Client company_id is only ever
-- VERIFIED against that membership, never trusted. Suspended/cancelled/deleted company => zero access.
set search_path = public, extensions;

-- ======================= HELPERS (SECURITY DEFINER, private schema) =======================
create or replace function app_private.platform_role() returns text
language sql stable security definer set search_path = '' as $$
  select pu.role from public.platform_users pu
  join public.profiles p on p.id = pu.user_id
  where pu.user_id = auth.uid() and pu.is_active and p.is_active
$$;

create or replace function app_private.is_platform_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.platform_role() is not null
$$;

create or replace function app_private.is_company_active(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.companies c
                 where c.id = p_company and c.deleted_at is null and c.status in ('trial','active'))
$$;

-- Written for N memberships (Q8 constraint can be dropped later without touching this).
create or replace function app_private.current_company_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select cu.company_id
  from public.company_users cu
  join public.profiles p on p.id = cu.user_id and p.is_active
  join public.companies c on c.id = cu.company_id and c.deleted_at is null and c.status in ('trial','active')
  where cu.user_id = auth.uid() and cu.status = 'active'
$$;

create or replace function app_private.has_permission(p_company uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_users cu
    join public.profiles p on p.id = cu.user_id and p.is_active
    join public.companies c on c.id = cu.company_id and c.deleted_at is null and c.status in ('trial','active')
    join public.role_permissions rp on rp.role_id = cu.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where cu.user_id = auth.uid() and cu.company_id = p_company and cu.status = 'active' and pm.key = p_key)
$$;

create or replace function app_private.is_my_driver(p_company uuid, p_driver uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_driver is not null and exists (
    select 1 from public.drivers d
    where d.id = p_driver and d.company_id = p_company and d.user_id = auth.uid() and d.status = 'active')
$$;

create or replace function app_private.driver_route_ok(p_company uuid, p_route uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_permission(p_company, 'trips.read_assigned') and exists (
    select 1 from public.trips t join public.drivers d on d.id = t.driver_id and d.company_id = t.company_id
    where t.company_id = p_company and t.route_id = p_route and d.user_id = auth.uid())
$$;

create or replace function app_private.driver_bus_ok(p_company uuid, p_bus uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.has_permission(p_company, 'trips.read_assigned') and exists (
    select 1 from public.trips t join public.drivers d on d.id = t.driver_id and d.company_id = t.company_id
    where t.company_id = p_company and t.bus_id = p_bus and d.user_id = auth.uid())
$$;

create or replace function app_private.can_read_profile(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_users target
    where target.user_id = p_profile
      and app_private.has_permission(target.company_id, 'users.read'))
$$;

create or replace function app_private.has_verified_domain(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.domains d where d.company_id = p_company and d.verification_status = 'verified')
$$;

-- Plans a caller may see: active AND (public OR one of their own companies subscribes to it).
create or replace function app_private.plan_visible(p_plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.plans p
    where p.id = p_plan and p.is_active
      and (p.is_public or exists (
        select 1 from public.subscriptions s
        where s.plan_id = p.id and s.company_id in (select app_private.current_company_ids())))
  )
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function
  app_private.platform_role(), app_private.is_platform_user(), app_private.is_company_active(uuid),
  app_private.current_company_ids(), app_private.has_permission(uuid, text),
  app_private.is_my_driver(uuid, uuid), app_private.driver_route_ok(uuid, uuid),
  app_private.driver_bus_ok(uuid, uuid), app_private.can_read_profile(uuid),
  app_private.has_verified_domain(uuid), app_private.plan_visible(uuid)
to authenticated;
grant execute on function
  app_private.is_company_active(uuid), app_private.has_verified_domain(uuid), app_private.plan_visible(uuid)
to anon;

-- ======================= ENABLE RLS ON EVERYTHING =======================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ======================= TENANT POLICIES (permission-driven) =======================
-- ops: i = insert, u = update, d = delete. NULL write permission = no direct client writes
-- (writes go through SECURITY DEFINER RPCs in later phases).
do $$
declare r record;
begin
  for r in select * from (values
    ('routes',            'routes.read',    'routes.write',    'iu'),
    ('route_stops',       'routes.read',    'routes.write',    'iud'),
    ('buses',             'buses.read',     'buses.write',     'iu'),
    ('drivers',           'drivers.read',   'drivers.write',   'iu'),
    ('trip_templates',    'trips.read',     'trips.write',     'iud'),
    ('customers',         'customers.read', 'customers.write', 'iu'),
    ('bookings',          'bookings.read',  null,              ''),
    ('booking_payments',  'bookings.read',  null,              ''),
    ('company_settings',  'settings.read',  'settings.write',  'u'),
    ('website_settings',  'website.read',   'website.write',   'iu'),
    ('website_pages',     'website.read',   'website.write',   'iud'),
    ('website_sections',  'website.read',   'website.write',   'iud'),
    ('website_publications','website.read', null,              ''),
    ('media',             'media.read',     'media.write',     'iu'),
    ('subscriptions',     'billing.read',   null,              ''),
    ('invoices',          'billing.read',   null,              ''),
    ('payments',          'billing.read',   null,              ''),
    ('domains',           'domains.read',   null,              ''),
    ('company_invites',   'users.read',     null,              ''),
    ('audit_logs',        'audit.read',     null,              '')
  ) as v(t, rp, wp, ops)
  loop
    execute format('create policy tenant_select on public.%I for select to authenticated
                    using (app_private.has_permission(company_id, %L))', r.t, r.rp);
    if r.wp is not null and position('i' in r.ops) > 0 then
      execute format('create policy tenant_insert on public.%I for insert to authenticated
                      with check (app_private.has_permission(company_id, %L))', r.t, r.wp);
    end if;
    if r.wp is not null and position('u' in r.ops) > 0 then
      execute format('create policy tenant_update on public.%I for update to authenticated
                      using (app_private.has_permission(company_id, %L))
                      with check (app_private.has_permission(company_id, %L))', r.t, r.wp, r.wp);
    end if;
    if r.wp is not null and position('d' in r.ops) > 0 then
      execute format('create policy tenant_delete on public.%I for delete to authenticated
                      using (app_private.has_permission(company_id, %L))', r.t, r.wp);
    end if;
  end loop;
end $$;

-- trips: staff see all; a driver sees only trips assigned to them. Delete only drafts.
create policy tenant_select on trips for select to authenticated
  using (app_private.has_permission(company_id, 'trips.read')
         or (app_private.has_permission(company_id, 'trips.read_assigned')
             and app_private.is_my_driver(company_id, driver_id)));
create policy tenant_insert on trips for insert to authenticated
  with check (app_private.has_permission(company_id, 'trips.write'));
create policy tenant_update on trips for update to authenticated
  using (app_private.has_permission(company_id, 'trips.write'))
  with check (app_private.has_permission(company_id, 'trips.write'));
create policy tenant_delete on trips for delete to authenticated
  using (app_private.has_permission(company_id, 'trips.write') and status = 'draft');

-- driver least-privilege: only what their assigned trips need. Passenger list = RPC later (Phase 8).
create policy driver_select on routes for select to authenticated
  using (app_private.driver_route_ok(company_id, id));
create policy driver_select on route_stops for select to authenticated
  using (app_private.driver_route_ok(company_id, route_id));
create policy driver_select on buses for select to authenticated
  using (app_private.driver_bus_ok(company_id, id));
create policy driver_select on drivers for select to authenticated
  using (user_id = auth.uid() and app_private.has_permission(company_id, 'trips.read_assigned'));

-- company_users: own row (to learn own role) + users.read. Writes only via RPC (anti privilege escalation).
create policy own_select on company_users for select to authenticated
  using (user_id = auth.uid() and company_id in (select app_private.current_company_ids()));
create policy tenant_select on company_users for select to authenticated
  using (app_private.has_permission(company_id, 'users.read'));

-- companies: NO tenant policy at all (suspension_reason stays platform-only). Tenants use my_company view.
-- company_notes: NO tenant policy at all.

-- notification templates: platform defaults visible to all signed-in users; company rows by permission.
create policy tenant_select on notification_templates for select to authenticated
  using (company_id is null or app_private.has_permission(company_id, 'notifications.read'));
create policy tenant_insert on notification_templates for insert to authenticated
  with check (company_id is not null and app_private.has_permission(company_id, 'notifications.write'));
create policy tenant_update on notification_templates for update to authenticated
  using (company_id is not null and app_private.has_permission(company_id, 'notifications.write'))
  with check (company_id is not null and app_private.has_permission(company_id, 'notifications.write'));
create policy tenant_delete on notification_templates for delete to authenticated
  using (company_id is not null and app_private.has_permission(company_id, 'notifications.write'));

-- notifications: own inbox + staff with permission. Users may only mark their own as read.
create policy inbox_select on notifications for select to authenticated
  using (recipient_user_id = auth.uid() and (company_id is null or app_private.is_company_active(company_id)));
create policy tenant_select on notifications for select to authenticated
  using (company_id is not null and app_private.has_permission(company_id, 'notifications.read'));
create policy inbox_update on notifications for update to authenticated
  using (recipient_user_id = auth.uid() and (company_id is null or app_private.is_company_active(company_id)))
  with check (recipient_user_id = auth.uid());

-- profiles
create policy own_select on profiles for select to authenticated using (id = auth.uid());
create policy colleagues_select on profiles for select to authenticated using (app_private.can_read_profile(id));
create policy own_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- platform_users: see own row
create policy own_select on platform_users for select to authenticated using (user_id = auth.uid());

-- global catalog: read-only to everyone signed in
create policy catalog_select on roles for select to authenticated using (true);
create policy catalog_select on permissions for select to authenticated using (true);
create policy catalog_select on role_permissions for select to authenticated using (true);
create policy catalog_select on entitlement_definitions for select to authenticated using (true);
create policy catalog_select on plans for select to authenticated using (app_private.plan_visible(id));
create policy catalog_select on plan_entitlements for select to authenticated using (app_private.plan_visible(plan_id));
create policy public_select on plans for select to anon using (is_public and is_active);
create policy public_select on plan_entitlements for select to anon using (app_private.plan_visible(plan_id));

-- public website: ONLY the current immutable snapshot, only for active companies on a verified domain.
create policy public_select on website_publications for select to anon
  using (is_current and app_private.is_company_active(company_id) and app_private.has_verified_domain(company_id));

-- ======================= PLATFORM POLICIES (MALAKY staff) =======================
-- Read: any active platform user, ignores company suspension. Write: super_admin; billing role on billing tables.
-- NO delete policy for platform users either (hard purge = audited function only).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy platform_select on public.%I for select to authenticated
                    using (app_private.is_platform_user())', t);
    if t not in ('profiles','audit_logs') then
      execute format('create policy platform_insert on public.%I for insert to authenticated
                      with check (app_private.platform_role() = ''super_admin'')', t);
      execute format('create policy platform_update on public.%I for update to authenticated
                      using (app_private.platform_role() = ''super_admin'')
                      with check (app_private.platform_role() = ''super_admin'')', t);
    end if;
  end loop;
end $$;
do $$
declare t text;
begin
  foreach t in array array['subscriptions','invoices','payments'] loop
    execute format('create policy platform_billing_insert on public.%I for insert to authenticated
                    with check (app_private.platform_role() = ''billing'')', t);
    execute format('create policy platform_billing_update on public.%I for update to authenticated
                    using (app_private.platform_role() = ''billing'')
                    with check (app_private.platform_role() = ''billing'')', t);
  end loop;
end $$;
create policy platform_support_note_insert on company_notes for insert to authenticated
  with check (app_private.platform_role() = 'support' and author_id = auth.uid());

-- ======================= GRANTS (least privilege; RLS is the second lock) =======================
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update on all tables in schema public to authenticated;
grant delete on route_stops, trip_templates, website_pages, website_sections, website_sections,
                notification_templates, trips to authenticated;
revoke insert, update on audit_logs from authenticated;           -- append-only, server-side writer only
grant select on plans, plan_entitlements, website_publications to anon;

-- trips: seats_booked / buffer_minutes / blocked_until are never client-writable (R1, R2).
revoke insert, update on trips from authenticated;
grant insert (company_id, route_id, bus_id, driver_id, departure_at, arrival_at, template_id,
              price, capacity, status, notes) on trips to authenticated;
grant update (route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status, notes)
  on trips to authenticated;

-- profiles: email / is_active / id not client-writable.
revoke insert, update on profiles from authenticated;
grant update (full_name, phone, locale, avatar_media_id) on profiles to authenticated;

-- notifications: clients can only mark read; everything else is server-side.
revoke insert, update on notifications from authenticated;
grant update (status, read_at) on notifications to authenticated;

-- ======================= PUBLIC / TENANT RPCs & VIEWS =======================
-- Safe subset of companies for tenants (no suspension_reason, no internal fields).
create or replace view my_company as
  select c.id, c.name, c.slug, c.status, c.legal_name, c.tax_number,
         c.contact_email, c.contact_phone, c.country, c.created_at
  from public.companies c
  where c.id in (select app_private.current_company_ids());
revoke all on my_company from public, anon;
grant select on my_company to authenticated;

-- Host -> tenant. Verified domain + active company only. Used by Next.js middleware.
create or replace function public.resolve_tenant(p_hostname text)
returns table (company_id uuid, slug text, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug::text, c.status
  from public.domains d join public.companies c on c.id = d.company_id
  where d.hostname = lower(trim(p_hostname)) and d.verification_status = 'verified'
    and c.deleted_at is null and c.status in ('trial','active')
$$;
revoke all on function public.resolve_tenant(text) from public;
grant execute on function public.resolve_tenant(text) to anon, authenticated;

-- Lets a locked-out staff member see "suspended, contact support" without any data access (Q7).
create or replace function public.my_company_status()
returns table (company_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.status from public.company_users cu
  join public.companies c on c.id = cu.company_id
  where cu.user_id = auth.uid() and cu.status = 'active'
$$;
revoke all on function public.my_company_status() from public, anon;
grant execute on function public.my_company_status() to authenticated;
