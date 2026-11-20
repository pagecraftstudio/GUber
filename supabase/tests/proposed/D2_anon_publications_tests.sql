-- PROPOSED (not in tests/run-all-local.sh): D2, close anon's direct access to website_publications.
-- Fails on 0047 today, passes once the D2 migration (proposed/0048_close_anon_publications.sql) is applied. Move it to supabase/tests/42_*.sql
-- and add it to the runner in the same commit as that migration.
--
-- WHY: anon still holds table SELECT on website_publications (0046 left it for the public site; M3D now reads through get_public_site).
-- Through PostgREST an anonymous caller can therefore read, for every published company, the staff-only `note` and `published_by`
-- (the staff member's auth user id), plus the whole snapshot, with no RPC and no audit. The snapshot is public by design; the other two are not.
select t.as_admin();
create or replace function t.err42d2(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
delete from app_private.rate_limit_counters; delete from public.website_publications; delete from public.website_sections; delete from public.website_pages;
update public.website_settings set is_published = false, site_title = '{"en":"Company A"}' where company_id = t.u(101);
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(701), t.u(101), '', '{"en":"Home"}', true);
insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(701), 'hero', 1, '{"title":{"en":"D2"}}');
select t.as_user(t.u(2)); select t.eq('D2 setup: A published, with a staff note', public.publish_website('INTERNAL STAFF NOTE'), 1);
select t.as_anon();
select t.eq('D2: anon cannot read the table at all', t.err42d2($$select count(*) from public.website_publications$$), '42501');
select t.eq('D2: anon cannot read the staff note', t.err42d2($$select note from public.website_publications$$), '42501');
select t.eq('D2: anon cannot read published_by (a staff auth user id)', t.err42d2($$select published_by from public.website_publications$$), '42501');
select t.eq('D2: the public site still works through the RPC (by host)', public.get_public_site('a.test', null)->'company'->>'slug', 'company-a');
select t.eq('D2: the RPC answer carries neither the note nor the publisher', (public.get_public_site('a.test', null)::text) !~ 'INTERNAL STAFF NOTE|published_by', true);
select t.as_user(t.u(2));
select t.eq('D2: staff still read their own version history', t.rows('select 1 from public.website_publications'), 1::bigint);
select t.as_user(t.u(7));
select t.eq('D2: another company still sees none of it', t.rows('select 1 from public.website_publications'), 0::bigint);
select t.as_admin();
delete from public.website_publications; delete from public.website_sections; delete from public.website_pages;
update public.website_settings set is_published = (company_id = t.u(101)), site_title = null where company_id in (t.u(101), t.u(102));
delete from app_private.rate_limit_counters;
