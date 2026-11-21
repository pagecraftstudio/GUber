-- 45: E3 website look (0050). Fonts and button style are fixed lists enforced by CHECKs; the snapshot carries a `theme` object; a
-- snapshot published before the migration has none. Fixtures (01): A = company 101, B = 102. Users: 2 ownerA, 3 managerA, 4 opsA, 7 ownerB.
select t.as_admin();
create or replace function t.err45(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;

delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(911), t.u(101), '', '{"en":"Home"}', true);
insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (t.u(921), t.u(101), t.u(911), 'hero', 1, '{"title":{"en":"Hero"}}');

-- defaults and CHECKs
select t.eq('default font is the platform font', (select column_default from information_schema.columns where table_name = 'website_settings' and column_name = 'font_body'), '''plex''::text');
select t.eq('default button style is soft', (select button_style from public.website_settings where company_id = t.u(101)), 'soft');
select t.as_user(t.u(2));
select t.eq('owner can pick cairo + pill', t.affected(format($$update public.website_settings set font_heading = 'cairo', font_body = 'tajawal', button_style = 'pill' where company_id = %L$$, t.u(101)::text)), 1::bigint);
select t.eq('a font outside the list is refused (23514)', t.err45(format($$update public.website_settings set font_heading = 'comic-sans' where company_id = %L$$, t.u(101)::text)), '23514');
select t.eq('free CSS as a font is refused', t.err45(format($$update public.website_settings set font_body = 'x;}body{display:none' where company_id = %L$$, t.u(101)::text)), '23514');
select t.eq('a button style outside the list is refused (23514)', t.err45(format($$update public.website_settings set button_style = 'url(javascript:1)' where company_id = %L$$, t.u(101)::text)), '23514');
select t.as_user(t.u(4));
select t.eq('operations (no website.write) cannot change the look', t.affected(format($$update public.website_settings set button_style = 'square' where company_id = %L$$, t.u(101)::text)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('owner of B cannot change A''s look', t.affected(format($$update public.website_settings set button_style = 'square' where company_id = %L$$, t.u(101)::text)), 0::bigint);

-- snapshot carries the theme
select t.as_user(t.u(2));
select t.eq('publish v1', public.publish_website('themed'), 1);
select t.as_admin();
select t.eq('snapshot: theme heading font', public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'settings'->'theme'->>'font_heading', 'cairo');
select t.eq('snapshot: theme body font', public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'settings'->'theme'->>'font_body', 'tajawal');
select t.eq('snapshot: theme button style', public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'settings'->'theme'->>'button_style', 'pill');
select t.as_user(t.u(2));
select t.eq('preview shows the same theme as publish', public.preview_website_draft()->'site'->'settings'->'theme'->>'button_style', 'pill');
select t.as_admin();

-- a pre-0050 snapshot (no theme key) is still served
update public.website_publications set snapshot = snapshot #- '{settings,theme}' where company_id = t.u(101);
select t.eq('old snapshot without theme is still served', public.get_public_site(null, (select slug from public.companies where id = t.u(101))) is not null, true);
select t.eq('old snapshot: no theme key', public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'settings' ? 'theme', false);
