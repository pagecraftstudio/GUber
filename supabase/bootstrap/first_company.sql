-- DEV/BOOTSTRAP ONLY, until the Phase 10 Super Admin UI exists. Run in the Supabase SQL editor (runs as postgres).
-- Creates a company, a trial subscription, and an OWNER invitation. Prints the invite link ONCE; only its hash is stored.
-- Edit the four values in `params`. Plan limits are PLACEHOLDERS (migration 0005, decision D8).
with params as (
  select 'REPLACE Company Name'::text      as company_name,
         'replace-slug'::text              as slug,            -- lower-case, 3-40 chars, becomes the default subdomain
         'owner@example.com'::text         as owner_email,
         'starter'::text                   as plan_code,
         'https://YOUR-APP-HOST'::text     as app_url          -- NEXT_PUBLIC_SITE_URL, no trailing slash
), new_company as (
  insert into public.companies (name, slug)
  select company_name, slug from params
  returning id
), new_sub as (
  insert into public.subscriptions (company_id, plan_id, status, billing_interval, trial_ends_at, current_period_start, current_period_end)
  select c.id, pl.id, 'trialing', 'monthly', now() + interval '14 days', now(), now() + interval '14 days'
  from new_company c, params p join public.plans pl on pl.code = p.plan_code
  returning company_id
), tok as (
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token
), new_invite as (
  insert into public.company_invites (company_id, email, role_id, token_hash, expires_at)
  select c.id, lower(p.owner_email)::extensions.citext, r.id,
         encode(sha256(convert_to(t.token, 'utf8')), 'hex'), now() + interval '7 days'
  from new_company c, params p, tok t, public.roles r
  where r.key = 'owner' and exists (select 1 from new_sub)
  returning id
)
select p.app_url || '/invite/' || t.token as owner_invite_link
from params p, tok t, new_invite;
