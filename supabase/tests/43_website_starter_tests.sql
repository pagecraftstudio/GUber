-- 43: W2 starter site (migration 0049). Fixtures (01): A = company 101 (professional), B = 102. Users: 1 super_admin (no membership),
-- 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB.
select t.as_admin();
create or replace function t.err43(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt43(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;
create or replace function t.starter43(p_actor uuid) returns text language plpgsql as $$
declare r text;
begin
  if p_actor is null then perform t.as_anon(); else perform t.as_user(p_actor); end if;
  begin perform public.ensure_starter_site(); r := 'Y'; exception when others then r := sqlstate; end;
  perform t.as_admin();
  return r;
end $$;

-- clean slate: no settings row, no pages, nothing published
delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
delete from public.website_settings where company_id in (t.u(101), t.u(102));

-- ================================================================================ who may call it (matrix)
select t.eq('matrix: operations refused',   t.starter43(t.u(4)), '42501');
select t.eq('matrix: booking staff refused', t.starter43(t.u(5)), '42501');
select t.eq('matrix: driver refused',        t.starter43(t.u(6)), '42501');
select t.eq('matrix: platform super_admin (no membership) refused', t.starter43(t.u(1)), '42501');
select t.eq('matrix: anonymous refused',     t.starter43(null), '42501');
select t.eq('matrix: refused callers created nothing', t.cnt43($$select (select count(*) from public.website_pages) + (select count(*) from public.website_settings where company_id in ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102'))$$), 0::bigint);

-- ================================================================================ first visit creates the starter
select t.as_user(t.u(2));
select t.eq('first call reports what it created', public.ensure_starter_site()::text, '{"created_home": true, "seeded_sections": 5, "created_settings": true}');
select t.as_admin();
select t.eq('settings row exists, not published, title = company name (en + ar)',
  (select is_published::text || ':' || (site_title->>'en') || ':' || (site_title->>'ar') from public.website_settings where company_id = t.u(101)),
  'false:' || (select name from public.companies where id = t.u(101)) || ':' || (select name from public.companies where id = t.u(101)));
select t.eq('exactly one home page, published flag on, slug empty',
  (select count(*)::text || ':' || bool_and(is_published)::text || ':' || bool_and(slug = '')::text from public.website_pages where company_id = t.u(101) and is_home), '1:true:true');
select t.eq('starter sections in order: hero, routes, trips, about, contact',
  (select string_agg(type, ',' order by sort_order) from public.website_sections where company_id = t.u(101)), 'hero,routes,trips,about,contact');
select t.eq('starter text is bilingual in the hero', (select content->'subtitle' ? 'ar' and content->'subtitle' ? 'en' from public.website_sections where company_id = t.u(101) and type = 'hero'), true);
select t.eq('nothing is public: no publication, site not served', (select count(*) from public.website_publications) || ':' || (public.get_public_site(null, (select slug from public.companies where id = t.u(101))) is null)::text, '0:true');

-- the starter is immediately publishable and previewable (same validators as any write)
select t.as_user(t.u(2));
select t.eq('preview works right after the starter', public.preview_website_draft()->'site'->'pages'->0->>'is_home', 'true');
select t.eq('the starter publishes as v1', public.publish_website('starter'), 1);
select t.as_admin();
select t.eq('...and is then live', (public.get_public_site(null, (select slug from public.companies where id = t.u(101))) is not null), true);

-- ================================================================================ idempotent, never overwrites
select t.as_user(t.u(2));
select t.eq('second call changes nothing', public.ensure_starter_site()::text, '{"created_home": false, "seeded_sections": 0, "created_settings": false}');
select t.as_admin();
update public.website_settings set site_title = '{"en":"My own title"}' where company_id = t.u(101);
update public.website_sections set content = '{"title":{"en":"Edited"}}' where company_id = t.u(101) and type = 'hero';
select t.as_user(t.u(3));
select public.ensure_starter_site();
select t.as_admin();
select t.eq('an edited title is kept', (select site_title->>'en' from public.website_settings where company_id = t.u(101)), 'My own title');
select t.eq('edited content is kept, section count unchanged', (select (content->'title'->>'en') || ':' || (select count(*) from public.website_sections where company_id = t.u(101)) from public.website_sections where company_id = t.u(101) and type = 'hero'), 'Edited:5');
-- after a first publication, an emptied home page stays empty (the owner's choice)
delete from public.website_sections where company_id = t.u(101);
select t.as_user(t.u(2));
select t.eq('published once + empty home: not re-seeded', public.ensure_starter_site()::text, '{"created_home": false, "seeded_sections": 0, "created_settings": false}');
select t.as_admin();
-- never published + empty home: seeded (a legacy empty home from the old editor, or a reset)
delete from public.website_publications;
select t.as_user(t.u(2));
select t.eq('never published + empty home: seeded', (public.ensure_starter_site()->>'seeded_sections')::int, 5);
select t.as_admin();
select t.eq('still one home page and one settings row', (select count(*) from public.website_pages where company_id = t.u(101) and is_home) || ':' || (select count(*) from public.website_settings where company_id = t.u(101)), '1:1');

-- an empty title is filled, a blank one too
update public.website_settings set site_title = '{"en":"  ","ar":""}' where company_id = t.u(101);
select t.as_user(t.u(2)); select public.ensure_starter_site(); select t.as_admin();
select t.eq('a blank title is replaced by the company name', (select site_title->>'en' from public.website_settings where company_id = t.u(101)), (select name from public.companies where id = t.u(101)));

-- ================================================================================ isolation + hostile company name
select t.as_user(t.u(7));
select t.eq('B gets its own starter', (public.ensure_starter_site()->>'seeded_sections')::int, 5);
select t.as_admin();
select t.eq('B''s rows belong to B, A still has exactly its own 5 sections',
  (select count(*) from public.website_sections where company_id = t.u(102)) || ':' || (select count(*) from public.website_sections where company_id = t.u(101)), '5:5');
select t.eq('B''s hero shows B''s name, never A''s', (select content->'title'->>'en' from public.website_sections where company_id = t.u(102) and type = 'hero'), (select name from public.companies where id = t.u(102)));
delete from public.website_sections where company_id = t.u(102);
delete from public.website_pages where company_id = t.u(102);
delete from public.website_settings where company_id = t.u(102);
update public.companies set name = 'Evil <script>alert(1)</script> Bus' where id = t.u(102);
select t.as_user(t.u(7));
select t.eq('a company name with HTML does not break the starter (brackets stripped)', t.err43($$select public.ensure_starter_site()$$), 'NO ERROR');
select t.as_admin();
select t.eq('...and the stored title has no angle brackets', (select site_title->>'en' !~ '[<>]' from public.website_settings where company_id = t.u(102)), true);

-- ================================================================================ lifecycle
update public.companies set name = (select name from public.companies where id = t.u(101)) where id = t.u(102);
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.eq('suspended company refused', t.starter43(t.u(2)), '42501');
update public.companies set status = 'active', suspended_at = null where id = t.u(101);

-- cleanup: later suites share this database
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.companies set name = 'Company B' where id = t.u(102) and name like 'Company A%';
update public.website_settings set site_title = null where company_id in (t.u(101), t.u(102));
delete from app_private.rate_limit_counters;
