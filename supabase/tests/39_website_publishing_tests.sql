-- 39: M3B website publishing (migration 0046).
-- Fixtures (01): A = company 101 (professional), B = 102, C = 103. Users: 1 super_admin, 2 ownerA, 3 managerA, 4 operationsA, 5 bookingA, 7 ownerB.
-- website_settings: A is_published = true (fixture), B false. media 271 belongs to B.
select t.as_admin();
create or replace function t.err39(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt39(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;

-- clean slate for this suite
delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
-- 0048 forbids SVG rows in the public bucket. This suite proves the 0046 VALIDATOR still refuses a legacy SVG row, so the constraint is lifted for the suite only.
alter table public.media drop constraint media_public_no_svg;
insert into public.media (id, company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes) values
  (t.u(391), t.u(101), 'website_image', 'company-public', t.u(101)::text || '/hero.png', 'hero.png', 'image/png', 1000),
  (t.u(392), t.u(101), 'website_image', 'company-public', t.u(101)::text || '/x.svg', 'x.svg', 'image/svg+xml', 1000),
  (t.u(393), t.u(101), 'website_image', 'company-private', t.u(101)::text || '/priv.png', 'priv.png', 'image/png', 1000);

-- 1. validation triggers (every write path): HTML, URL schemes, media references, depth
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(381), t.u(101), '', '{"en":"Home"}', true);
select t.passes('content: plain text and prose with a colon is fine',
  $$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'about', 5, '{"body":"Hours: 9-5. Call us: tomorrow"}')$$);
select t.eq('content: raw HTML refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'about', 6, '{"body":"<script>alert(1)</script>"}')$$), '22023');
select t.eq('content: <img> tag refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'about', 6, '{"body":"x <img src=x onerror=a()>"}')$$), '22023');
select t.passes('content: a math-like "3 < 5" is not HTML', $$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'about', 7, '{"body":"3 < 5 and 7 > 2"}')$$);
select t.eq('content: javascript: URL refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'hero', 8, '{"cta_url":"javascript:alert(1)"}')$$), '22023');
select t.eq('content: JaVaScRiPt: with spaces refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'hero', 8, '{"cta_url":"  JaVaScRiPt :alert(1)"}')$$), '22023');
select t.eq('content: data: URL refused even outside a url key', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'hero', 8, '{"note":"data:text/html;base64,AAAA"}')$$), '22023');
select t.eq('content: http: (not https) under a url key refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'hero', 8, '{"cta_url":"http://example.com"}')$$), '22023');
select t.eq('content: protocol-relative //evil refused under a url key', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'hero', 8, '{"cta_url":"//evil.com"}')$$), '22023');
select t.eq('content: nested urls array element refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'features', 8, '{"items":[{"link":"https://ok.com"},{"link":"ftp://x"}]}')$$), '22023');
select t.passes('content: https / mailto / tel / anchor / path all fine',
  $$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'contact', 9,
    '{"a_url":"https://ok.com","b_href":"mailto:a@b.com","c_link":"tel:+201000000000","d_url":"#faq","e_url":"/s/company-a/routes"}')$$);
select t.eq('content: media reference to ANOTHER company refused', t.err39(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'image', 10, '{"image_media_id":"%s"}')$$, t.u(271)::text)), '22023');
select t.eq('content: SVG media refused', t.err39(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'image', 10, '{"image_media_id":"%s"}')$$, t.u(392)::text)), '22023');
select t.eq('content: private-bucket media refused', t.err39(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'image', 10, '{"image_media_id":"%s"}')$$, t.u(393)::text)), '22023');
select t.eq('content: unknown media id refused', t.err39(format($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'image', 10, '{"image_media_id":"%s"}')$$, t.u(999)::text)), '22023');
select t.eq('content: non-uuid media id refused', t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'image', 10, '{"image_media_id":"not-a-uuid"}')$$), '22023');
select t.passes('content: own PNG in the public bucket is accepted',
  format($$insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values (t.u(371), t.u(101), t.u(381), 'hero', 1, '{"title":"Welcome","image_media_id":"%s"}')$$, t.u(391)::text));
select t.eq('content: nesting deeper than 8 refused',
  t.err39($$insert into public.website_sections (company_id, page_id, type, sort_order, content) values (t.u(101), t.u(381), 'faq', 11, '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":{"j":"x"}}}}}}}}}}')$$), '22023');
