-- 40: M3E-3 draft preview (migration 0047).
-- Fixtures (01): A = company 101, B = 102. Users: 1 super_admin (no membership), 2 ownerA, 7 ownerB.
select t.as_admin();
create or replace function t.err40(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt40(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;

delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A DRAFT') where company_id = t.u(101);
update public.website_settings set site_title = null where company_id = t.u(102);
insert into public.website_pages (id, company_id, slug, title, is_home) values
  (t.u(481), t.u(101), '', '{"en":"Home"}', true),
  (t.u(482), t.u(101), 'about', '{"en":"About"}', false);
insert into public.website_sections (company_id, page_id, type, sort_order, content) values
  (t.u(101), t.u(481), 'hero', 1, '{"title":{"en":"Draft hero"}}'),
  (t.u(101), t.u(481), 'about', 2, '{"body":{"en":"hidden"}}'),
  (t.u(101), t.u(482), 'about', 1, '{"body":{"en":"About page"}}');
update public.website_sections set is_enabled = false where page_id = t.u(481) and type = 'about';

-- permission and identity
select t.as_anon();       select t.eq('preview: anon refused', t.err40($$select public.preview_website_draft()$$), '42501');
select t.as_user(t.u(1)); select t.eq('preview: platform staff without a membership refused', t.err40($$select public.preview_website_draft()$$), '42501');

-- owner A sees the draft, in the public-site shape
select t.as_user(t.u(2));
select t.eq('preview: company is the caller''s own', public.preview_website_draft()->'company'->>'slug', (select slug from public.companies where id = t.u(101)));
select t.eq('preview: version 0 marks a draft', (public.preview_website_draft()->>'version')::int, 0);
select t.eq('preview: draft title shown', public.preview_website_draft()->'site'->'settings'->'site_title'->>'en', 'Company A DRAFT');
select t.eq('preview: both pages included, home first',
  (select string_agg(p->>'slug', ',' order by o) from jsonb_array_elements(public.preview_website_draft()->'site'->'pages') with ordinality as x(p, o)), ',about');
select t.eq('preview: disabled sections excluded',
  jsonb_array_length(public.preview_website_draft()->'site'->'pages'->0->'sections'), 1);
select t.eq('preview: same shape as get_public_site (keys)',
  (select array_agg(k order by k) from jsonb_object_keys(public.preview_website_draft()) k), array['company','published_at','site','version']);

-- reads only: nothing published, nothing written
select t.as_admin();
select t.eq('preview: does not publish', t.cnt40('select count(*) from public.website_publications'), 0::bigint);
select t.eq('preview: not audited (read only)', t.cnt40($$select count(*) from public.audit_logs where action like 'website.%'$$), 0::bigint);
select t.eq('preview: public site still not served', public.get_public_site(null, (select slug from public.companies where id = t.u(101))) is null, true);

-- checklist errors surface (same as publish)
update public.website_pages set is_published = false where id = t.u(481);
select t.as_user(t.u(2));
select t.eq('preview: unpublished home page -> 23514', t.err40($$select public.preview_website_draft()$$), '23514');
select t.as_admin();
update public.website_pages set is_published = true where id = t.u(481);

-- isolation: owner B never receives A's draft; B has no title, so it gets its own checklist error
select t.as_user(t.u(7));
select t.eq('isolation: owner B gets B''s own result (checklist error), never A''s draft', t.err40($$select public.preview_website_draft()$$), '23514');
select t.as_admin();
