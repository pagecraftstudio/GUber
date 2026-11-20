-- 0046 (M3B-2): website publishing over the EXISTING tables (draft = website_settings + website_pages + website_sections,
-- published = website_publications snapshots). No new table.
--
-- DESIGN CHOICE (differs from the plan, deliberately): the plan had one save_website_draft(jsonb) RPC. The draft already lives in three
-- tenant tables with RLS and permission-driven policies (website.write), and the dashboard edits it that way. A second write path would
-- be a second place to forget a check. So validation is attached to the TABLES (triggers): every write path, present or future, is
-- checked once, and publish_website re-validates before it snapshots.
--
-- 1. app_private.validate_site_json: walks any jsonb draft value. CONVENTION: a media reference MUST be keyed media_id or *_media_id
--    (any case); a URL MUST sit under a key ending in url / href / link (plural ok). The M3E editor schema follows this. Refuses
--      - raw HTML (a '<' followed by a letter, '/' or '!'),
--      - a value under a url/href/link key (and every social_links value) that is not https / mailto / tel / '#anchor' / '/path',
--      - javascript: / data: / vbscript: anywhere,
--      - *media_id keys that are not a live, public-bucket, non-SVG media row of THE SAME company,
--      - nesting deeper than 8 levels (walker cost bound).
--    Triggers on website_sections / website_pages / website_settings; size CHECK (< 256 kB) on sections.content.
-- 2. website_settings.is_published can no longer be flipped by API callers (authenticated/anon): it is the switch that opens public
--    booking, and D4 says only website.publish holders may touch it. SECURITY DEFINER functions (owner) pass; so do migrations/tests.
-- 3. publish_website / rollback_website / unpublish_website: permission website.publish, rate limited, company-row lock, live
--    subscription required, checklist, snapshot, one current publication, audit. Rollback = copy-forward (history stays linear).
-- 4. get_public_site(host | slug): the single audited read path for published content. Returns NULL for unknown, suspended, never
--    published and unpublished alike (no enumeration). NOT revoked from website_publications yet: D2 (revoke anon SELECT + drop the
--    public_select policy) lands in a later migration AFTER the public site reads through this RPC.
--
-- ROLLBACK
--   drop function public.publish_website(text), public.rollback_website(integer), public.unpublish_website(), public.get_public_site(text, text),
--     app_private.build_site_snapshot(uuid), app_private.collect_media_ids(jsonb), app_private.social_as_urls(jsonb), app_private.validate_site_json(uuid, jsonb, integer, boolean),
--     app_private.site_publish_guard(), app_private.site_content_guard();
--   drop trigger site_publish_guard on public.website_settings; drop trigger site_content_guard on public.website_sections, public.website_pages, public.website_settings
--     (each table separately); alter table public.website_sections drop constraint website_sections_content_size;
-- RUNNER NOTE: requires 0042-0045. Existing rows are NOT re-validated by the triggers; publish_website re-validates the whole draft.
set search_path = public, extensions;

