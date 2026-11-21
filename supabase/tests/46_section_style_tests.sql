-- 46: E4 section style. `style` lives inside a section's content (no migration): the database must accept it, carry it into the
-- snapshot, and old sections without it must keep working. Fixtures (01): A = company 101. Users: 2 ownerA, 4 opsA, 7 ownerB.
select t.as_admin();
create or replace function t.err46(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(931), t.u(101), '', '{"en":"Home"}', true);
insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values
  (t.u(941), t.u(101), t.u(931), 'hero', 1, '{"title":{"en":"Hero"}}'),
  (t.u(942), t.u(101), t.u(931), 'about', 2, '{"title":{"en":"About"}}');

select t.as_user(t.u(2));
select t.eq('owner can set a style on a section', t.affected(format($$update public.website_sections set content = content || '{"style":{"background":"tint","align":"center","spacing":"roomy"}}'::jsonb where id = %L$$, t.u(942)::text)), 1::bigint);
select t.as_user(t.u(4));
select t.eq('operations (no website.write) cannot', t.affected(format($$update public.website_sections set content = content || '{"style":{"background":"brand"}}'::jsonb where id = %L$$, t.u(942)::text)), 0::bigint);
select t.as_user(t.u(7));
select t.eq('owner of B cannot touch A''s section', t.affected(format($$update public.website_sections set content = content || '{"style":{"background":"brand"}}'::jsonb where id = %L$$, t.u(942)::text)), 0::bigint);

select t.as_user(t.u(2));
select t.eq('publish v1 with a styled section', public.publish_website('styled'), 1);
select t.as_admin();
select t.eq('snapshot carries the style',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'pages'->0->'sections'->1->'content'->'style'->>'background', 'tint');
select t.eq('a section without style is unchanged in the snapshot',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'pages'->0->'sections'->0->'content' ? 'style', false);
select t.eq('snapshot: no other keys leaked into the style',
  (select count(*) from jsonb_object_keys(public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'pages'->0->'sections'->1->'content'->'style')), 3::bigint);
