-- 44: E2 hero image. NO new migration: this pins what the editor relies on from 0046 (media validation, snapshot media), 0048 (media rows)
-- and 0006 (RLS). Fixtures (01): A = company 101 (professional), B = 102. Users: 2 ownerA, 3 managerA, 4 opsA, 7 ownerB.
select t.as_admin();
create or replace function t.err44(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt44(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;

delete from app_private.rate_limit_counters;
delete from public.website_publications;
delete from public.website_sections;
delete from public.website_pages;
update public.website_settings set is_published = false, site_title = jsonb_build_object('en', 'Company A') where company_id = t.u(101);
insert into public.media (id, company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes, uploaded_by) values
  (t.u(801), t.u(101), 'website_image', 'company-public', t.u(101)::text || '/website_image/' || t.u(801)::text || '.png',  'a1.png',  'image/png',  1000, t.u(2)),
  (t.u(802), t.u(101), 'website_image', 'company-public', t.u(101)::text || '/website_image/' || t.u(802)::text || '.webp', 'a2.webp', 'image/webp', 1000, t.u(2)),
  (t.u(803), t.u(102), 'website_image', 'company-public', t.u(102)::text || '/website_image/' || t.u(803)::text || '.png',  'b1.png',  'image/png',  1000, t.u(7));
insert into public.website_pages (id, company_id, slug, title, is_home) values (t.u(811), t.u(101), '', '{"en":"Home"}', true);
insert into public.website_sections (id, company_id, page_id, type, sort_order, content) values
  (t.u(821), t.u(101), t.u(811), 'hero', 1, '{"title":{"en":"Hero"}}');

-- the draft may point at an OWN live image, with a position
select t.as_user(t.u(2));
select t.eq('draft: owner points the hero at an own image',
  t.affected(format($$update public.website_sections set content = jsonb_build_object('title', jsonb_build_object('en','Hero'), 'image_media_id', %L, 'image_position', 'full') where id = %L$$, t.u(801)::text, t.u(821)::text)), 1::bigint);
select t.as_user(t.u(3));
select t.eq('draft: manager may too (website.write)',
  t.affected(format($$update public.website_sections set content = jsonb_set(content, '{image_position}', '"beside"') where id = %L$$, t.u(821)::text)), 1::bigint);
select t.as_user(t.u(4));
select t.eq('draft: operations (media.write but no website.write) cannot edit the section',
  t.affected(format($$update public.website_sections set content = '{}' where id = %L$$, t.u(821)::text)), 0::bigint);

-- ...but never at somebody else's image, a missing one, or a discarded one
select t.as_user(t.u(2));
select t.eq('draft: another company''s image is refused',
  t.err44(format($$update public.website_sections set content = jsonb_build_object('image_media_id', %L) where id = %L$$, t.u(803)::text, t.u(821)::text)), '22023');
select t.eq('draft: a made-up media id is refused',
  t.err44(format($$update public.website_sections set content = jsonb_build_object('image_media_id', %L) where id = %L$$, t.u(899)::text, t.u(821)::text)), '22023');
select t.eq('draft: a non-uuid media reference is refused',
  t.err44(format($$update public.website_sections set content = jsonb_build_object('image_media_id', '../../x') where id = %L$$, t.u(821)::text)), '22023');
select t.as_admin();
update public.media set deleted_at = now() where id = t.u(802);
select t.as_user(t.u(2));
select t.eq('draft: a discarded image is refused',
  t.err44(format($$update public.website_sections set content = jsonb_build_object('image_media_id', %L) where id = %L$$, t.u(802)::text, t.u(821)::text)), '22023');

-- published: the snapshot carries path + MIME of the hero image
select t.as_user(t.u(2));
select t.eq('publish: v1 with the hero image (banner position kept)', public.publish_website('with image'), 1);
select t.as_admin();
select t.eq('snapshot: hero content keeps the position',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'pages'->0->'sections'->0->'content'->>'image_position', 'beside');
select t.eq('snapshot: media map has the image path',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media'->(t.u(801)::text)->>'path', (select storage_path from public.media where id = t.u(801)));
select t.eq('snapshot: media map has the stored MIME',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media'->(t.u(801)::text)->>'mime', 'image/png');
select t.eq('snapshot: no other company''s media leaks into it',
  (select count(*) from jsonb_object_keys(public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media') k where k = t.u(803)::text), 0::bigint);

-- replacing an image (draft repointed, old file discarded) leaves the LIVE site intact until the next publish
select t.as_admin();
insert into public.media (id, company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes, uploaded_by)
  values (t.u(804), t.u(101), 'website_image', 'company-public', t.u(101)::text || '/website_image/' || t.u(804)::text || '.jpg', 'a4.jpg', 'image/jpeg', 1000, t.u(2));
select t.as_user(t.u(2));
select t.eq('replace: owner repoints the hero to the new image',
  t.affected(format($$update public.website_sections set content = jsonb_set(content, '{image_media_id}', to_jsonb(%L::text)) where id = %L$$, t.u(804)::text, t.u(821)::text)), 1::bigint);
select t.passes('replace: owner discards the old file (discard_media)', format($$select public.discard_media(%L)$$, t.u(801)::text));
select t.as_admin();
select t.eq('replace: the live site still shows the OLD image entry (snapshot copy)',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media'->(t.u(801)::text)->>'mime', 'image/png');
select t.as_user(t.u(2));
select t.eq('replace: preview shows the NEW image', public.preview_website_draft()->'site'->'media'->(t.u(804)::text)->>'mime', 'image/jpeg');
select t.eq('replace: publish v2 carries the new image', public.publish_website('new image'), 2);
select t.as_admin();
select t.eq('replace: live now lists the new image',
  public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media'->(t.u(804)::text)->>'mime', 'image/jpeg');

-- removing the image: content without the key publishes fine and the media map no longer lists it
select t.as_user(t.u(2));
select t.eq('remove: owner drops image and position from the section',
  t.affected(format($$update public.website_sections set content = '{"title":{"en":"Hero"}}' where id = %L$$, t.u(821)::text)), 1::bigint);
select t.eq('remove: publish v3 without an image', public.publish_website('no image'), 3);
select t.as_admin();
select t.eq('remove: live media map is empty of section images',
  (select count(*) from jsonb_object_keys(public.get_public_site(null, (select slug from public.companies where id = t.u(101)))->'site'->'media') k where k in (t.u(801)::text, t.u(804)::text)), 0::bigint);

-- another company cannot touch the section or read the image rows
select t.as_user(t.u(7));
select t.eq('isolation: owner B cannot edit A''s hero', t.affected(format($$update public.website_sections set content = '{}' where id = %L$$, t.u(821)::text)), 0::bigint);
select t.eq('isolation: owner B cannot read A''s media rows', t.rows(format($$select 1 from public.media where company_id = %L$$, t.u(101)::text)), 0::bigint);
select t.as_admin();
