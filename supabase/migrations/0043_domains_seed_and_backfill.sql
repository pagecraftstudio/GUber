-- 0043 (M3A-2): data for the domains/publishing phase, backfill of existing rows, and the pre-flight that decides if it is safe.
--
-- 1. website.publish permission (decision D4): owner + manager only. Website editors keep website.write (save draft) but cannot publish.
--    Grants are DATA: 0005 granted "everything except..." at seed time, so a new key must be granted explicitly.
-- 2. entitlement max_custom_domains (D3): starter 0, professional 1, enterprise unlimited (NULL). Plans without the row get 0
--    through entitlement_limit() (missing key = 0), which is the safe default for custom plans.
-- 3. rate-limit policies (reuse 0020): domain.add, domain.check, website.publish. Authenticated buckets only: rate_limit_hit()
--    needs auth.uid(). Anonymous public reads are NOT covered by it (see M3A report, finding F1).
-- 4. reserved names: the 14 names of 0002 + the extension agreed in the audit. ABORTS if an existing company already holds one,
--    naming it: that needs a human decision (rename vs grandfather), not a silent migration.
-- 5. backfill (D1): platform_subdomain rows that are already verified become serving_status = 'active'.
--    Verified custom rows are NOT activated: they were served by the old resolver without a Vercel attach + cert check, and will
--    stop being served after 0044. They are reported with a NOTICE so the owner can re-activate them through the admin flow.
-- 6. validates the strict hostname CHECK of 0042 after listing offenders.
--
-- ROLLBACK
--   delete from role_permissions where permission_id = (select id from permissions where key = 'website.publish');
--   delete from permissions where key = 'website.publish';
--   delete from plan_entitlements where key = 'max_custom_domains'; delete from entitlement_definitions where key = 'max_custom_domains';
--   delete from app_private.rate_limit_policies where bucket in ('domain.add','domain.check','website.publish');
--   delete from app_private.reserved_names where held_by_company is null and scope = 'slug';
--   update public.domains set serving_status = 'pending', activated_at = null where serving_status = 'active';
--   (the validated hostname CHECK stays validated; rolling back 0042 replaces it.)
set search_path = public, extensions;

-- ---- 1. permission ----
insert into public.permissions (key, module) values ('website.publish', 'website');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'website.publish'
where r.key in ('owner', 'manager');

-- ---- 2. entitlement ----
insert into public.entitlement_definitions (key, value_type, description)
values ('max_custom_domains', 'integer', 'Custom domains (the default tenant subdomain is free on every plan)');

insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
select p.id, 'max_custom_domains', v.n, null
from public.plans p join (values ('starter', 0), ('professional', 1), ('enterprise', null::integer)) v(code, n) on v.code = p.code;

-- ---- 3. rate limits ----
insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('domain.add',      3600,  10, 'add_custom_domain per user per hour'),
  ('domain.check',    30,    1,  'DNS recheck per user: one per 30 seconds'),
  ('domain.check',    86400, 20, 'DNS recheck per user per day'),
  ('website.publish', 600,   10, 'publish/rollback/unpublish per user per 10 minutes'),
  ('website.publish', 86400, 50, 'publish/rollback/unpublish per user per day');

-- ---- 4. reserved slugs (+ pre-flight) ----
insert into app_private.reserved_names (name, scope, reason)
select n, 'slug', 'platform reserved' from unnest(array[
  'www','admin','api','app','mail','support','static','assets','cdn','dashboard','platform','status','blog','docs',
  'auth','driver','staff','s','guber','malaky','login','register','company','my-bookings','no-access','suspended','help'
]) as n;

do $$
declare v_bad text;
begin
  select string_agg(c.slug::text, ', ' order by c.slug::text) into v_bad
  from public.companies c join app_private.reserved_names r on r.scope = 'slug' and r.name = c.slug
  where r.held_by_company is null;
  if v_bad is not null then
    raise exception 'M3A pre-flight: existing company slug(s) collide with the reserved list: %. Rename them or remove the name from reserved_names deliberately, then re-run.', v_bad
      using errcode = '23505';
  end if;
end $$;

-- ---- 5. backfill ----
update public.domains
   set serving_status = 'active', activated_at = coalesce(verified_at, now())
 where kind = 'platform_subdomain' and verification_status = 'verified' and serving_status = 'pending';

do $$
declare v_custom text;
begin
  select string_agg(hostname::text, ', ' order by hostname::text) into v_custom
  from public.domains where kind = 'custom' and verification_status = 'verified' and serving_status = 'pending';
  if v_custom is not null then
    raise notice 'M3A: verified custom domain(s) are NOT active and will stop being served: %. Re-activate through the admin flow after the Vercel attach.', v_custom;
  end if;
end $$;

-- ---- 6. strict hostname format ----
do $$
declare v_bad text;
begin
  select string_agg(hostname::text, ', ' order by hostname::text) into v_bad
  from public.domains d
  where not (
    d.hostname::text = lower(d.hostname::text) and length(d.hostname::text) <= 253
    and d.hostname::text ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
    and d.hostname::text !~ '(^|\.)xn--');
  if v_bad is not null then
    raise exception 'M3A pre-flight: hostname(s) violate the strict format: %. Fix or delete them, then re-run.', v_bad using errcode = '23514';
  end if;
end $$;
alter table public.domains validate constraint domains_hostname_format;
