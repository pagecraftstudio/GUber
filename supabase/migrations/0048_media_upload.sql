-- 0048 (W1): company media upload. The only way a tenant file gets into storage + the `media` table.
--
-- DESIGN (two locks, plus the bucket itself)
--   1. reserve_media(kind, mime, size, filename) is the ONLY writer of `media` rows for tenants. It derives the company from the
--      caller (media.write), needs a live subscription, is rate limited and audited, enforces the plan's max_media_files under a
--      company-row lock, accepts PNG/JPEG/WebP only (never SVG: it can carry script), caps the size at 2 MB, and generates the
--      storage path itself: <company_id>/<kind>/<uuid>.<ext>. The caller never chooses a path.
--   2. storage.objects policies let an authenticated user INSERT an object only at a path that a live, caller-owned, same-company
--      `media` row reserved. No reservation = no upload, so a tenant cannot bypass the rate limit, quota or MIME rules by calling
--      the Storage API directly. The bucket is public, so a published image is served by URL and anonymous callers have no policy
--      at all (they cannot list). Authenticated staff with media.write can SELECT and DELETE objects of their OWN company only
--      (Postgres needs SELECT to find the rows a DELETE targets).
--   3. the bucket restricts MIME types and size again at the Storage layer.
--   Direct INSERT/UPDATE on `media` by tenants is removed (it would let them forge a reservation). They keep SELECT, and may edit
--   alt_text. website_settings.logo_media_id etc. still go through 0046's validator (same company, public bucket, not deleted, not SVG).
--
-- ROLLBACK (manual)
--   drop function public.reserve_media(text, text, bigint, text), public.discard_media(uuid), app_private.can_upload_object(text),
--     app_private.can_manage_object(text);
--   drop policy company_public_insert on storage.objects; drop policy company_public_select on storage.objects; drop policy company_public_delete on storage.objects;
--   alter table public.media drop constraint media_public_no_svg;
--   grant insert, update on public.media to authenticated;
--   create policy tenant_insert on public.media for insert to authenticated with check (app_private.has_permission(company_id, 'media.write'));
--   create policy tenant_update on public.media for update to authenticated using (app_private.has_permission(company_id, 'media.write'))
--     with check (app_private.has_permission(company_id, 'media.write'));
--   delete from app_private.rate_limit_policies where bucket = 'media.upload';
--   delete from public.plan_entitlements where key = 'max_media_files'; delete from public.entitlement_definitions where key = 'max_media_files';
--   (the bucket is left in place: it may hold files.)
-- RUNNER NOTE: requires 0045 (caller_company). BEFORE applying to a hosted project, list its storage buckets: this migration
--   upserts `company-public` and would overwrite size/MIME limits of an existing bucket of that name.
set search_path = public, extensions;

-- ---- 1. entitlement + rate limit -------------------------------------------------------------------------------------------
insert into public.entitlement_definitions (key, value_type, description)
values ('max_media_files', 'integer', 'Uploaded images per company (logo, website images)');
insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
select p.id, 'max_media_files', v.n, null
from public.plans p join (values ('starter', 20), ('professional', 100), ('enterprise', null::integer)) v(code, n) on v.code = p.code;

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('media.upload', 600,   20,  'reserve_media per user per 10 minutes'),
  ('media.upload', 86400, 100, 'reserve_media per user per day');

-- ---- 2. media table: no SVG in the public bucket (closes audit finding F2), no direct tenant writes ------------------------
do $$
begin
  if exists (select 1 from public.media where bucket = 'company-public' and mime_type = 'image/svg+xml') then
    raise exception '0048 pre-flight: public media rows with image/svg+xml exist; soft-delete them first' using errcode = '23514';
  end if;
end $$;
alter table public.media add constraint media_public_no_svg check (not (bucket = 'company-public' and mime_type = 'image/svg+xml'));

drop policy if exists tenant_insert on public.media;
drop policy if exists tenant_update on public.media;
revoke insert, update on public.media from authenticated;
grant update (alt_text) on public.media to authenticated;
create policy tenant_update_alt on public.media for update to authenticated
  using (app_private.has_permission(company_id, 'media.write'))
  with check (app_private.has_permission(company_id, 'media.write'));

