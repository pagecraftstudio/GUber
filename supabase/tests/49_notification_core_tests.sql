-- 49: P1 notification core + scheduler (migration 0053).
-- Fixtures (01/30): A = company 101, B = 102. Users: 1 super_admin, 2 ownerA, 3 managerA, 6 driverA, 7 ownerB; students 3001, 3002 (no company).
select t.as_admin();
create or replace function t.err49(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt49(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.enq49(p_event text, p_user int, p_company uuid, p_params jsonb, p_dedupe text default null, p_link text default null) returns integer
  language plpgsql security definer as $$ begin return app_private.enqueue_notification(p_event, t.u(p_user), p_company, p_params, 'test', null, p_dedupe, p_link); end $$;

delete from public.notifications where event_key like 'test.%' or event_key = 'platform.job_failed';
-- earlier suites created students/subscriptions/trips, which now (0056) write notices of their own: this suite is about the core, start from none
delete from public.notifications where event_key is not null;
update public.profiles set locale = 'ar' where id = t.u(3001);
update public.profiles set locale = 'en' where id = t.u(3002);
insert into public.notification_events (key, audience, default_channels, mandatory, is_live, description) values
  ('test.live', 'student', array['in_app','email'], false, true, 'test'),
  ('test.must', 'student', array['in_app'], true, true, 'test'),
  ('test.off',  'student', array['in_app'], false, false, 'test');
insert into public.notification_templates (company_id, key, channel, locale, subject, body) values
  (null, 'test.live', 'in_app', 'en', 'Hello {{name}}', 'English body for {{name}}{{missing}}'),
  (null, 'test.live', 'in_app', 'ar', 'مرحبا {{name}}', 'نص عربي لـ {{name}}'),
  (null, 'test.live', 'email',  'en', 'Mail {{name}}', 'Mail body'),
  (t.u(101), 'test.live', 'in_app', 'en', 'Company hello {{name}}', 'Company English body'),
  (null, 'test.must', 'in_app', 'en', 'Must', 'Must body');

-- 1. the catalogue and its rules ---------------------------------------------------------------------------------------------------------
select t.eq('catalogue: the plan''s events are seeded', t.cnt49($$select count(*) from public.notification_events where key not like 'test.%'$$), 21::bigint);
select t.eq('catalogue: only platform.job_failed is live out of the box', t.cnt49($$select count(*) from public.notification_events where is_live and key not like 'test.%' and key not like 'booking.%' and key not like 'trip.%' and key not like 'subscription.%' and key not like 'company.%'$$), 1::bigint);
select t.as_user(t.u(3001));
select t.eq('catalogue: a signed-in user can read it', t.rows($$select 1 from public.notification_events$$) >= 21, true);
select t.eq('catalogue: nobody can write it', t.err49($$insert into public.notification_events (key, audience, default_channels, description) values ('x.y','student',array['in_app'],'x')$$), '42501');
select t.eq('catalogue: or edit it', t.err49($$update public.notification_events set is_live = true where key = 'booking.confirmed'$$), '42501');
select t.as_anon();
select t.eq('catalogue: anon has no access', t.err49($$select 1 from public.notification_events$$), '42501');
select t.as_admin();
select t.eq('catalogue: a bad key is refused', t.err49($$insert into public.notification_events (key, audience, default_channels, description) values ('Bad Key','student',array['in_app'],'x')$$), '23514');
select t.eq('catalogue: an unknown channel is refused', t.err49($$insert into public.notification_events (key, audience, default_channels, description) values ('x.chan','student',array['pigeon'],'x')$$), '23514');

-- 2. enqueue: language, template precedence, channels, dedupe, safety -------------------------------------------------------------------
select t.eq('enqueue: unknown event is an error', t.err49($$select app_private.enqueue_notification('no.such_event', t.u(3001), null)$$), 'P0002');
select t.eq('enqueue: a non-live event does nothing', t.enq49('test.off', 3001, null, '{}'), 0);
select t.eq('enqueue: only live channels are written (email has no delivery yet)', t.enq49('test.live', 3001, null, '{"name":"Mona"}', 'd1'), 1);
select t.eq('enqueue: the row is an in_app notice, already visible', t.cnt49($$select count(*) from public.notifications where dedupe_key = 'd1' and channel = 'in_app' and status = 'sent' and sent_at is not null$$), 1::bigint);
select t.eq('enqueue: no email row was created', t.cnt49($$select count(*) from public.notifications where event_key = 'test.live' and channel = 'email'$$), 0::bigint);
select t.eq('language: an Arabic user gets the Arabic text', (select body from public.notifications where dedupe_key = 'd1'), 'نص عربي لـ Mona');
select t.eq('language: an English user gets the English text', t.enq49('test.live', 3002, null, '{"name":"Sam"}', 'd2'), 1);
select t.eq('language: ...and the unfilled placeholder is dropped, not shown raw', (select body from public.notifications where dedupe_key = 'd2'), 'English body for Sam');
select t.eq('dedupe: the same key never inserts twice', t.enq49('test.live', 3001, null, '{"name":"Mona"}', 'd1'), 0);
select t.eq('dedupe: no key means a new notice each time', t.enq49('test.live', 3001, null, '{"name":"a"}') + t.enq49('test.live', 3001, null, '{"name":"b"}'), 2);
select t.eq('template: the company''s own text wins over the platform default', t.enq49('test.live', 3002, t.u(101), '{"name":"Sam"}', 'd3'), 1);
select t.eq('template: ...and says so', (select subject from public.notifications where dedupe_key = 'd3'), 'Company hello Sam');
select t.eq('template: another company''s text is never used', (select subject from public.notifications where dedupe_key = 'd2'), 'Hello Sam');
select t.eq('safety: control characters go, long values are cut to 300', length((select body from (select app_private.render_notice('{{v}}', jsonb_build_object('v', repeat('a', 500) || chr(7))) as body) q)), 300);
select t.eq('safety: a value that looks like a placeholder is shown as text, never expanded', app_private.render_notice('{{a}} {{b}}', '{"a":"{{b}}","b":"X"}'::jsonb), '{{b}} X');
select t.eq('safety: a params value that is not an object is ignored', app_private.render_notice('Hi {{a}}', '[1,2]'::jsonb), 'Hi');
select t.eq('link: an in-app path is kept', (select t.enq49('test.live', 3001, null, '{"name":"l"}', 'l1', '/my-bookings')), 1);
select t.eq('link: stored as given', (select link from public.notifications where dedupe_key = 'l1'), '/my-bookings');
select t.eq('link: //evil.com and absolute URLs are dropped, the notice is still sent', (select t.enq49('test.live', 3001, null, '{"name":"l"}', 'l2', '//evil.com')), 1);
select t.eq('link: ...with no link', (select link from public.notifications where dedupe_key = 'l2'), null::text);
select t.eq('link: a direct insert with a bad link is refused by the table', t.err49($$insert into public.notifications (recipient_user_id, channel, body, link) values (t.u(3001), 'in_app', 'x', 'https://evil.com')$$), '23514');

-- 3. preferences ---------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3001));
select t.eq('prefs: only live events for the user''s audiences are listed', t.rows($$select 1 from public.my_notification_preferences() where event_key like 'test.%'$$), 3::bigint);   -- test.live x2 channels + test.must
select t.eq('prefs: a student does not see platform events', t.rows($$select 1 from public.my_notification_preferences() where event_key = 'platform.job_failed'$$), 0::bigint);
select t.eq('prefs: unknown event refused', t.err49($$select public.set_my_notification_preference('no.such', 'in_app', false)$$), 'P0002');
select t.eq('prefs: an event of another audience refused', t.err49($$select public.set_my_notification_preference('platform.job_failed', 'in_app', false)$$), 'P0002');
select t.eq('prefs: a channel the event does not offer refused', t.err49($$select public.set_my_notification_preference('test.live', 'sms', false)$$), '22023');
select t.eq('prefs: a mandatory notice cannot be turned off', t.err49($$select public.set_my_notification_preference('test.must', 'in_app', false)$$), '23514');
select t.eq('prefs: null is refused', t.err49($$select public.set_my_notification_preference('test.live', 'in_app', null)$$), '22023');
select t.passes('prefs: opt out of a normal notice', $$select public.set_my_notification_preference('test.live', 'in_app', false)$$);
select t.eq('prefs: the list shows it as off', (select enabled from public.my_notification_preferences() where event_key = 'test.live' and channel = 'in_app'), false);
select t.eq('prefs: direct writes are refused', t.err49($$insert into public.notification_preferences (user_id, event_key, channel, enabled) values (t.u(3001), 'test.live', 'email', false)$$), '42501');
select t.as_user(t.u(3002));
select t.eq('prefs: another user''s opt-outs are not visible', t.rows($$select 1 from public.notification_preferences$$), 0::bigint);
select t.as_admin();
select t.eq('opt-out: the notice is NOT created for an opted-out user', t.enq49('test.live', 3001, null, '{"name":"x"}', 'p1'), 0);
select t.eq('opt-out: a mandatory notice ignores any stored opt-out', (with i as (insert into public.notification_preferences (user_id, event_key, channel, enabled) values (t.u(3001), 'test.must', 'in_app', false) returning 1) select t.enq49('test.must', 3001, null, '{}', 'p2') from i), 1);

