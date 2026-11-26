-- 0067: platform security review (P9 slice C). D5 = no 2FA for platform users, so these two mitigations are REQUIRED:
--   1. NEW-DEVICE ALERT. After a platform sign-in the app sends a keyed hash of (coarse network + browser family) and a short label.
--      The first device of a user is recorded silently. Every later NEW device writes an audit row (platform.login_new_device) and sends an in-app
--      notice (platform.unusual_login, mandatory) to every active super_admin, the signed-in user included. The raw IP address never reaches the database.
--   2. AUDIT REVIEW. Acting starts, write confirmations and new-device logins can be reviewed by a super_admin. Four eyes: nobody reviews their own entries.
-- LIMITS (stated, not hidden): the hash is computed by the app server, so a compromised app server could send a known hash. An alert is a signal,
--   not a block: sign-in is never refused because of it. A user with no recorded device is never alerted (nothing to compare with).
-- ROLLBACK: drop functions record_platform_login, platform_security_review, platform_review_audit_entry; drop tables app_private.platform_login_devices,
--   app_private.audit_reviews; delete from notification_templates / notification_events where key = 'platform.unusual_login'; delete the two rate_limit_policies rows.
-- RUNNER NOTE: apply before deploying code that calls the new RPCs.
set search_path = public, extensions;

create table app_private.platform_login_devices (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label       text not null check (char_length(label) between 1 and 80),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  seen_count  integer not null default 1 check (seen_count >= 1),
  primary key (user_id, device_hash)
);
alter table app_private.platform_login_devices enable row level security;
revoke all on app_private.platform_login_devices from public, anon, authenticated;

create table app_private.audit_reviews (
  audit_id    uuid primary key references public.audit_logs (id) on delete cascade,
  reviewed_by uuid references public.profiles (id) on delete set null,
  note        text check (note is null or char_length(note) <= 300),
  reviewed_at timestamptz not null default now()
);
alter table app_private.audit_reviews enable row level security;
revoke all on app_private.audit_reviews from public, anon, authenticated;

insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description)
select v.* from (values ('platform.login_record', 3600, 30, 'record_platform_login per user per hour'), ('platform.review', 60, 60, 'security review reads and marks per user per minute')) as v(bucket, window_seconds, max_hits, description)
 where not exists (select 1 from app_private.rate_limit_policies p where p.bucket = v.bucket);

insert into public.notification_events (key, audience, default_channels, mandatory, is_live, description)
values ('platform.unusual_login', 'platform', array['in_app'], true, true, 'A platform staff account signed in from a device not seen before');
insert into public.notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'platform.unusual_login', 'in_app', 'en', 'New device sign-in: {{user}}', '{{user}} signed in from a new device ({{device}}). If this was not them, deactivate the account and review the audit log.'),
  (null, 'platform.unusual_login', 'in_app', 'ar', 'تسجيل دخول من جهاز جديد: {{user}}', 'قام {{user}} بتسجيل الدخول من جهاز جديد ({{device}}). إذا لم يكن هو، قم بتعطيل الحساب وراجع سجل التدقيق.');

-- called by the app right after a successful platform sign-in; the caller is always the signed-in user
create or replace function public.record_platform_login(p_device_hash text, p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_role text := app_private.platform_role(); v_label text; v_known integer; v_new boolean; v_name text; r record; v_alerts integer := 0;
begin
  if v_uid is null or v_role is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid device hash' using errcode = '22023'; end if;
  perform app_private.rate_limit_hit('platform.login_record');
  v_label := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_label, ''), '[^[:alnum:] ._,()+-]', '', 'g')), ''), 'Unknown device'), 80);
  select count(*) into v_known from app_private.platform_login_devices d where d.user_id = v_uid;
  insert into app_private.platform_login_devices (user_id, device_hash, label) values (v_uid, p_device_hash, v_label)
  on conflict (user_id, device_hash) do update set last_seen = now(), seen_count = app_private.platform_login_devices.seen_count + 1
  returning (xmax = 0) into v_new;
  if not v_new then return jsonb_build_object('new_device', false, 'alerted', 0); end if;
  if v_known = 0 then
    perform app_private.write_audit('platform_user', null, 'platform.login_first_device', 'platform_user', v_uid, jsonb_build_object('role', v_role, 'device', v_label));
    return jsonb_build_object('new_device', true, 'alerted', 0);
  end if;
  select p.full_name into v_name from public.profiles p where p.id = v_uid;
  perform app_private.write_audit('platform_user', null, 'platform.login_new_device', 'platform_user', v_uid, jsonb_build_object('role', v_role, 'device', v_label));
  for r in select pu.user_id from public.platform_users pu where pu.role = 'super_admin' and pu.is_active loop
    v_alerts := v_alerts + app_private.enqueue_notification('platform.unusual_login', r.user_id, null, jsonb_build_object('user', coalesce(v_name, '?'), 'device', v_label),
      'platform_user', v_uid, 'platform.unusual_login:' || v_uid || ':' || left(p_device_hash, 16) || ':' || r.user_id, '/admin/security-review');
  end loop;
  return jsonb_build_object('new_device', true, 'alerted', v_alerts);