-- ---- 3. bucket ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-public', 'company-public', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- ---- 4. reserve / discard ----------------------------------------------------------------------------------------------------
create or replace function public.reserve_media(p_kind text, p_mime text, p_size bigint, p_filename text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_co uuid; v_ext text; v_limit integer; v_count integer; v_id uuid := gen_random_uuid(); v_path text; v_name text;
begin
  v_co := app_private.caller_company('media.write');
  if p_kind is null or p_kind not in ('logo', 'website_image') then raise exception 'invalid media kind' using errcode = '22023'; end if;
  v_ext := case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
  if v_ext is null then raise exception 'unsupported image type' using errcode = '22023'; end if;
  if p_size is null or p_size < 1 or p_size > 2097152 then raise exception 'image size out of range' using errcode = '22023'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_filename, '')), '[\\/[:cntrl:]]', '_', 'g'), 255);
  if v_name = '' then v_name := 'image.' || v_ext; end if;

  perform app_private.rate_limit_hit('media.upload');
  perform 1 from public.companies where id = v_co for update;      -- quota check + insert are atomic per company
  v_limit := app_private.entitlement_limit(v_co, 'max_media_files'); -- raises 42501 without a live subscription; NULL = unlimited
  select count(*) into v_count from public.media where company_id = v_co and bucket = 'company-public' and deleted_at is null;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'plan limit reached: max_media_files' using errcode = '53400';
  end if;

  v_path := v_co::text || '/' || p_kind || '/' || v_id::text || '.' || v_ext;
  insert into public.media (id, company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes, uploaded_by)
  values (v_id, v_co, p_kind, 'company-public', v_path, v_name, p_mime, p_size, auth.uid());
  perform app_private.write_audit('company_user', v_co, 'media.upload', 'media', v_id, jsonb_build_object('kind', p_kind, 'mime', p_mime, 'size', p_size));
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;
revoke all on function public.reserve_media(text, text, bigint, text) from public, anon;
grant execute on function public.reserve_media(text, text, bigint, text) to authenticated;

-- Soft-delete (the same flag 0046 already treats as "not usable"). Used when the upload after a reservation failed, or to remove an image.
create or replace function public.discard_media(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_co uuid; v_n integer;
begin
  v_co := app_private.caller_company('media.write');
  update public.media set deleted_at = now() where id = p_id and company_id = v_co and deleted_at is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'media not found' using errcode = 'P0002'; end if;
  perform app_private.write_audit('company_user', v_co, 'media.discard', 'media', p_id, '{}'::jsonb);
end $$;
revoke all on function public.discard_media(uuid) from public, anon;
grant execute on function public.discard_media(uuid) to authenticated;

-- ---- 5. storage policies -----------------------------------------------------------------------------------------------------
-- Helpers are SECURITY DEFINER so the policy does not depend on the caller's own RLS over `media`.
create or replace function app_private.can_upload_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.media m
     where m.bucket = 'company-public' and m.storage_path = p_name and m.deleted_at is null
       and m.uploaded_by = auth.uid() and app_private.has_permission(m.company_id, 'media.write'));
$$;
create or replace function app_private.can_manage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.media m
     where m.bucket = 'company-public' and m.storage_path = p_name and app_private.has_permission(m.company_id, 'media.write'));
$$;
revoke all on function app_private.can_upload_object(text), app_private.can_manage_object(text) from public, anon;
grant execute on function app_private.can_upload_object(text), app_private.can_manage_object(text) to authenticated;

drop policy if exists company_public_insert on storage.objects;
drop policy if exists company_public_select on storage.objects;
drop policy if exists company_public_delete on storage.objects;
create policy company_public_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-public' and app_private.can_upload_object(name));
create policy company_public_select on storage.objects for select to authenticated
  using (bucket_id = 'company-public' and app_private.can_manage_object(name));
create policy company_public_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-public' and app_private.can_manage_object(name));