select t.eq('content: update path is guarded too', t.err39($$update public.website_sections set content = '{"body":"<b>x</b>"}' where id = t.u(371)$$), '22023');
select t.eq('page title: HTML refused', t.err39($$update public.website_pages set title = '{"en":"<i>Home</i>"}' where id = t.u(381)$$), '22023');
select t.eq('settings: HTML in the site title refused', t.err39($$update public.website_settings set site_title = '{"en":"<b>x</b>"}' where company_id = t.u(101)$$), '22023');
select t.eq('settings: javascript: in a social link refused', t.err39($$update public.website_settings set social_links = '{"facebook":"javascript:alert(1)"}' where company_id = t.u(101)$$), '22023');
select t.eq('settings: http: social link refused', t.err39($$update public.website_settings set social_links = '{"facebook":"http://fb.com/x"}' where company_id = t.u(101)$$), '22023');
select t.passes('settings: https social links fine', $$update public.website_settings set social_links = '{"facebook":"https://fb.com/x","instagram":"https://instagram.com/x"}' where company_id = t.u(101)$$);
select t.eq('settings: another company''s logo is refused by the existing FK', t.err39(format($$update public.website_settings set logo_media_id = %L where company_id = t.u(101)$$, t.u(271)::text)), '23503');

-- 2. is_published cannot be flipped by API callers
select t.as_user(t.u(2));
select t.eq('guard: owner cannot set is_published directly', t.err39($$update public.website_settings set is_published = true where company_id = t.u(101)$$), '42501');
select t.eq('guard: owner can still edit other settings', t.err39($$update public.website_settings set primary_color = '#112233' where company_id = t.u(101)$$), 'NO ERROR');
select t.as_user(t.u(1));
select t.eq('guard: super_admin cannot flip it through the API either', t.err39($$update public.website_settings set is_published = true where company_id = t.u(101)$$), '42501');
select t.as_admin();

-- 3. publish: permission + checklist
select t.as_user(t.u(4)); select t.eq('publish: operations refused', t.err39($$select public.publish_website('x')$$), '42501');
select t.as_user(t.u(5)); select t.eq('publish: booking staff refused', t.err39($$select public.publish_website('x')$$), '42501');
select t.as_anon();       select t.eq('publish: anon refused', t.err39($$select public.publish_website('x')$$), '42501');
select t.as_user(t.u(1)); select t.eq('publish: platform staff without a membership refused', t.err39($$select public.publish_website('x')$$), '42501');
select t.as_admin();
-- checklist: no enabled section on the home page
update public.website_sections set is_enabled = false where page_id = t.u(381);
select t.as_user(t.u(2));
select t.eq('checklist: home page without an enabled section refused', t.err39($$select public.publish_website('x')$$), '23514');
select t.as_admin();
update public.website_sections set is_enabled = true where page_id = t.u(381);
update public.website_settings set site_title = null where company_id = t.u(101);
select t.as_user(t.u(2));
select t.eq('checklist: missing site title refused', t.err39($$select public.publish_website('x')$$), '23514');
select t.as_admin();
update public.website_settings set site_title = '{"en":"Company A"}' where company_id = t.u(101);
update public.website_pages set is_published = false where id = t.u(381);
select t.as_user(t.u(2));
select t.eq('checklist: unpublished home page refused', t.err39($$select public.publish_website('x')$$), '23514');
select t.as_admin();
update public.website_pages set is_published = true where id = t.u(381);
select t.eq('checklist: nothing was written by the refused attempts', t.cnt39('select count(*) from public.website_publications'), 0::bigint);

-- 4. publish v1
select t.as_user(t.u(2));
select t.eq('publish: owner publishes v1', public.publish_website('first'), 1);
select t.as_admin();
select t.eq('publish: one current, is_published true',
  (select count(*) filter (where is_current) || ':' || (select is_published::text from public.website_settings where company_id = t.u(101)) from public.website_publications where company_id = t.u(101)), '1:true');
select t.eq('publish: audited', (select count(*) from public.audit_logs where action = 'website.publish' and company_id = t.u(101)), 1::bigint);
select t.eq('snapshot: carries settings, pages, media',
  (select snapshot ? 'settings' and snapshot ? 'pages' and snapshot ? 'media' and (snapshot->>'schema_version') = '1' from public.website_publications where company_id = t.u(101) and version = 1), true);
