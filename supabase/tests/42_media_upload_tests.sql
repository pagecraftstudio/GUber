-- 42: W1 media upload (migration 0048). Fixtures (01): A = company 101 (professional), B = 102. Users: 1 super_admin (no membership),
-- 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB, 9 platform support.
select t.as_admin();
create or replace function t.err42(p_sql text) returns text language plpgsql as
  $$ begin execute p_sql; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt42(p_sql text) returns bigint language plpgsql security definer as
  $$ declare n bigint; begin execute p_sql into n; return n; end $$;
-- path of the media row with this original_filename (read as admin so the test never depends on the caller's own SELECT)
create or replace function t.path42(p_name text) returns text language sql security definer as
  $$ select storage_path from public.media where original_filename = p_name $$;
create or replace function t.mid42(p_name text) returns uuid language sql security definer as
  $$ select id from public.media where original_filename = p_name $$;
create or replace function t.read42(p_sql text) returns bigint language plpgsql as
  $$ declare n bigint; begin execute 'select count(*) from (' || p_sql || ') q' into n; return n; exception when insufficient_privilege then return 0; end $$;

create table if not exists t.mark42 (k text primary key, ts timestamptz not null);
truncate t.mark42;
insert into t.mark42 values ('start', clock_timestamp());
delete from app_private.rate_limit_counters;

-- ================================================================================ bucket + constraint
select t.eq('bucket: public, 2 MB, three image types only',
  (select public::text || ':' || file_size_limit || ':' || (select string_agg(x, ',' order by x) from unnest(allowed_mime_types) x) from storage.buckets where id = 'company-public'),
  'true:2097152:image/jpeg,image/png,image/webp');
select t.eq('svg: a public-bucket SVG row is refused by the table itself (finding F2 closed)',
  t.err42(format($$insert into public.media (company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes) values (%L, 'logo', 'company-public', %L, 'x.svg', 'image/svg+xml', 10)$$, t.u(101), t.u(101)::text || '/logo/x.svg')), '23514');
select t.eq('svg: a PRIVATE-bucket document is not affected by that rule',
  t.err42(format($$insert into public.media (company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes) values (%L, 'other', 'company-private', %L, 'p.pdf', 'application/pdf', 10)$$, t.u(101), t.u(101)::text || '/p.pdf')), 'NO ERROR');
delete from public.media where original_filename = 'p.pdf';

-- ================================================================================ role matrix: reserve_media
create or replace function t.reserve42(p_actor uuid, p_tag text) returns text language plpgsql as $$
declare r text;
begin
  if p_actor is null then perform t.as_anon(); else perform t.as_user(p_actor); end if;
  begin
    perform public.reserve_media('logo', 'image/png', 1000, p_tag);
    r := 'Y';
  exception when others then r := sqlstate;
  end;
  perform t.as_admin();
  return r;
end $$;
select t.eq('matrix: owner may reserve',            t.reserve42(t.u(2), 'm-owner.png'), 'Y');
select t.eq('matrix: manager may reserve',          t.reserve42(t.u(3), 'm-manager.png'), 'Y');
select t.eq('matrix: operations may reserve (it holds media.write for driver photos and bus documents)', t.reserve42(t.u(4), 'm-ops.png'), 'Y');
select t.eq('matrix: booking staff refused',        t.reserve42(t.u(5), 'm-booking.png'), '42501');
select t.eq('matrix: driver refused',               t.reserve42(t.u(6), 'm-driver.png'), '42501');
select t.eq('matrix: platform super_admin has no membership: refused', t.reserve42(t.u(1), 'm-super.png'), '42501');
select t.eq('matrix: anonymous refused (no execute grant)', t.reserve42(null, 'm-anon.png'), '42501');
select t.eq('matrix: refused callers created no row', t.cnt42($$select count(*) from public.media where original_filename in ('m-booking.png','m-driver.png','m-super.png','m-anon.png')$$), 0::bigint);
select t.eq('matrix: rows belong to the caller''s company with the caller as uploader',
  (select string_agg(company_id::text || ':' || uploaded_by::text, ',' order by original_filename) from public.media where original_filename in ('m-owner.png', 'm-manager.png')),
  t.u(101)::text || ':' || t.u(3)::text || ',' || t.u(101)::text || ':' || t.u(2)::text);

-- ================================================================================ payload validation
select t.as_user(t.u(2));
select t.eq('payload: unknown kind',       t.err42($$select public.reserve_media('avatar', 'image/png', 10, 'a')$$), '22023');
select t.eq('payload: null kind',          t.err42($$select public.reserve_media(null, 'image/png', 10, 'a')$$), '22023');
select t.eq('payload: svg refused',        t.err42($$select public.reserve_media('logo', 'image/svg+xml', 10, 'a.svg')$$), '22023');
select t.eq('payload: gif refused',        t.err42($$select public.reserve_media('logo', 'image/gif', 10, 'a.gif')$$), '22023');
select t.eq('payload: html refused',       t.err42($$select public.reserve_media('logo', 'text/html', 10, 'a.html')$$), '22023');
select t.eq('payload: pdf refused (not an image)', t.err42($$select public.reserve_media('logo', 'application/pdf', 10, 'a.pdf')$$), '22023');
select t.eq('payload: null mime',          t.err42($$select public.reserve_media('logo', null, 10, 'a')$$), '22023');
select t.eq('payload: size 0',             t.err42($$select public.reserve_media('logo', 'image/png', 0, 'a')$$), '22023');
select t.eq('payload: negative size',      t.err42($$select public.reserve_media('logo', 'image/png', -1, 'a')$$), '22023');
select t.eq('payload: size 2 MB + 1',      t.err42($$select public.reserve_media('logo', 'image/png', 2097153, 'a')$$), '22023');
select t.eq('payload: null size',          t.err42($$select public.reserve_media('logo', 'image/png', null, 'a')$$), '22023');
select t.eq('payload: exactly 2 MB is fine', t.err42($$select public.reserve_media('website_image', 'image/webp', 2097152, 'edge.webp')$$), 'NO ERROR');
select public.reserve_media('logo', 'image/jpeg', 5, '../../etc/pass' || chr(1) || 'wd\x.jpg');
select public.reserve_media('logo', 'image/png', 5, '   ');
select t.as_admin();
select t.eq('payload: path separators and control characters in the filename are neutralised (stored name only; the path never uses it)',
  (select original_filename from public.media where mime_type = 'image/jpeg' and company_id = t.u(101)), '.._.._etc_pass_wd_x.jpg');
select t.eq('payload: blank filename gets a safe default', (select count(*) from public.media where original_filename = 'image.png' and company_id = t.u(101)), 1::bigint);
select t.eq('payload: the path is generated: <company>/<kind>/<uuid>.<ext>',
  (select bool_and(storage_path ~ ('^' || company_id::text || '/(logo|website_image)/[0-9a-f-]{36}\.(png|jpg|webp)$')) from public.media where company_id = t.u(101) and uploaded_by is not null), true);
select t.eq('payload: refused calls wrote nothing (owner rows: m-owner, edge, jpeg, blank = 4)',
  (select count(*) from public.media where uploaded_by = t.u(2)), 4::bigint);

-- ================================================================================ storage policies
select t.as_user(t.u(2));
select t.eq('storage: upload at the reserved path is allowed',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.path42('m-owner.png'))), 'NO ERROR');
select t.eq('storage: an unreserved path inside the own company folder is refused',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.u(101)::text || '/logo/' || gen_random_uuid() || '.png')), '42501');
select t.eq('storage: any path in ANOTHER company''s folder is refused',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.u(102)::text || '/logo/' || gen_random_uuid() || '.png')), '42501');
select t.eq('storage: a reservation made by a colleague cannot be used by someone else',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.path42('m-manager.png'))), '42501');
select t.eq('storage: another bucket is not covered by these policies',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-private', %L)$$, t.path42('edge.webp'))), '42501');
select t.as_user(t.u(7));
select t.eq('storage: owner of company B cannot use company A''s reserved path',
  t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.path42('edge.webp'))), '42501');