-- 4. inbox -----------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3002));
select t.eq('inbox: a user sees only their own notices', t.rows($$select 1 from public.my_inbox(50) where id in (select id from public.notifications where recipient_user_id = t.u(3001))$$), 0::bigint);
create temp table n3002 as select id from public.notifications where recipient_user_id = t.u(3002) limit 1;
grant select on n3002 to public;
select t.as_user(t.u(3001));
select t.eq('inbox: and their own are there (d1, two unkeyed, l1, l2, p2)', t.rows($$select 1 from public.my_inbox(50)$$), 6::bigint);
select t.eq('inbox: unread count matches', public.my_unread_count(), 6);
select t.eq('inbox: newest first, page size respected', t.rows($$select 1 from public.my_inbox(2)$$), 2::bigint);
select t.eq('inbox: keyset paging returns the rest, never repeats', t.rows($$select 1 from public.my_inbox(50, (select created_at from public.my_inbox(1) offset 0), (select id from public.my_inbox(1)))$$), 5::bigint);
select t.eq('inbox: marking read lowers the unread count', public.mark_my_notices_read((select array_agg(id) from public.my_inbox(2))), 2);
select t.eq('inbox: ...to 4', public.my_unread_count(), 4);
select t.eq('inbox: a user cannot mark another user''s notice', public.mark_my_notices_read(array(select id from n3002)), 0);
select t.as_anon();
select t.eq('inbox: anon refused', t.err49($$select public.my_unread_count()$$), '42501');
select t.as_admin();
update public.notifications set company_id = t.u(101) where dedupe_key = 'd3';
update public.companies set status = 'suspended' where id = t.u(101);
select t.as_user(t.u(3002));
select t.eq('inbox: notices of a suspended company are hidden', t.rows($$select 1 from public.my_inbox(50) where id = (select id from public.notifications where dedupe_key = 'd3')$$), 0::bigint);
select t.as_admin();
update public.companies set status = 'active' where id = t.u(101);

