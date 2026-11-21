-- 0050 (E3): website look. Button shape + a fixed list of fonts, and a `theme` object in the published snapshot.
--
-- DESIGN
--   * website_settings.button_style: square | soft | pill (CHECK). font_heading / font_body: plex | cairo | tajawal (CHECK). Fixed lists, never free
--     CSS, so any choice stays readable on phones and in Arabic. Colours already exist (primary_color / secondary_color, validated hex).
--   * The legacy default 'cairo' was never a design choice (nothing rendered it). It is migrated to 'plex' (the platform font) so the CHECK can
--     be strict and a company that never opens the Look panel keeps the exact look it has today. A user can still pick Cairo afterwards.
--   * build_site_snapshot (0046) gains `settings.theme`. Snapshots published before this migration have no `theme` key; the renderer treats that
--     as the platform look, so already-published sites do not change until their owner republishes.
--
-- ROLLBACK (manual)
--   alter table public.website_settings drop constraint website_settings_font_heading_chk, drop constraint website_settings_font_body_chk,
--     drop column button_style; alter table public.website_settings alter column font_heading set default 'cairo', alter column font_body set default 'cairo';
--   update public.website_settings set font_heading = 'cairo', font_body = 'cairo' where font_heading = 'plex' and font_body = 'plex';   (optional)
--   then re-create app_private.build_site_snapshot from 0046.
-- RUNNER NOTE: requires 0046. Pre-flight fails if any row holds a font other than the legacy default.
set search_path = public, extensions;

do $$
begin
  if exists (select 1 from public.website_settings where font_heading not in ('cairo', 'plex', 'tajawal') or font_body not in ('cairo', 'plex', 'tajawal')) then
    raise exception '0050 pre-flight: website_settings holds a font outside cairo/plex/tajawal; review it first' using errcode = '23514';
  end if;
end $$;

alter table public.website_settings add column button_style text not null default 'soft';
alter table public.website_settings add constraint website_settings_button_style_chk check (button_style in ('square', 'soft', 'pill'));

update public.website_settings set font_heading = 'plex' where font_heading = 'cairo';
update public.website_settings set font_body = 'plex' where font_body = 'cairo';
alter table public.website_settings alter column font_heading set default 'plex', alter column font_body set default 'plex';
alter table public.website_settings add constraint website_settings_font_heading_chk check (font_heading in ('plex', 'cairo', 'tajawal'));
alter table public.website_settings add constraint website_settings_font_body_chk check (font_body in ('plex', 'cairo', 'tajawal'));

create or replace function app_private.build_site_snapshot(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws public.website_settings%rowtype; v_pages jsonb; v_media jsonb; v_ids uuid[]; v_snapshot jsonb;
begin
  select * into v_ws from public.website_settings where company_id = p_company;
  if not found then raise exception 'website settings are missing' using errcode = '23514'; end if;
  if v_ws.site_title is null or v_ws.site_title = '{}'::jsonb then raise exception 'site title is required' using errcode = '23514'; end if;

  if not exists (select 1 from public.website_pages p where p.company_id = p_company and p.is_home and p.is_published) then
    raise exception 'a published home page is required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.website_sections s join public.website_pages p on p.id = s.page_id and p.company_id = s.company_id
                  where s.company_id = p_company and p.is_home and p.is_published and s.is_enabled) then
    raise exception 'the home page needs at least one enabled section' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', p.slug, 'title', p.title, 'is_home', p.is_home, 'seo_title', p.seo_title, 'seo_description', p.seo_description,
           'sections', coalesce((select jsonb_agg(jsonb_build_object('type', s.type, 'content', s.content) order by s.sort_order, s.id)
                                   from public.website_sections s where s.page_id = p.id and s.company_id = p.company_id and s.is_enabled), '[]'::jsonb))
         order by p.is_home desc, p.slug), '[]'::jsonb)
    into v_pages from public.website_pages p where p.company_id = p_company and p.is_published;

  perform app_private.validate_site_json(p_company, v_pages);
  perform app_private.validate_site_json(p_company, jsonb_build_array(v_ws.site_title, v_ws.meta_description, v_ws.contact_address, v_ws.footer_text));
  perform app_private.validate_site_json(p_company, app_private.social_as_urls(v_ws.social_links));

  select array_agg(distinct id) into v_ids from (
    select app_private.collect_media_ids(v_pages) as id
    union select v_ws.logo_media_id union select v_ws.favicon_media_id) x where id is not null;

  select coalesce(jsonb_object_agg(m.id::text, jsonb_build_object(
           'path', m.storage_path, 'alt', m.alt_text, 'width', m.width, 'height', m.height, 'mime', m.mime_type)), '{}'::jsonb)
    into v_media from public.media m
   where m.id = any (coalesce(v_ids, '{}')) and m.company_id = p_company and m.deleted_at is null and m.bucket = 'company-public' and m.mime_type <> 'image/svg+xml';

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'settings', jsonb_build_object(
      'site_title', v_ws.site_title, 'meta_description', v_ws.meta_description,
      'logo_media_id', v_ws.logo_media_id, 'favicon_media_id', v_ws.favicon_media_id,
      'primary_color', v_ws.primary_color, 'secondary_color', v_ws.secondary_color,
      'font_heading', v_ws.font_heading, 'font_body', v_ws.font_body,
      'theme', jsonb_build_object('font_heading', v_ws.font_heading, 'font_body', v_ws.font_body, 'button_style', v_ws.button_style),
      'contact_email', v_ws.contact_email, 'contact_phone', v_ws.contact_phone, 'contact_whatsapp', v_ws.contact_whatsapp,
      'contact_address', v_ws.contact_address, 'social_links', v_ws.social_links, 'footer_text', v_ws.footer_text),
    'pages', v_pages,
    'media', v_media);

  if pg_column_size(v_snapshot) > 1048576 then raise exception 'site is too large to publish' using errcode = '54000'; end if;
  return v_snapshot;
end $$;
revoke all on function app_private.build_site_snapshot(uuid) from public, anon, authenticated;