-- ---------------------------------------------------------------------------------------------------- 1. validation
create or replace function app_private.validate_site_json(p_company uuid, p_val jsonb, p_depth integer default 0, p_url boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
declare k text; v jsonb; s text; e jsonb;
begin
  if p_val is null then return; end if;
  if p_depth > 8 then raise exception 'content is nested too deeply' using errcode = '22023'; end if;

  case jsonb_typeof(p_val)
    when 'object' then
      for k, v in select * from jsonb_each(p_val) loop
        if lower(k) like '%media\_id' and jsonb_typeof(v) = 'string' then
          if not exists (
            select 1 from public.media m
             where m.id::text = v #>> '{}' and m.company_id = p_company and m.deleted_at is null
               and m.bucket = 'company-public' and m.mime_type <> 'image/svg+xml')
          then raise exception 'invalid media reference' using errcode = '22023', hint = k; end if;
        else
          perform app_private.validate_site_json(p_company, v, p_depth + 1, lower(k) ~ '(url|href|link)s?$');
        end if;
      end loop;
    when 'array' then
      for e in select * from jsonb_array_elements(p_val) loop
        perform app_private.validate_site_json(p_company, e, p_depth + 1, p_url);
      end loop;
    when 'string' then
      s := p_val #>> '{}';
      if s ~ '<\s*[A-Za-z/!]' then raise exception 'raw HTML is not allowed' using errcode = '22023'; end if;
      -- Prose such as "Hours: 9-5" is fine. Under a url/href/link key the value must be a safe URL; everywhere else the
      -- dangerous schemes are refused outright.
      if p_url and s <> '' and s !~* '^\s*(https://|mailto:|tel:|#|/[^/]|/$)' then
        raise exception 'URL scheme is not allowed' using errcode = '22023';
      end if;
      if s ~* '^\s*(javascript|data|vbscript)\s*:' then raise exception 'URL scheme is not allowed' using errcode = '22023'; end if;
    else null;
  end case;
end $$;
revoke all on function app_private.validate_site_json(uuid, jsonb, integer, boolean) from public, anon, authenticated;

-- social_links is {"facebook": "https://...", ...}: every VALUE is a URL, whatever its key is called.
create or replace function app_private.social_as_urls(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'object'
              then coalesce((select jsonb_agg(jsonb_build_object('url', j.value)) from jsonb_each(p) j), '[]'::jsonb)
              else '[]'::jsonb end
$$;
revoke all on function app_private.social_as_urls(jsonb) from public, anon, authenticated;

-- one guard for the three draft tables; each passes the jsonb columns it owns
create or replace function app_private.site_content_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'website_sections' then
    perform app_private.validate_site_json(new.company_id, new.content);
  elsif tg_table_name = 'website_pages' then
    perform app_private.validate_site_json(new.company_id, jsonb_build_array(new.title, new.seo_title, new.seo_description));
  else
    perform app_private.validate_site_json(new.company_id, jsonb_build_array(new.site_title, new.meta_description, new.contact_address, new.footer_text));
    perform app_private.validate_site_json(new.company_id, app_private.social_as_urls(new.social_links));
    perform app_private.validate_site_json(new.company_id, to_jsonb(coalesce(new.contact_email, '') || ' ' || coalesce(new.contact_phone, '') || ' ' || coalesce(new.contact_whatsapp, '')));
  end if;
  return new;
end $$;
revoke all on function app_private.site_content_guard() from public, anon, authenticated;

create trigger site_content_guard before insert or update on public.website_sections for each row execute function app_private.site_content_guard();
create trigger site_content_guard before insert or update on public.website_pages    for each row execute function app_private.site_content_guard();
create trigger site_content_guard before insert or update on public.website_settings for each row execute function app_private.site_content_guard();

alter table public.website_sections add constraint website_sections_content_size check (pg_column_size(content) < 262144) not valid;
alter table public.website_sections validate constraint website_sections_content_size;

-- ---------------------------------------------------------------------------------------------------- 2. is_published guard
-- SECURITY INVOKER on purpose: current_user is the CALLER. Definer functions run as the owner and pass.
create or replace function app_private.site_publish_guard() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and ((tg_op = 'INSERT' and new.is_published) or (tg_op = 'UPDATE' and new.is_published is distinct from old.is_published)) then
    raise exception 'is_published is changed only by publish_website / unpublish_website' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger site_publish_guard before insert or update of is_published on public.website_settings
  for each row execute function app_private.site_publish_guard();

-- ---------------------------------------------------------------------------------------------------- 3. snapshot
create or replace function app_private.collect_media_ids(p_val jsonb) returns setof uuid
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; e jsonb;
begin
  if p_val is null then return; end if;
  if jsonb_typeof(p_val) = 'object' then
    for k, v in select * from jsonb_each(p_val) loop
      if k like '%media\_id' and jsonb_typeof(v) = 'string' and (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return next (v #>> '{}')::uuid;
      else
        return query select * from app_private.collect_media_ids(v);
      end if;
    end loop;
  elsif jsonb_typeof(p_val) = 'array' then
    for e in select * from jsonb_array_elements(p_val) loop
      return query select * from app_private.collect_media_ids(e);
    end loop;
  end if;
end $$;
revoke all on function app_private.collect_media_ids(jsonb) from public, anon, authenticated;

-- Builds the public snapshot from the DRAFT and re-validates it. Raises 23514 (checklist) or 22023 (content).
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
      'contact_email', v_ws.contact_email, 'contact_phone', v_ws.contact_phone, 'contact_whatsapp', v_ws.contact_whatsapp,
      'contact_address', v_ws.contact_address, 'social_links', v_ws.social_links, 'footer_text', v_ws.footer_text),
    'pages', v_pages,
    'media', v_media);

  if pg_column_size(v_snapshot) > 1048576 then raise exception 'site is too large to publish' using errcode = '54000'; end if;
  return v_snapshot;
end $$;
revoke all on function app_private.build_site_snapshot(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------- 4. publish / rollback / unpublish
create or replace function public.publish_website(p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_snap jsonb; v_ver integer; v_note text := left(nullif(trim(coalesce(p_note, '')), ''), 500);
begin
  v_co := app_private.caller_company('website.publish');
  perform app_private.rate_limit_hit('website.publish');
  perform 1 from public.companies where id = v_co for update;
  if not exists (select 1 from app_private.live_subscription(v_co)) then raise exception 'no active subscription' using errcode = '42501'; end if;

  v_snap := app_private.build_site_snapshot(v_co);
  select coalesce(max(version), 0) + 1 into v_ver from public.website_publications where company_id = v_co;

  update public.website_publications set is_current = false where company_id = v_co and is_current;
  insert into public.website_publications (company_id, version, snapshot, is_current, published_by, note)
  values (v_co, v_ver, v_snap, true, auth.uid(), v_note);
  update public.website_settings set is_published = true where company_id = v_co;

  perform app_private.write_audit('company_user', v_co, 'website.publish', 'website_publication', null, jsonb_build_object('version', v_ver, 'note', v_note));
  return v_ver;
end $$;

create or replace function public.rollback_website(p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_src public.website_publications%rowtype; v_ver integer;
begin
  v_co := app_private.caller_company('website.publish');
  perform app_private.rate_limit_hit('website.publish');
  perform 1 from public.companies where id = v_co for update;
  if not exists (select 1 from app_private.live_subscription(v_co)) then raise exception 'no active subscription' using errcode = '42501'; end if;

  select * into v_src from public.website_publications where company_id = v_co and version = p_version;
  if not found then raise exception 'version not found' using errcode = 'P0002'; end if;
  select max(version) + 1 into v_ver from public.website_publications where company_id = v_co;

  update public.website_publications set is_current = false where company_id = v_co and is_current;
  insert into public.website_publications (company_id, version, snapshot, is_current, published_by, note)
  values (v_co, v_ver, v_src.snapshot, true, auth.uid(), 'rollback to v' || p_version);
  update public.website_settings set is_published = true where company_id = v_co;

  perform app_private.write_audit('company_user', v_co, 'website.rollback', 'website_publication', null, jsonb_build_object('version', v_ver, 'restored_version', p_version));
  return v_ver;
end $$;

create or replace function public.unpublish_website() returns void
language plpgsql security definer set search_path = '' as $$
declare v_co uuid;
begin
  v_co := app_private.caller_company('website.publish');
  perform app_private.rate_limit_hit('website.publish');
  perform 1 from public.companies where id = v_co for update;

  update public.website_publications set is_current = false where company_id = v_co and is_current;
  update public.website_settings set is_published = false where company_id = v_co;
  perform app_private.write_audit('company_user', v_co, 'website.unpublish', 'website_settings', v_co, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------------------------------------- 5. public read
create or replace function public.get_public_site(p_host text default null, p_slug text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_co uuid; v_slug text; v_name text; v_pub public.website_publications%rowtype;
begin
  if (p_host is null) = (p_slug is null) then raise exception 'exactly one of host or slug is required' using errcode = '22023'; end if;

  if p_host is not null then
    select r.company_id, r.slug into v_co, v_slug from public.resolve_tenant(p_host) r;
  else
    select r.company_id, r.slug into v_co, v_slug from public.resolve_tenant_by_slug(p_slug) r;
  end if;
  if v_co is null then return null; end if;

  select * into v_pub from public.website_publications where company_id = v_co and is_current;
  if not found then return null; end if;
  if not exists (select 1 from public.website_settings w where w.company_id = v_co and w.is_published) then return null; end if;

  select c.name into v_name from public.companies c where c.id = v_co;
  return jsonb_build_object('company', jsonb_build_object('name', v_name, 'slug', v_slug),
                            'version', v_pub.version, 'published_at', v_pub.published_at, 'site', v_pub.snapshot);
end $$;

revoke all on function public.publish_website(text), public.rollback_website(integer), public.unpublish_website() from public, anon;
grant execute on function public.publish_website(text), public.rollback_website(integer), public.unpublish_website() to authenticated;
revoke all on function public.get_public_site(text, text) from public;
grant execute on function public.get_public_site(text, text) to anon, authenticated;