-- 5. scheduler ---------------------------------------------------------------------------------------------------------------------------
create or replace function app_private.t49_ok() returns integer language plpgsql security definer as $$ begin perform app_private.write_audit('system', null, 'test.job_ran', 'job', null, '{}'::jsonb); return 1; end $$;
create or replace function app_private.t49_fail() returns integer language plpgsql security definer as $$ begin perform app_private.write_audit('system', null, 'test.job_half_done', 'job', null, '{}'::jsonb); raise exception 'boom secret detail'; end $$;
drop table if exists t.jobs_saved;
create table t.jobs_saved as select * from app_private.jobs;      -- later migrations register real jobs; put them back at the end
delete from app_private.jobs;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values
  ('t49-a-fail', 't49_fail', 60, 120), ('t49-b-ok', 't49_ok', 60, 120), ('t49-never', 't49_ok', 3600, 7200);
update app_private.jobs set enabled = false where name = 't49-never';
select t.eq('jobs: the bad function name is refused by the table', t.err49($$insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('t49-evil', 'x; drop table y', 60, 120)$$), '23514');
select t.as_user(t.u(3001));
select t.eq('jobs: not readable by a signed-in user', t.err49($$select 1 from app_private.jobs$$), '42501');
select t.as_admin();
select t.eq('run: two due jobs run (the disabled one does not)', app_private.run_due_jobs(), 2);
select t.eq('run: a failing job does not stop the next one', t.cnt49($$select count(*) from public.audit_logs where action = 'test.job_ran'$$), 1::bigint);
select t.eq('run: the failed job''s work was rolled back', t.cnt49($$select count(*) from public.audit_logs where action = 'test.job_half_done'$$), 0::bigint);
select t.eq('run: failure recorded with count and error', (select failures::text || '/' || (last_error like '%boom%')::text from app_private.jobs where name = 't49-a-fail'), '1/true');
select t.eq('run: success recorded and clears the error', (select (last_ok_at is not null and last_error is null)::text from app_private.jobs where name = 't49-b-ok'), 'true');
select t.eq('run: a second call right away runs nothing (not due yet)', app_private.run_due_jobs(), 0);
update app_private.jobs set last_started_at = now() - interval '2 minutes';
select t.eq('run: due again after the interval', app_private.run_due_jobs(), 2);
select t.eq('alert: the super admin got ONE notice naming the job, once an hour, not two', t.cnt49($$select count(*) from public.notifications where event_key = 'platform.job_failed' and recipient_user_id = t.u(1)$$), 1::bigint);
select t.eq('alert: the notice names the job and never the error text', (select (subject like '%t49-a-fail%' and body not like '%boom%' and body not like '%secret%')::text from public.notifications where event_key = 'platform.job_failed' and recipient_user_id = t.u(1) limit 1), 'true');
select t.eq('alert: students and company staff are not alerted', t.cnt49($$select count(*) from public.notifications where event_key = 'platform.job_failed' and recipient_user_id not in (select user_id from public.platform_users)$$), 0::bigint);
select t.as_user(t.u(1));
select t.eq('status: platform staff see all jobs with their health', t.rows($$select 1 from public.platform_job_status()$$), 3::bigint);
select t.eq('status: the failing one shows its failures', (select failures::int from public.platform_job_status() where name = 't49-a-fail'), 2);
select t.as_admin();
update app_private.jobs set last_started_at = now() - interval '1 day' where name = 't49-b-ok';
select t.as_user(t.u(1));
select t.eq('status: a job that did not start within its window is stale', (select is_stale from public.platform_job_status() where name = 't49-b-ok'), true);
select t.eq('status: a disabled job is never reported stale', (select is_stale from public.platform_job_status() where name = 't49-never'), false);
select t.as_user(t.u(2));
select t.eq('status: company staff cannot see platform job status', t.err49($$select * from public.platform_job_status()$$), 'P0002');
select t.as_user(t.u(3001));
select t.eq('status: a student cannot either', t.err49($$select * from public.platform_job_status()$$), 'P0002');
select t.as_anon();
select t.eq('status: anon refused', t.err49($$select * from public.platform_job_status()$$), '42501');
select t.as_admin();
delete from app_private.jobs where name like 't49-%';
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('purge-old-notifications', 'purge_old_notifications', 21600, 90000) on conflict do nothing;
insert into app_private.jobs select * from t.jobs_saved on conflict (name) do nothing;
insert into public.notifications (recipient_user_id, channel, body, status, read_at, created_at) values
  (t.u(3001), 'in_app', 'old read', 'read', now() - interval '200 days', now() - interval '200 days'),
  (t.u(3001), 'in_app', 'old unread', 'sent', null, now() - interval '200 days'),
  (t.u(3001), 'in_app', 'new read', 'read', now() - interval '1 day', now() - interval '1 day');
select t.eq('purge: removes only READ in-app notices older than 180 days', app_private.purge_old_notifications(), 1);
select t.eq('purge: the unread old one and the recent read one stay', t.cnt49($$select count(*) from public.notifications where body in ('old unread', 'new read')$$), 2::bigint);
