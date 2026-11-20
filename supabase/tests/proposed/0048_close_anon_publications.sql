-- PROPOSED 0048 (D2): the public site reads only through get_public_site(); close anon's direct table access.
-- Needs approval. Safe because: the only reader of website_publications in src/ is the AUTHENTICATED staff repository (publish-repository.ts);
-- the public site and sitemap use get_public_site (M3D). get_public_site is SECURITY DEFINER, so it keeps working.
-- ROLLBACK
--   grant select on public.website_publications to anon;
--   create policy public_select on public.website_publications for select to anon
--     using (is_current and app_private.is_company_active(company_id) and app_private.has_verified_domain(company_id));
set search_path = public, extensions;
drop policy if exists public_select on public.website_publications;
revoke select on public.website_publications from anon;
