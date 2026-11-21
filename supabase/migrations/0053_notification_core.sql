-- 0053 (P1): shared foundations F1 (scheduler) and F2 (notification core + inbox). Plan: docs/plans/NEXT-FEATURES-PLAN.md sections 1 and 5.
--
-- WHAT
--   F2  notification_events   the catalogue (one row per event: audience, default channels, mandatory?, live?). Adding an event is a row, not a schema change.
--       notification_preferences  per user, per event, per channel opt-outs (mandatory events cannot be turned off).
--       notifications +event_key +dedupe_key +link, unique (dedupe_key, channel): one reminder per entity per event, however often a producer runs.
--       app_private.enqueue_notification(...)  THE way a notice is created. Producers never insert into notifications themselves. It picks the
--           recipient's locale, the company's template override or the platform default, fills {{placeholders}}, honours opt-outs, and skips
--           channels that have no delivery yet (today only in_app is live; email and push arrive with the delivery phase).
--       my_inbox / my_unread_count (+ the existing mark_my_notices_read): the inbox for EVERY surface (student, staff, driver, admin).
--       my_notification_preferences / set_my_notification_preference.
--   F1  app_private.jobs + run_due_jobs(): one pg_cron entry per minute; every domain job is a row here, runs under a lock (never overlaps itself),
--       isolated from the others (one failing job does not stop the rest), and records last start / success / error. A failure notifies platform
--       staff (event platform.job_failed). platform_job_status() shows health to platform staff; a job that has not started within its
--       stale_after_seconds is reported as stale (this also catches pg_cron itself not running).
--   The first real job is purge_old_notifications. The 0041 nightly expiry notice is left exactly as it is (its unique index allows one notice per
--   subscription); the notification phase moves it onto enqueue_notification so it can send the 7-day AND 3-day reminders.
--
-- SECURITY
--   * Nothing here is writable by clients. notification_events and jobs: no client writes; preferences only through the RPC; notifications keeps the
--     0006 rule (clients may only mark their own read). enqueue_notification and run_due_jobs are not granted to any client role.
--   * Placeholder values are plain text: control characters removed, 300 characters at most, unfilled placeholders dropped. In-app text is shown as
--     text (never as HTML) and the delivery phase must HTML-escape for email. A notice link must be an in-app path ('/...', not '//' or '\').
--   * A user only ever reads their own inbox (recipient_user_id = auth.uid()); notices of a suspended company are hidden, as in 0041.
--   * A job's function name is a bare identifier that must exist in schema app_private (CHECK + format %I); the table is not granted to anyone.
--   * A failed job's error text stays in app_private.jobs (platform staff read it through platform_job_status); the notice sent to staff names the
--     job only, never the error.
--
-- ROLLBACK (manual)
--   select cron.unschedule(jobid) from cron.job where jobname = 'masar-run-due-jobs';
--   drop function public.platform_job_status(), public.set_my_notification_preference(text, text, boolean), public.my_notification_preferences(),
--     public.my_unread_count(), public.my_inbox(integer, timestamptz, uuid);
--   drop function app_private.run_due_jobs(), app_private.purge_old_notifications(), app_private.notify_job_failed(text), app_private.enqueue_notification(text, uuid, uuid, jsonb, text, uuid, text, text),
--     app_private.render_notice(text, jsonb), app_private.live_notification_channels(), app_private.user_audiences(uuid);
--   drop table app_private.jobs, public.notification_preferences, public.notification_events;
--   drop index notifications_dedupe_uq, notifications_inbox_user_idx, notifications_unread_idx;
--   alter table notifications drop column event_key, drop column dedupe_key, drop column link;
--   (the widened channel checks may stay.)
-- RUNNER NOTE: apply BEFORE deploying code that calls these functions (incident 0033). Requires 0003, 0004, 0006, 0041.
set search_path = public, extensions;

-- 1. channels: add 'push' (web push), keeping the four existing values ------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select conrelid::regclass as tbl, conname from pg_constraint
            where contype = 'c' and conrelid in ('public.notifications'::regclass, 'public.notification_templates'::regclass)
              and pg_get_constraintdef(oid) like '%channel%in%' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
alter table notifications add constraint notifications_channel_check check (channel in ('email', 'in_app', 'sms', 'whatsapp', 'push'));
alter table notification_templates add constraint notification_templates_channel_check check (channel in ('email', 'in_app', 'sms', 'whatsapp', 'push'));

-- 2. notifications: event, dedupe key, link --------------------------------------------------------------------------------------------
alter table notifications
  add column event_key text,
  add column dedupe_key text check (dedupe_key is null or length(dedupe_key) between 1 and 200),
  add column link text check (link is null or (link ~ '^/[^/\\]' and length(link) <= 300) or link = '/');
create unique index notifications_dedupe_uq on notifications (dedupe_key, channel) where dedupe_key is not null;
create index notifications_inbox_user_idx on notifications (recipient_user_id, created_at desc, id desc) where channel = 'in_app';
create index notifications_unread_idx on notifications (recipient_user_id) where channel = 'in_app' and status <> 'read';

-- 3. catalogue ---------------------------------------------------------------------------------------------------------------------------
create table notification_events (
  key              text primary key check (key ~ '^[a-z]+(\.[a-z_]+)+$'),
  audience         text not null check (audience in ('student', 'company_staff', 'company_owner', 'driver', 'platform')),
  default_channels text[] not null check (cardinality(default_channels) > 0 and default_channels <@ array['in_app', 'push', 'email', 'sms', 'whatsapp']::text[]),
  mandatory        boolean not null default false,        -- true: the user cannot opt out (payment deadlines, cancellations, security)
  is_live          boolean not null default false,        -- false until the phase that produces it ships its templates; enqueue ignores it
  description      text not null,
  created_at       timestamptz not null default now()
);
alter table notification_events enable row level security;
create policy catalogue_read on notification_events for select to authenticated using (true);
revoke all on notification_events from public, anon;
grant select on notification_events to authenticated;

insert into notification_events (key, audience, default_channels, mandatory, is_live, description) values
  ('booking.payment_reminder',                'student',       array['in_app','push','email'], true,  false, 'Payment deadline is near'),
  ('booking.cancelled_unpaid',                'student',       array['in_app','push','email'], true,  false, 'Booking auto-cancelled: payment not received in time'),
  ('booking.confirmed',                       'student',       array['in_app','email'],        false, false, 'Booking confirmed / marked paid'),
  ('trip.starting_soon',                      'student',       array['in_app','push'],         false, false, 'Trip departs soon'),
  ('trip.not_boarded',                        'student',       array['in_app','push'],         false, false, 'Booked but not boarded near departure'),
  ('trip.cancelled',                          'student',       array['in_app','push','email'], true,  false, 'Trip cancelled'),
  ('trip.changed',                            'student',       array['in_app','push','email'], false, false, 'Trip time or details changed'),
  ('subscription.requested',                  'student',       array['in_app'],                false, false, 'Subscription request received'),
  ('subscription.approved',                   'student',       array['in_app','push','email'], false, false, 'Subscription approved'),
  ('subscription.rejected',                   'student',       array['in_app','push','email'], false, false, 'Subscription rejected'),
  ('subscription.expiring',                   'student',       array['in_app','push'],         false, false, 'Subscription ends in 7 and 3 days'),
  ('subscription.expired',                    'student',       array['in_app'],                false, false, 'Subscription expired'),
  ('company.platform_subscription_expiring',  'company_owner', array['in_app','email'],        true,  false, 'The company''s MALAKY plan ends in 3 days, 1 day, and at expiry'),
  ('company.student_subscription_expiring',   'company_staff', array['in_app'],                false, false, 'Daily digest of student plans about to end'),
  ('company.booking_needs_review',            'company_staff', array['in_app','push'],        false, false, 'A booking is waiting for payment confirmation'),
  ('company.subscription_request_pending',    'company_staff', array['in_app','push'],        false, false, 'A subscription request is waiting'),
  ('company.trip_boarding_soon',              'driver',        array['in_app','push'],        false, false, 'Boarding opens soon'),
  ('company.trip_starting_soon',              'company_staff', array['in_app'],                false, false, 'A trip departs soon'),
  ('company.students_not_boarded',            'driver',        array['in_app','push'],        false, false, 'Students booked but not boarded near departure'),
  ('platform.company_suspended',              'platform',      array['in_app','email'],        false, false, 'A company was suspended'),
  ('platform.job_failed',                     'platform',      array['in_app'],                true,  true,  'A background job failed or went stale');

-- the one event that is live in this phase needs its text (platform default, both languages)
insert into notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'platform.job_failed', 'in_app', 'en', 'Background job failed: {{job}}', 'The job "{{job}}" failed. Open the platform job status to see the details.'),
  (null, 'platform.job_failed', 'in_app', 'ar', 'فشل عمل خلفي: {{job}}', 'فشل العمل "{{job}}". افتح حالة الأعمال الخلفية للمنصة لمعرفة التفاصيل.');