end $$;
revoke all on function public.record_platform_login(text, text) from public, anon;
grant execute on function public.record_platform_login(text, text) to authenticated;

-- the review list: super_admin only. Reviewable = the three actions an attacker or a rogue admin would leave behind.
create or replace function public.platform_security_review(p_days integer default 7, p_only_unreviewed boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_days integer := least(greatest(coalesce(p_days, 7), 1), 90); v_items jsonb; v_unreviewed bigint;
begin
  perform app_private.assert_platform(array['super_admin']);
  with e as (
    select a.id, a.created_at, a.action, a.actor_id, a.company_id, a.metadata, rv.reviewed_by, rv.reviewed_at, rv.note
      from public.audit_logs a left join app_private.audit_reviews rv on rv.audit_id = a.id
     where a.action in ('acting.started', 'acting.write_enabled', 'platform.login_new_device') and a.created_at >= now() - make_interval(days => v_days))
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'created_at', x.created_at, 'action', x.action, 'actor_id', x.actor_id, 'actor_name', pa.full_name, 'actor_email', pa.email::text,
           'company_id', x.company_id, 'company_name', c.name, 'metadata', x.metadata, 'reviewed_at', x.reviewed_at, 'reviewed_by_name', pr.full_name, 'review_note', x.note,
           'can_review', x.reviewed_at is null and x.actor_id is distinct from auth.uid()) order by x.created_at desc, x.id desc), '[]'::jsonb),
         count(*) filter (where x.reviewed_at is null)
    into v_items, v_unreviewed
    from (select * from e where not p_only_unreviewed or e.reviewed_at is null order by e.created_at desc, e.id desc limit 200) x
    left join public.profiles pa on pa.id = x.actor_id left join public.profiles pr on pr.id = x.reviewed_by left join public.companies c on c.id = x.company_id;
  return jsonb_build_object('days', v_days, 'items', v_items, 'unreviewed', v_unreviewed);
end $$;
revoke all on function public.platform_security_review(integer, boolean) from public, anon;
grant execute on function public.platform_security_review(integer, boolean) to authenticated;

create or replace function public.platform_review_audit_entry(p_audit_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.audit_logs%rowtype; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform app_private.assert_platform(array['super_admin']);
  perform app_private.rate_limit_hit('platform.review');
  if v_note is not null and char_length(v_note) > 300 then raise exception 'note too long' using errcode = '22023'; end if;
  select * into a from public.audit_logs x where x.id = p_audit_id and x.action in ('acting.started', 'acting.write_enabled', 'platform.login_new_device');
  if not found then raise exception 'entry not found' using errcode = 'P0002'; end if;
  if a.actor_id is not distinct from auth.uid() then raise exception 'you cannot review your own actions' using errcode = '42501'; end if;
  insert into app_private.audit_reviews (audit_id, reviewed_by, note) values (a.id, auth.uid(), v_note) on conflict (audit_id) do nothing;
  if found then
    perform app_private.write_audit('platform_user', null, 'platform.entry_reviewed', 'audit_log', a.id, jsonb_build_object('reviewed_action', a.action));
  end if;
end $$;
revoke all on function public.platform_review_audit_entry(uuid, text) from public, anon;
grant execute on function public.platform_review_audit_entry(uuid, text) to authenticated;