select t.eq('snapshot: the hero media is resolved to a path, no extra media leaks',
  (select (select count(*) from jsonb_object_keys(snapshot->'media')) || ':' || (snapshot->'media'->(t.u(391)::text)->>'path') from public.website_publications where company_id = t.u(101) and version = 1),
  '1:' || t.u(101)::text || '/hero.png');
select t.eq('snapshot: contains no internal ids (company_id, user ids)',
  (select snapshot::text !~ (t.u(101)::text || '"') and snapshot::text !~ t.u(2)::text from public.website_publications where company_id = t.u(101) and version = 1), true);
select t.eq('snapshot: disabled sections are excluded',
  (select jsonb_array_length(snapshot->'pages'->0->'sections') from public.website_publications where company_id = t.u(101) and version = 1), (select count(*)::int from public.website_sections where page_id = t.u(381) and is_enabled));

-- 5. public read
select t.as_anon();
select t.eq('public: by slug returns the published site', (public.get_public_site(null, 'company-a')->'company'->>'name') is not null, true);
select t.eq('public: by host (active platform subdomain)', (public.get_public_site('a.test', null)->>'version')::int, 1);
select t.eq('public: neither argument is an error', t.err39($$select public.get_public_site(null, null)$$), '22023');
select t.eq('public: both arguments is an error', t.err39($$select public.get_public_site('a.test', 'company-a')$$), '22023');
select t.eq('public: unknown slug -> NULL', public.get_public_site(null, 'nope-co') is null, true);
select t.eq('public: unknown host -> NULL', public.get_public_site('nope.test', null) is null, true);
select t.eq('public: company B never published -> NULL (same answer as unknown)', public.get_public_site(null, 'company-b') is null, true);
select t.eq('public: a pending custom host is not served', public.get_public_site('b.test', null) is null, true);
select t.as_admin();

-- 6. drafts never leak; republish
update public.website_sections set content = '{"title":"DRAFT ONLY EDIT"}' where id = t.u(371);
select t.as_anon();
select t.eq('public: an edited draft is NOT visible', (public.get_public_site(null, 'company-a')::text) like '%DRAFT ONLY EDIT%', false);
select t.as_user(t.u(3));
select t.eq('publish: manager republishes v2', public.publish_website('second'), 2);
select t.as_admin();
select t.eq('publish: exactly one current and it is v2', (select string_agg(version::text, ',') from public.website_publications where company_id = t.u(101) and is_current), '2');
select t.as_anon();
select t.eq('public: v2 content is live', (public.get_public_site(null, 'company-a')::text) like '%DRAFT ONLY EDIT%', true);

-- 7. a failing publish leaves the current version untouched (atomicity of the validation path)
select t.as_admin();
update public.website_sections set content = jsonb_build_object('title', 'x', 'image_media_id', t.u(391)::text) where id = t.u(371);
update public.media set deleted_at = now() where id = t.u(391);   -- deleted AFTER the draft referenced it: only the publish re-validation can catch this
select t.as_user(t.u(2));
select t.eq('atomic: publish with a deleted media reference refused', t.err39($$select public.publish_website('bad')$$), '22023');
select t.as_admin();
select t.eq('atomic: still exactly v1+v2, v2 current, site still published',
  (select count(*) || ':' || max(version) filter (where is_current) || ':' || (select is_published::text from public.website_settings where company_id = t.u(101)) from public.website_publications where company_id = t.u(101)), '2:2:true');
update public.media set deleted_at = null where id = t.u(391);
update public.website_sections set content = '{"title":"Welcome"}' where id = t.u(371);

-- 8. rollback = copy-forward
select t.as_user(t.u(4)); select t.eq('rollback: operations refused', t.err39($$select public.rollback_website(1)$$), '42501');
select t.as_user(t.u(2));
select t.eq('rollback: unknown version', t.err39($$select public.rollback_website(99)$$), 'P0002');
select t.eq('rollback: to v1 creates v3', public.rollback_website(1), 3);
select t.as_admin();
select t.eq('rollback: v3 snapshot equals v1, v3 current, history intact',
  (select (select snapshot from public.website_publications where company_id = t.u(101) and version = 3) = (select snapshot from public.website_publications where company_id = t.u(101) and version = 1)
          and (select count(*) from public.website_publications where company_id = t.u(101)) = 3
          and (select string_agg(version::text, ',') from public.website_publications where company_id = t.u(101) and is_current) = '3'), true);