-- 4. preferences -------------------------------------------------------------------------------------------------------------------------
create table notification_preferences (
  user_id    uuid not null references profiles(id) on delete cascade,
  event_key  text not null references notification_events(key) on delete cascade,
  channel    text not null check (channel in ('in_app', 'push', 'email', 'sms', 'whatsapp')),
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_key, channel)
);
alter table notification_preferences enable row level security;
create policy own_read on notification_preferences for select to authenticated using (user_id = auth.uid());
revoke all on notification_preferences from public, anon;
grant select on notification_preferences to authenticated;   -- writes only through set_my_notification_preference

-- which catalogue audiences a user belongs to (a student is anyone signed in; the others come from memberships)
create function app_private.user_audiences(p_user uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array['student']
      || coalesce((select case when r.key = 'driver' then array['driver'] when r.key = 'owner' then array['company_staff', 'company_owner'] else array['company_staff'] end
                     from public.company_users cu join public.roles r on r.id = cu.role_id where cu.user_id = p_user and cu.status = 'active'), '{}'::text[])
      || case when exists (select 1 from public.platform_users pu where pu.user_id = p_user and pu.is_active) then array['platform'] else '{}'::text[] end
$$;
revoke all on function app_private.user_audiences(uuid) from public, anon, authenticated;

create function public.my_notification_preferences()
returns table (event_key text, description text, channel text, enabled boolean, mandatory boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select e.key, e.description, ch, coalesce(np.enabled, true), e.mandatory
      from public.notification_events e
      cross join lateral unnest(e.default_channels) as ch
      left join public.notification_preferences np on np.user_id = auth.uid() and np.event_key = e.key and np.channel = ch
     where e.is_live and e.audience = any (app_private.user_audiences(auth.uid()))
     order by e.key, ch;
end $$;

create function public.set_my_notification_preference(p_event text, p_channel text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.notification_events%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_enabled is null then raise exception 'enabled is required' using errcode = '22023'; end if;
  select * into e from public.notification_events x where x.key = p_event and x.is_live and x.audience = any (app_private.user_audiences(auth.uid()));
  if not found then raise exception 'unknown event' using errcode = 'P0002'; end if;
  if p_channel is null or not (p_channel = any (e.default_channels)) then raise exception 'channel not offered for this event' using errcode = '22023'; end if;
  if e.mandatory and not p_enabled then raise exception 'this notice cannot be turned off' using errcode = '23514'; end if;
  insert into public.notification_preferences (user_id, event_key, channel, enabled) values (auth.uid(), p_event, p_channel, p_enabled)
  on conflict (user_id, event_key, channel) do update set enabled = excluded.enabled, updated_at = now();
end $$;

-- 5. rendering and enqueueing --------------------------------------------------------------------------------------------------------------
create function app_private.render_notice(p_tpl text, p_params jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  r text := p_tpl; m text[]; v text;
  params jsonb := case when jsonb_typeof(coalesce(p_params, '{}'::jsonb)) = 'object' then coalesce(p_params, '{}'::jsonb) else '{}'::jsonb end;
begin
  if r is null then return null; end if;
  -- ONE pass: placeholders in the TEMPLATE become sentinels first, then each sentinel gets its value. A value can never contain a sentinel
  -- (control characters are stripped), so a value that looks like {{other}} is shown as text and never expanded.
  r := regexp_replace(r, '\{\{([a-z_]+)\}\}', chr(1) || '\1' || chr(2), 'g');
  for m in select regexp_matches(r, chr(1) || '([a-z_]+)' || chr(2), 'g') loop
    v := left(regexp_replace(coalesce(params ->> m[1], ''), '[[:cntrl:]]', ' ', 'g'), 300);   -- plain text, 300 characters at most; a missing value is empty
    r := replace(r, chr(1) || m[1] || chr(2), v);
  end loop;
  return btrim(r);
end $$;
revoke all on function app_private.render_notice(text, jsonb) from public, anon, authenticated;

-- channels that actually have delivery. in_app is the row itself. The delivery phase adds 'push' and 'email' here (one place).
create function app_private.live_notification_channels() returns text[]
language sql immutable set search_path = '' as $$ select array['in_app']::text[] $$;
revoke all on function app_private.live_notification_channels() from public, anon, authenticated;

create function app_private.enqueue_notification(
  p_event text, p_user uuid, p_company uuid, p_params jsonb default '{}'::jsonb,
  p_entity_type text default null, p_entity_id uuid default null, p_dedupe text default null, p_link text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e public.notification_events%rowtype; pr public.profiles%rowtype; tpl public.notification_templates%rowtype;
  ch text; v_loc text; v_n integer := 0; v_rows integer; v_link text := p_link;
begin
  select * into e from public.notification_events x where x.key = p_event;
  if not found then raise exception 'unknown notification event %', p_event using errcode = 'P0002'; end if;
  if not e.is_live then return 0; end if;
  select * into pr from public.profiles p where p.id = p_user and p.is_active;
  if not found then return 0; end if;
  if v_link is not null and not (v_link = '/' or (v_link ~ '^/[^/\\]' and length(v_link) <= 300)) then v_link := null; end if;   -- only in-app paths
  v_loc := case when pr.locale = 'en' then 'en' else 'ar' end;
  foreach ch in array e.default_channels loop
    continue when not (ch = any (app_private.live_notification_channels()));
    continue when not e.mandatory and exists (select 1 from public.notification_preferences np
                                               where np.user_id = p_user and np.event_key = p_event and np.channel = ch and not np.enabled);
    select * into tpl from public.notification_templates nt
     where nt.key = p_event and nt.channel = ch and nt.is_active and nt.locale in (v_loc, 'en')
       and (nt.company_id is null or nt.company_id = p_company)
     order by (nt.company_id is not null) desc, (nt.locale = v_loc) desc limit 1;         -- company text first, then the user's language, then English
    continue when not found;
    insert into public.notifications (company_id, recipient_user_id, channel, template_key, event_key, subject, body,
                                      related_entity_type, related_entity_id, status, sent_at, dedupe_key, link)
    values (p_company, p_user, ch, p_event, p_event, app_private.render_notice(tpl.subject, p_params), app_private.render_notice(tpl.body, p_params),
            p_entity_type, p_entity_id, case when ch = 'in_app' then 'sent' else 'pending' end, case when ch = 'in_app' then now() end, p_dedupe, v_link)
    on conflict (dedupe_key, channel) where dedupe_key is not null do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.enqueue_notification(text, uuid, uuid, jsonb, text, uuid, text, text) from public, anon, authenticated;

-- 6. inbox -------------------------------------------------------------------------------------------------------------------------------
create function public.my_inbox(p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null)
returns table (id uuid, event_key text, subject text, body text, link text, created_at timestamptz, is_read boolean, company_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select n.id, n.event_key, n.subject, n.body, n.link, n.created_at, n.status = 'read', c.name::text
      from public.notifications n left join public.companies c on c.id = n.company_id
     where n.recipient_user_id = auth.uid() and n.channel = 'in_app'
       and (n.company_id is null or app_private.is_company_active(n.company_id))
       and (p_before is null or (n.created_at, n.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
     order by n.created_at desc, n.id desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

create function public.my_unread_count() returns integer
language plpgsql stable security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select count(*) into n from public.notifications x
   where x.recipient_user_id = auth.uid() and x.channel = 'in_app' and x.status <> 'read'
     and (x.company_id is null or app_private.is_company_active(x.company_id));
  return least(n, 99);                                   -- the bell shows "99+"; no need to count a huge backlog
end $$;

-- 7. scheduler -----------------------------------------------------------------------------------------------------------------------------
create table app_private.jobs (
  name                 text primary key check (name ~ '^[a-z0-9-]{3,60}$'),
  fn                   text not null check (fn ~ '^[a-z_][a-z0-9_]{2,60}$'),     -- a function in schema app_private, called with no arguments
  every_seconds        integer not null check (every_seconds between 30 and 86400),
  stale_after_seconds  integer not null check (stale_after_seconds >= every_seconds),
  enabled              boolean not null default true,
  created_at           timestamptz not null default now(),
  last_started_at      timestamptz,
  last_finished_at     timestamptz,
  last_ok_at           timestamptz,
  last_error           text,
  last_duration_ms     integer,
  runs                 bigint not null default 0,
  failures             bigint not null default 0
);
alter table app_private.jobs enable row level security;
revoke all on app_private.jobs from public, anon, authenticated;

create function app_private.notify_job_failed(p_job text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select pu.user_id from public.platform_users pu join public.profiles p on p.id = pu.user_id
            where pu.is_active and p.is_active and pu.role in ('super_admin', 'support') loop
    perform app_private.enqueue_notification('platform.job_failed', r.user_id, null, jsonb_build_object('job', p_job), 'job', null,
                                             'platform.job_failed:' || p_job || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24'), null);   -- at most once an hour per job
  end loop;
end $$;
revoke all on function app_private.notify_job_failed(text) from public, anon, authenticated;

create function app_private.run_due_jobs() returns integer
language plpgsql security definer set search_path = '' as $$
declare j record; v_ran integer := 0; v_t0 timestamptz; v_ms integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('masar.run_due_jobs')) then return 0; end if;   -- a slow earlier run is still going: skip, never overlap
  for j in select * from app_private.jobs
            where enabled and (last_started_at is null or last_started_at + make_interval(secs => every_seconds) <= now())
            order by name for update skip locked loop
    v_t0 := clock_timestamp();
    update app_private.jobs set last_started_at = v_t0 where name = j.name;
    begin
      execute format('select app_private.%I()', j.fn);
      v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer;
      update app_private.jobs set last_finished_at = clock_timestamp(), last_ok_at = clock_timestamp(), last_error = null, last_duration_ms = v_ms, runs = runs + 1 where name = j.name;
    exception when others then        -- the job's own work is rolled back; the record of the failure is not
      v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer;
      update app_private.jobs set last_finished_at = clock_timestamp(), last_error = left(sqlstate || ': ' || sqlerrm, 500), last_duration_ms = v_ms, runs = runs + 1, failures = failures + 1 where name = j.name;
      perform app_private.notify_job_failed(j.name);
    end;
    v_ran := v_ran + 1;
  end loop;
  return v_ran;
end $$;
revoke all on function app_private.run_due_jobs() from public, anon, authenticated;

-- first real job: tidy the inbox (read in-app notices older than 180 days; unread ones are kept)
create function app_private.purge_old_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with x as (delete from public.notifications where channel = 'in_app' and status = 'read' and read_at < now() - interval '180 days' returning 1)
  select count(*) into n from x;
  return n;
end $$;
revoke all on function app_private.purge_old_notifications() from public, anon, authenticated;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('purge-old-notifications', 'purge_old_notifications', 21600, 90000);

create function public.platform_job_status()
returns table (name text, every_seconds integer, last_started_at timestamptz, last_ok_at timestamptz, last_error text, last_duration_ms integer, runs bigint, failures bigint, enabled boolean, is_stale boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if app_private.platform_role() is null then raise exception 'not found' using errcode = 'P0002'; end if;
  return query
    select j.name, j.every_seconds, j.last_started_at, j.last_ok_at, j.last_error, j.last_duration_ms, j.runs, j.failures, j.enabled,
           j.enabled and coalesce(j.last_started_at, j.created_at) < now() - make_interval(secs => j.stale_after_seconds)
      from app_private.jobs j order by j.name;
end $$;

-- 8. grants --------------------------------------------------------------------------------------------------------------------------------
revoke all on function public.my_inbox(integer, timestamptz, uuid), public.my_unread_count(), public.my_notification_preferences(),
  public.set_my_notification_preference(text, text, boolean), public.platform_job_status() from public, anon;
grant execute on function public.my_inbox(integer, timestamptz, uuid), public.my_unread_count(), public.my_notification_preferences(),
  public.set_my_notification_preference(text, text, boolean), public.platform_job_status() to authenticated;

-- 9. one cron entry for every job (the same pg_cron guard as 0038/0041) -----------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'masar-run-due-jobs';
    perform cron.schedule('masar-run-due-jobs', '* * * * *', 'select app_private.run_due_jobs()');
  else
    raise notice 'pg_cron is not available: enable it, then run: select cron.schedule(''masar-run-due-jobs'', ''* * * * *'', ''select app_private.run_due_jobs()'')';
  end if;
end $cron$;
