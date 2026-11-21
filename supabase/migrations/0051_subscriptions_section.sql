-- 0051 (W7): a `subscriptions` website section (shows the company's public subscription plans, with a "request" button).
--
-- DESIGN
--   * Only the allowed section types change: website_sections.type CHECK gains 'subscriptions'. The section stores a title (and style) like the
--     other live sections; the PLANS themselves are never copied into the website: the public site reads them at request time through the
--     existing anonymous public_route_plans(company_id) (0034), which already decides what is public. So a plan the company archives or
--     un-publishes disappears from the site without republishing, and no price can go stale in a snapshot.
--   * No new table, function or grant. build_site_snapshot (0046) copies section type/content as they are, so it needs no change; the
--     write-side content check is the application's strict schema plus the existing validate_site_json trigger.
--
-- ROLLBACK (manual)
--   delete from public.website_sections where type = 'subscriptions';
--   alter table public.website_sections drop constraint website_sections_type_check;
--   alter table public.website_sections add constraint website_sections_type_check
--     check (type in ('hero','about','features','routes','trips','faq','contact','footer','rich_text','image'));
-- RUNNER NOTE: requires 0003. Apply with scripts/db/apply-migrations.sh BEFORE deploying code that can insert this type.
set search_path = public, extensions;

alter table public.website_sections drop constraint website_sections_type_check;
alter table public.website_sections add constraint website_sections_type_check
  check (type in ('hero','about','features','routes','trips','faq','contact','footer','rich_text','image','subscriptions'));
