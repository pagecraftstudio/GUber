-- 0047 (M3E-3): draft preview. Same JSON shape as get_public_site, built from the DRAFT instead of the current publication.
--
-- DESIGN
--   * Reuses app_private.build_site_snapshot, so the preview shows EXACTLY what publish_website would snapshot, and the same
--     checklist errors (23514: site title, published home page, an enabled home section) surface before publishing. Disabled
--     sections and unpublished pages are excluded, as they will be at publish time.
--   * Company comes from the caller's membership (caller_company), never from an argument. Permission: website.read (the same
--     permission that already lets the caller read the draft tables through RLS), so this exposes nothing new.
--   * Read only, no audit row, no rate limit (it reads data the caller can already select). version = 0 marks "draft".
--   * authenticated only: anon has no execute, so an anonymous caller gets 42501 and never reaches a draft.
--
-- ROLLBACK
--   drop function public.preview_website_draft();
-- RUNNER NOTE: requires 0045 (caller_company) and 0046 (build_site_snapshot).
set search_path = public, extensions;

create or replace function public.preview_website_draft() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_co uuid; v_name text; v_slug text;
begin
  v_co := app_private.caller_company('website.read');
  select c.name, c.slug into v_name, v_slug from public.companies c where c.id = v_co;
  return jsonb_build_object(
    'company', jsonb_build_object('name', v_name, 'slug', v_slug),
    'version', 0,
    'published_at', now(),
    'site', app_private.build_site_snapshot(v_co));
end $$;

revoke all on function public.preview_website_draft() from public, anon;
grant execute on function public.preview_website_draft() to authenticated;