select t.eq('rollback: audited', (select count(*) from public.audit_logs where action = 'website.rollback' and company_id = t.u(101)), 1::bigint);
select t.as_user(t.u(7));
select t.eq('rollback: B cannot roll back to A''s version numbers (B has none)', t.err39($$select public.rollback_website(1)$$), 'P0002');
select t.as_admin();

-- 9. unpublish
select t.as_user(t.u(5)); select t.eq('unpublish: booking staff refused', t.err39($$select public.unpublish_website()$$), '42501');
select t.as_user(t.u(2));
select t.passes('unpublish: owner', $$select public.unpublish_website()$$);
select t.as_admin();
select t.eq('unpublish: no current version, is_published false',
  (select count(*) filter (where is_current) || ':' || (select is_published::text from public.website_settings where company_id = t.u(101)) from public.website_publications where company_id = t.u(101)), '0:false');
select t.as_anon();
select t.eq('unpublish: public read now NULL', public.get_public_site(null, 'company-a') is null, true);
select t.as_admin();
select t.eq('unpublish: audited', (select count(*) from public.audit_logs where action = 'website.unpublish' and company_id = t.u(101)), 1::bigint);
select t.as_user(t.u(2));
select t.eq('republish after unpublish continues numbering (v4)', public.publish_website('back'), 4);
select t.as_admin();

-- 10. tenant status and subscription gates
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_anon();
select t.eq('suspended: public read NULL (by slug)', public.get_public_site(null, 'company-a') is null, true);
select t.eq('suspended: public read NULL (by host)', public.get_public_site('a.test', null) is null, true);
select t.as_user(t.u(2));
select t.eq('suspended: owner cannot publish (no permission while suspended)', t.err39($$select public.publish_website('x')$$), '42501');
select t.as_admin();
update public.companies set status = 'active', suspended_at = null where id = t.u(101);
select t.as_anon();
select t.eq('reactivated: public read works again', public.get_public_site(null, 'company-a') is not null, true);
select t.as_admin();
update public.subscriptions set current_period_end = now() - interval '1 day' where company_id = t.u(101) and status = 'active';
select t.as_user(t.u(2));
select t.eq('subscription: an expired period refuses publish', t.err39($$select public.publish_website('x')$$), '42501');
select t.eq('subscription: and refuses rollback', t.err39($$select public.rollback_website(1)$$), '42501');
select t.as_admin();
update public.subscriptions set current_period_end = now() + interval '30 days' where company_id = t.u(101) and status = 'active';

-- 11. rate limit (10 per 10 minutes)
delete from app_private.rate_limit_counters;
select t.as_user(t.u(2));
select t.eq('rate limit: ten publishes pass', (select count(*) from (select public.publish_website('n' || g) from generate_series(1, 10) g) x), 10::bigint);
select t.eq('rate limit: the eleventh is refused', t.err39($$select public.publish_website('n11')$$), 'PT429');
select t.as_admin();
delete from app_private.rate_limit_counters;

-- 12. cross-tenant: B edits nothing of A, and B's own publish needs B's own content
select t.as_user(t.u(7));
select t.eq('isolation: B sees none of A''s pages, sections or publications',
  (select count(*) from public.website_pages where company_id = t.u(101)) + (select count(*) from public.website_sections where company_id = t.u(101))
  + (select count(*) from public.website_publications where company_id = t.u(101)), 0::bigint);
select t.eq('isolation: B publish fails its own checklist (nothing to publish), never touches A', t.err39($$select public.publish_website('x')$$), '23514');
select t.as_anon();
select t.eq('anon: no execute on publish_website', t.err39($$select public.publish_website('x')$$), '42501');
select t.eq('anon: no execute on rollback_website', t.err39($$select public.rollback_website(1)$$), '42501');
select t.as_admin();

-- cleanup: later suites share this database
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
delete from public.media where id in (t.u(391), t.u(392), t.u(393));
alter table public.media add constraint media_public_no_svg check (not (bucket = 'company-public' and mime_type = 'image/svg+xml'));
update public.website_settings set is_published = (company_id = t.u(101)), site_title = null, primary_color = '#1d4ed8', social_links = '{}' where company_id in (t.u(101), t.u(102));
delete from app_private.rate_limit_counters;
