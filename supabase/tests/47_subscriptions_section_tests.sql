-- 47: W7 `subscriptions` section type. The CHECK accepts it, the write policy is unchanged (website.write only, own company only), the
-- snapshot carries it, and an unknown type is still refused. Fixtures (01): A = company 101. Users: 2 ownerA, 4 opsA, 7 ownerB.
select t.as_admin();
create or replace function t.err47(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(951), t.u(101), '', '{"en":"Home"}', true);

select t.as_user(t.u(2));
select t.eq('owner can add a subscriptions section', t.affected(format($$insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (%L, %L, %L, 'subscriptions', 1, '{"title":{"en":"Plans"}}')$$, t.u(961)::text, t.u(101)::text, t.u(951)::text)), 1::bigint);
select t.as_admin();
select t.eq('an unknown type is still refused by the CHECK', t.err47(format($$insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (%L, %L, %L, 'nonsense', 2, '{}')$$, t.u(962)::text, t.u(101)::text, t.u(951)::text)), '23514');
select t.as_user(t.u(4));
select t.eq('operations (no website.write) cannot add one', t.err47(format($$insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (%L, %L, %L, 'subscriptions', 3, '{}')$$, t.u(963)::text, t.u(101)::text, t.u(951)::text)), '42501');
select t.as_user(t.u(7));
select t.eq('owner of B cannot add one to A''s page', t.err47(format($$insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (%L, %L, %L, 'subscriptions', 4, '{}')$$, t.u(964)::text, t.u(101)::text, t.u(951)::text)), '42501');
select t.as_user(t.u(2));
select t.eq('publish carries the section', public.publish_website('plans'), 1);
select t.as_admin();
select t.eq('snapshot has the subscriptions section with its title',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'pages'->0->'sections'->0->>'type', 'subscriptions');
select t.eq('only the one section was saved (the refused ones left nothing)', (select count(*) from public.website_sections where company_id = t.u(101)), 1::bigint);
