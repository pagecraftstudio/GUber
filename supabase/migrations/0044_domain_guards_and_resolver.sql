-- 0044 (M3A-3): guards and the tighter resolver.
--
-- 1. Slug is IMMUTABLE, enforced by a trigger (until now only by convention: no RPC edited it, see 0017). The slug is the tenant key in
--    path mode (/s/<slug>) and the default hostname, so a change would break every public URL and free the old slug for squatting.
--    A future admin_change_slug must drop/relax this trigger deliberately and use app_private.reserved_names for the cooldown.
-- 2. Slug reservation (platform list from 0043) enforced on company INSERT. The CHECK of 0002 stays as a second layer.
-- 3. Hostname hold (takeover cooldown): a hostname held by company A cannot be added by company B until the hold expires.
-- 4. resolve_tenant(host): serves only serving_status = 'active' (was: any DNS-verified domain). Trailing dot tolerated.
-- 5. resolve_tenant_by_slug(slug) for path mode (D5): same minimal columns, trial/active companies only.
-- 6. has_verified_domain(): "can be served" now means an ACTIVE domain; the anon public_select policy on website_publications
--    therefore follows the same rule. (D2 replaces that policy with get_public_site in M3B; not done here on purpose, the revoke
--    must come after the RPC and the code cut-over.)
--
-- ROLLBACK
--   drop trigger companies_slug_guard on public.companies; drop trigger domains_hold_guard on public.domains;
--   drop function app_private.companies_slug_guard(), app_private.domains_hold_guard(), app_private.assert_name_not_reserved(text, text, uuid);
--   drop function public.resolve_tenant_by_slug(text);
--   restore resolve_tenant() and has_verified_domain() from 0006 (verification_status = 'verified' instead of serving_status = 'active').
set search_path = public, extensions;

create or replace function app_private.assert_name_not_reserved(p_scope text, p_name text, p_company uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (
    select 1 from app_private.reserved_names r
    where r.scope = p_scope and r.name = p_name
      and (r.reserved_until is null or r.reserved_until > now())
      and (r.held_by_company is null or r.held_by_company is distinct from p_company)
  ) then
    raise exception 'name is reserved' using errcode = '22023', hint = p_scope;
  end if;
end $$;
revoke all on function app_private.assert_name_not_reserved(text, text, uuid) from public, anon, authenticated;

-- ---- 1 + 2. companies.slug ----
create or replace function app_private.companies_slug_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.assert_name_not_reserved('slug', new.slug::text, new.id);
  elsif new.slug is distinct from old.slug then
    raise exception 'slug is immutable' using errcode = '23001';
  end if;
  return new;
end $$;
revoke all on function app_private.companies_slug_guard() from public, anon, authenticated;

create trigger companies_slug_guard before insert or update of slug on public.companies
  for each row execute function app_private.companies_slug_guard();

-- ---- 3. hostname hold ----
create or replace function app_private.domains_hold_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.hostname is distinct from old.hostname then
    perform app_private.assert_name_not_reserved('hostname', new.hostname::text, new.company_id);
  end if;
  return new;
end $$;
revoke all on function app_private.domains_hold_guard() from public, anon, authenticated;

create trigger domains_hold_guard before insert or update of hostname on public.domains
  for each row execute function app_private.domains_hold_guard();

-- ---- 4. resolver ----
create or replace function public.resolve_tenant(p_hostname text)
returns table (company_id uuid, slug text, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug::text, c.status
  from public.domains d join public.companies c on c.id = d.company_id
  where d.hostname = regexp_replace(lower(trim(p_hostname)), '\.$', '')
    and d.serving_status = 'active'
    and c.deleted_at is null and c.status in ('trial','active')
$$;
revoke all on function public.resolve_tenant(text) from public;
grant execute on function public.resolve_tenant(text) to anon, authenticated;

-- ---- 5. path-mode resolver ----
create or replace function public.resolve_tenant_by_slug(p_slug text)
returns table (company_id uuid, slug text, status text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug::text, c.status
  from public.companies c
  where c.slug = lower(trim(p_slug))
    and c.deleted_at is null and c.status in ('trial','active')
$$;
revoke all on function public.resolve_tenant_by_slug(text) from public;
grant execute on function public.resolve_tenant_by_slug(text) to anon, authenticated;

-- ---- 6. "can be served" = active domain ----
create or replace function app_private.has_verified_domain(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.domains d where d.company_id = p_company and d.serving_status = 'active')
$$;
