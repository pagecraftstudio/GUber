-- 0042 (M3A-1, schema only): domains become servable only on purpose. No new tenant-facing table.
--
-- WHY
--   Today a DNS-verified domain would be served by resolve_tenant() before it is attached in Vercel and has a certificate.
--   "Verified" (DNS proof of ownership) and "serving" (we really answer on that hostname) are different states.
--
-- WHAT
--   1. domains: serving_status (pending | active | disabled), ssl_ready, last_checked_at, last_error, activated_at,
--      disabled_at, created_by. Consistency CHECKs: active requires verified + activated_at; disabled requires disabled_at.
--   2. domains_hostname_format tightened: per-label rule, labels 1-63 chars, total <= 253, TLD starts with a letter
--      (so IPv4 is impossible), no punycode labels in v1 (homograph defence). Added NOT VALID here; validated in 0043
--      after a pre-flight that names any offending row.
--   3. app_private.reserved_names: permanent reserved slugs AND time-boxed holds (takeover cooldown for removed hostnames).
--      A table, not a CHECK list: cooldowns carry a company and an expiry, and changing the list must not need an ALTER.
--   4. Closes the gap documented in 0015: super_admin could write `domains` directly through the API, unaudited.
--      Every domain mutation now goes through SECURITY DEFINER RPCs (M3B). Nothing in src/ writes domains today.
--
-- NOT HERE (later migrations of this phase)
--   0043 seeds/backfill/permission/entitlement/rate-limit policies. 0044 guards, slug immutability, resolver changes.
--
-- ROLLBACK (manual, in this order)
--   grant insert, update on public.domains to authenticated;
--   create policy platform_insert on public.domains for insert to authenticated with check (app_private.platform_role() = 'super_admin');
--   create policy platform_update on public.domains for update to authenticated using (app_private.platform_role() = 'super_admin')
--                                                    with check (app_private.platform_role() = 'super_admin');
--   drop table app_private.reserved_names;
--   alter table public.domains drop constraint domains_hostname_format;
--   alter table public.domains add constraint domains_hostname_format check (hostname::text = lower(hostname::text)
--       and hostname::text ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$');
--   alter table public.domains drop constraint domains_active_is_verified, drop constraint domains_active_has_timestamp,
--       drop constraint domains_disabled_has_timestamp;
--   alter table public.domains drop column serving_status, drop column ssl_ready, drop column last_checked_at, drop column last_error,
--       drop column activated_at, drop column disabled_at, drop column created_by;
-- RUNNER NOTE: apply 0042, 0043, 0044 together and BEFORE deploying code that reads serving_status. Requires 0041.
set search_path = public, extensions;

-- ---- 1. serving state ----
alter table public.domains
  add column serving_status text not null default 'pending' check (serving_status in ('pending','active','disabled')),
  add column ssl_ready boolean not null default false,
  add column last_checked_at timestamptz,
  add column last_error text,
  add column activated_at timestamptz,
  add column disabled_at timestamptz,
  add column created_by uuid references public.profiles(id) on delete set null;

alter table public.domains
  add constraint domains_active_is_verified check (serving_status <> 'active' or verification_status = 'verified'),
  add constraint domains_active_has_timestamp check (serving_status <> 'active' or activated_at is not null),
  add constraint domains_disabled_has_timestamp check (serving_status <> 'disabled' or disabled_at is not null);

create index domains_created_by_idx on public.domains(created_by) where created_by is not null;

-- ---- 2. strict hostname format (validated in 0043) ----
alter table public.domains drop constraint domains_hostname_format;
alter table public.domains add constraint domains_hostname_format check (
  hostname::text = lower(hostname::text)
  and length(hostname::text) <= 253
  and hostname::text ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
  and hostname::text !~ '(^|\.)xn--'
) not valid;

-- ---- 3. reserved names ----
-- scope 'slug'     : value is a company slug (first label of the default tenant host, and /s/<slug> in path mode).
-- scope 'hostname' : value is a full hostname held after removal.
-- held_by_company NULL = reserved for everyone (platform list). Set = only that company may use it again, until reserved_until.
create table app_private.reserved_names (
  name citext not null,
  scope text not null check (scope in ('slug','hostname')),
  reason text not null,
  held_by_company uuid references public.companies(id) on delete cascade,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (scope, name),
  constraint reserved_names_hold_has_expiry check (held_by_company is null or reserved_until is not null)
);
create index reserved_names_company_idx on app_private.reserved_names(held_by_company) where held_by_company is not null;

alter table app_private.reserved_names enable row level security;
revoke all on app_private.reserved_names from public, anon, authenticated;

-- ---- 4. no direct domain writes from the API ----
drop policy if exists platform_insert on public.domains;
drop policy if exists platform_update on public.domains;
revoke insert, update, delete on public.domains from authenticated, anon;