select t.eq('storage: ...nor delete A''s uploaded object (0 rows)',
  t.affected(format($$delete from storage.objects where name = %L$$, t.path42('m-owner.png'))), 0::bigint);
select t.as_anon();
select t.eq('storage: anonymous cannot upload', t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.path42('edge.webp'))), '42501');
select t.eq('storage: anonymous cannot list the bucket (no grant, no policy)', t.read42('select 1 from storage.objects'), 0::bigint);
select t.as_user(t.u(2));
select t.eq('storage: the owner sees the objects of the own company only', t.rows('select 1 from storage.objects'), 1::bigint);
select t.as_user(t.u(7));
select t.eq('storage: company B sees none of A''s objects', t.rows('select 1 from storage.objects'), 0::bigint);
select t.as_user(t.u(5));
select t.eq('storage: booking staff (no media.write) sees none', t.rows('select 1 from storage.objects'), 0::bigint);
select t.as_user(t.u(2));
select t.eq('storage: a discarded reservation can no longer be uploaded to',
  (select t.err42(format($$insert into storage.objects (bucket_id, name) values ('company-public', %L)$$, t.path42('image.png')))
     from (select public.discard_media(t.mid42('image.png'))) d), '42501');
select t.eq('storage: owner deletes an object in own company folder (1 row)',
  t.affected(format($$delete from storage.objects where name = %L$$, t.path42('m-owner.png'))), 1::bigint);
select t.as_user(t.u(5));
select t.eq('storage: booking staff cannot delete (no media.write)',
  t.affected(format($$delete from storage.objects where name = %L$$, t.path42('m-owner.png'))), 0::bigint);
select t.as_admin();

-- ================================================================================ isolation + direct table access
select t.as_user(t.u(7));
select t.eq('isolation: B sees none of A''s media rows', t.rows(format('select 1 from public.media where company_id = %L', t.u(101))), 0::bigint);
select t.eq('isolation: B discarding A''s media id: not found', t.err42(format($$select public.discard_media(%L)$$, t.mid42('edge.webp'))), 'P0002');
select t.eq('isolation: reserve has no company argument; B''s row lands in B', (public.reserve_media('logo', 'image/png', 10, 'b-logo.png'))->>'path' like t.u(102)::text || '/logo/%', true);
select t.as_user(t.u(2));
select t.eq('direct: owner cannot INSERT into media (no forged reservation)',
  t.err42(format($$insert into public.media (company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes) values (%L, 'logo', 'company-public', %L, 'f.png', 'image/png', 10)$$, t.u(101), t.u(101)::text || '/logo/forged.png')), '42501');
select t.eq('direct: owner cannot repoint storage_path', t.err42(format($$update public.media set storage_path = %L where original_filename = 'edge.webp'$$, t.u(101)::text || '/logo/other.png')), '42501');
select t.eq('direct: owner cannot change the mime type', t.err42($$update public.media set mime_type = 'image/svg+xml' where original_filename = 'edge.webp'$$), '42501');
select t.eq('direct: owner cannot soft-delete via UPDATE (use discard_media)', t.err42($$update public.media set deleted_at = now() where original_filename = 'edge.webp'$$), '42501');
select t.eq('direct: owner may edit alt_text', t.affected($$update public.media set alt_text = 'Logo' where original_filename = 'edge.webp'$$), 1::bigint);
select t.as_user(t.u(7));
select t.eq('direct: B editing A''s alt_text affects 0 rows', t.affected($$update public.media set alt_text = 'PWNED' where original_filename = 'edge.webp'$$), 0::bigint);
select t.as_admin();
select t.eq('direct: A''s alt_text is untouched', (select alt_text from public.media where original_filename = 'edge.webp'), 'Logo');

-- ================================================================================ the site validator still guards what media a site may use
select t.as_user(t.u(2));
select t.eq('site: A can set a reserved, same-company image as logo',
  t.err42(format($$update public.website_settings set logo_media_id = %L where company_id = %L$$, t.mid42('edge.webp'), t.u(101))), 'NO ERROR');
select t.eq('site: A cannot use B''s image as logo',
  t.err42(format($$update public.website_settings set logo_media_id = %L where company_id = %L$$, t.mid42('b-logo.png'), t.u(101))) <> 'NO ERROR', true);
select t.as_admin();
select t.eq('site: the stored logo is still A''s own', (select m.company_id from public.website_settings s join public.media m on m.id = s.logo_media_id where s.company_id = t.u(101)), t.u(101));
update public.website_settings set logo_media_id = null where company_id = t.u(101);

-- ================================================================================ quota (plan entitlement, enforced under the company lock)
update public.plan_entitlements set int_value = 7 where key = 'max_media_files'
  and plan_id = (select plan_id from app_private.live_subscription(t.u(101)));
select t.as_user(t.u(2));
-- live rows of A so far: m-owner, m-manager, m-ops, edge, jpeg (blank was discarded) -> 5 live; limit 7
select public.reserve_media('logo', 'image/png', 10, 'q1.png');
select public.reserve_media('logo', 'image/png', 10, 'q2.png');
select t.eq('quota: the 8th live image is refused (53400)', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'q3.png')$$), '53400');
select t.as_admin();
select t.eq('quota: the refused call wrote nothing', t.cnt42($$select count(*) from public.media where original_filename = 'q3.png'$$), 0::bigint);
select t.as_user(t.u(2));
select public.discard_media(t.mid42('q1.png'));
select t.eq('quota: discarding frees a slot', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'q4.png')$$), 'NO ERROR');
select t.as_user(t.u(7));
select t.eq('quota: company B is counted separately', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'b2.png')$$), 'NO ERROR');
select t.as_admin();
update public.plan_entitlements set int_value = null where key = 'max_media_files'
  and plan_id = (select plan_id from app_private.live_subscription(t.u(101)));
select t.eq('quota: NULL means unlimited', (select int_value is null from public.plan_entitlements where key = 'max_media_files'
  and plan_id = (select plan_id from app_private.live_subscription(t.u(101)))), true);
-- a lapsed subscription cannot upload
update public.subscriptions set current_period_end = now() - interval '1 day' where company_id = t.u(101) and status = 'active';
select t.as_user(t.u(2));
select t.eq('lifecycle: lapsed subscription cannot reserve', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'late.png')$$), '42501');
select t.as_admin();
update public.subscriptions set current_period_end = now() + interval '30 days' where company_id = t.u(101) and status = 'active';
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_user(t.u(2));
select t.eq('lifecycle: suspended company cannot reserve', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'susp.png')$$), '42501');
select t.as_admin();
update public.companies set status = 'active', suspended_at = null where id = t.u(101);

-- ================================================================================ rate limit (20 / 10 min per user)
delete from app_private.rate_limit_counters;
insert into t.mark42 values ('rl', clock_timestamp());
select t.as_user(t.u(2));
select public.reserve_media('logo', 'image/png', 10, 'rl' || g || '.png') from generate_series(1, 20) g;
select t.eq('rate limit: the 21st reservation in the window is refused', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'rl21.png')$$), 'PT429');
select t.as_user(t.u(3));
select t.eq('rate limit: the manager has an own budget', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'rl-mgr.png')$$), 'NO ERROR');
select t.as_user(t.u(7));
select t.eq('rate limit: company B''s owner is unaffected', t.err42($$select public.reserve_media('logo', 'image/png', 10, 'rl-b.png')$$), 'NO ERROR');
select t.as_admin();
select t.eq('rate limit: the refused call wrote no row and no audit', t.cnt42($$select count(*) from public.media where original_filename = 'rl21.png'$$), 0::bigint);

-- ================================================================================ audit
select t.eq('audit: one media.upload row per successful reservation since the rate-limit test (20 owner + 1 manager + 1 B)',
  (select count(*) from public.audit_logs where action = 'media.upload' and created_at >= (select ts from t.mark42 where k = 'rl')), 22::bigint);
select t.eq('audit: carries company and actor, kind/mime/size only (no filename, no path)',
  (select bool_and(metadata ?& array['kind', 'mime', 'size'] and not metadata ? 'path' and not metadata ? 'filename') from public.audit_logs where action = 'media.upload' and company_id = t.u(101)), true);
select t.eq('audit: discard is audited', (select count(*) >= 2 from public.audit_logs where action = 'media.discard' and company_id = t.u(101)), true);

-- ================================================================================ cleanup: later suites share this database
delete from storage.objects;
update public.website_settings set logo_media_id = null where company_id in (t.u(101), t.u(102));
delete from public.media where uploaded_by is not null;
delete from app_private.rate_limit_counters;
drop table if exists t.mark42;
