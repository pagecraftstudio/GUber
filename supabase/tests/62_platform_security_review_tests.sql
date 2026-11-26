-- 62: P9 slice C, new-device alert + audit review (migration 0067). Needs 01 fixtures: users 1 super_admin, 9 support, 10 billing, 2 ownerA; user 3 is promoted to a SECOND super_admin here
-- (four-eyes review needs two) and demoted at the end. Audit rows are append-only and stay by design.
select t.as_admin();
delete from t.results where name like 'p9c: %';
create or replace function t.e62(who uuid, stmt text) returns text language plpgsql as $$
begin
  if who is null then perform t.as_anon(); else perform t.as_user(who); end if;
  begin execute stmt; perform t.as_admin(); return 'NO ERROR';
  exception when others then perform t.as_admin(); return sqlstate || '|' || sqlerrm; end;
end $$;
create or replace function t.q62(stmt text) returns text language plpgsql security definer as $$ declare r text; begin execute stmt into r; return r; end $$;
create or replace function t.as62(who uuid, stmt text) returns text language plpgsql as $$
declare r text; begin perform t.as_user(who); execute stmt into r; perform t.as_admin(); return r; end $$;
insert into platform_users (user_id, role) values (t.u(3), 'super_admin');

-- A. who may call what -------------------------------------------------------------------------------------------------------------------------------
select t.eq('p9c: anon cannot record a login', t.e62(null, format($$select public.record_platform_login(%L, 'x')$$, repeat('a', 64))) like '42501%', true);
select t.eq('p9c: a company owner cannot record a platform login', t.e62(t.u(2), format($$select public.record_platform_login(%L, 'x')$$, repeat('a', 64))) like '42501%', true);
select t.eq('p9c: a malformed hash is refused', t.e62(t.u(1), $$select public.record_platform_login('not-a-hash', 'x')$$) like '22023%', true);
select t.eq('p9c: an upper-case or short hash is refused', t.e62(t.u(1), format($$select public.record_platform_login(%L, 'x')$$, repeat('A', 64))) like '22023%', true);
select t.eq('p9c: support cannot open the review', t.e62(t.u(9), $$select public.platform_security_review(7, false)$$) like '42501%', true);
select t.eq('p9c: billing cannot open the review', t.e62(t.u(10), $$select public.platform_security_review(7, false)$$) like '42501%', true);
select t.eq('p9c: owner cannot open the review', t.e62(t.u(2), $$select public.platform_security_review(7, false)$$) like '42501%', true);
select t.eq('p9c: anon has no EXECUTE on the three RPCs',
  (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('record_platform_login', 'platform_security_review', 'platform_review_audit_entry')), false);
select t.eq('p9c: no client role can read the two private tables',
  has_table_privilege('authenticated', 'app_private.platform_login_devices', 'select') or has_table_privilege('authenticated', 'app_private.audit_reviews', 'select'), false);
select t.eq('p9c: no raw IP column exists anywhere in the device table',
  (select count(*) from information_schema.columns where table_schema = 'app_private' and table_name = 'platform_login_devices' and (column_name ilike '%ip%' and column_name <> 'description')), 0::bigint);

-- B. new-device alert ------------------------------------------------------------------------------------------------------------------------------
select t.eq('p9c: first device is silent (no alert)', t.as62(t.u(1), format($$select (public.record_platform_login(%L, 'Chrome on Windows'))::text$$, repeat('a', 64))), '{"alerted": 0, "new_device": true}');
select t.eq('p9c: first device is audited as first_device', (select count(*) from audit_logs where action = 'platform.login_first_device' and actor_id = t.u(1)), 1::bigint);
select t.eq('p9c: same device again is not new', t.as62(t.u(1), format($$select (public.record_platform_login(%L, 'Chrome on Windows'))::text$$, repeat('a', 64))), '{"alerted": 0, "new_device": false}');
select t.eq('p9c: seen_count counts the repeat', (select seen_count from app_private.platform_login_devices where user_id = t.u(1)), 2);
select t.eq('p9c: a second device alerts both super admins', t.as62(t.u(1), format($$select (public.record_platform_login(%L, 'Safari on iPhone'))::text$$, repeat('b', 64))), '{"alerted": 2, "new_device": true}');
select t.eq('p9c: new device is audited', (select count(*) from audit_logs where action = 'platform.login_new_device' and actor_id = t.u(1)), 1::bigint);
select t.eq('p9c: the other super admin got an in-app notice', (select count(*) from notifications where recipient_user_id = t.u(3) and event_key = 'platform.unusual_login' and channel = 'in_app'), 1::bigint);
select t.eq('p9c: the signed-in user is told too', (select count(*) from notifications where recipient_user_id = t.u(1) and event_key = 'platform.unusual_login' and channel = 'in_app'), 1::bigint);
select t.eq('p9c: support and billing get no alert', (select count(*) from notifications where recipient_user_id in (t.u(9), t.u(10)) and event_key = 'platform.unusual_login'), 0::bigint);
select t.eq('p9c: the notice links to the review page', (select link from notifications where recipient_user_id = t.u(3) and event_key = 'platform.unusual_login' limit 1), '/admin/security-review');
select t.eq('p9c: replaying the second device raises no second alert', t.as62(t.u(1), format($$select (public.record_platform_login(%L, 'Safari on iPhone'))::text$$, repeat('b', 64))), '{"alerted": 0, "new_device": false}');
select t.eq('p9c: still exactly one notice per super admin', (select count(*) from notifications where event_key = 'platform.unusual_login' and recipient_user_id = t.u(3)), 1::bigint);
select t.eq('p9c: a label is cleaned of markup characters', (select label from app_private.platform_login_devices where user_id = t.u(1) and device_hash = repeat('b', 64)), 'Safari on iPhone');
select t.as62(t.u(9), format($$select (public.record_platform_login(%L, '<b>Edge</b>'))::text$$, repeat('c', 64)));
select t.eq('p9c: support first device recorded, markup stripped', (select label from app_private.platform_login_devices where user_id = t.u(9)), 'bEdgeb');
select t.eq('p9c: support second device alerts the super admins', t.as62(t.u(9), format($$select (public.record_platform_login(%L, 'Firefox'))::text$$, repeat('d', 64))), '{"alerted": 2, "new_device": true}');

-- C. review ---------------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select public.platform_enter_acting(t.u(101), 'p9c review test');
select t.as_admin();
select t.eq('p9c: list works for super_admin (as caller)', (t.as62(t.u(3), $$select jsonb_array_length(public.platform_security_review(7, false)->'items')::text$$))::int >= 3, true);
select t.eq('p9c: own entries cannot be reviewed (can_review false)',
  t.as62(t.u(1), $$select (select bool_or((x->>'can_review')::boolean) from jsonb_array_elements(public.platform_security_review(7, false)->'items') x where x->>'actor_id' = '00000000-0000-4000-8000-000000000001')::text$$), 'false');
select t.eq('p9c: another super admin can review them',
  t.as62(t.u(3), $$select (select bool_and((x->>'can_review')::boolean) from jsonb_array_elements(public.platform_security_review(7, false)->'items') x where x->>'actor_id' = '00000000-0000-4000-8000-000000000001')::text$$), 'true');
create temp table t62_e as select id from audit_logs where action = 'acting.started' and actor_id = t.u(1) order by created_at desc limit 1;
grant select on t62_e to authenticated;
select t.eq('p9c: reviewing your own action is refused', t.e62(t.u(1), format($$select public.platform_review_audit_entry(%L, 'self')$$, (select id from t62_e))) like '42501%', true);
select t.eq('p9c: support cannot review', t.e62(t.u(9), format($$select public.platform_review_audit_entry(%L, null)$$, (select id from t62_e))) like '42501%', true);
select t.eq('p9c: an unknown entry is refused', t.e62(t.u(3), $$select public.platform_review_audit_entry(gen_random_uuid(), null)$$) like 'P0002%', true);
select t.eq('p9c: a non-reviewable entry is refused', t.e62(t.u(3), format($$select public.platform_review_audit_entry(%L, null)$$, (select id from audit_logs where action = 'platform.login_first_device' limit 1))) like 'P0002%', true);
select t.eq('p9c: a too-long note is refused', t.e62(t.u(3), format($$select public.platform_review_audit_entry(%L, %L)$$, (select id from t62_e), repeat('n', 301))) like '22023%', true);
select t.eq('p9c: the other super admin reviews it', t.e62(t.u(3), format($$select public.platform_review_audit_entry(%L, 'ticket 4411 confirmed')$$, (select id from t62_e))), 'NO ERROR');
select t.eq('p9c: review is stored with the reviewer and note', (select reviewed_by::text || '|' || note from app_private.audit_reviews where audit_id = (select id from t62_e)), t.u(3)::text || '|ticket 4411 confirmed');
select t.eq('p9c: reviewing twice is harmless', t.e62(t.u(3), format($$select public.platform_review_audit_entry(%L, 'again')$$, (select id from t62_e))), 'NO ERROR');
select t.eq('p9c: the second review did not overwrite the first', (select note from app_private.audit_reviews where audit_id = (select id from t62_e)), 'ticket 4411 confirmed');
select t.eq('p9c: the review is audited exactly once', (select count(*) from audit_logs where action = 'platform.entry_reviewed' and entity_id = (select id from t62_e)), 1::bigint);
select t.eq('p9c: reviewed entry is excluded from the unreviewed filter',
  t.as62(t.u(3), format($$select (select count(*) from jsonb_array_elements(public.platform_security_review(7, true)->'items') x where x->>'id' = %L)::text$$, (select id from t62_e))), '0');
select t.eq('p9c: days is clamped (0 and 9999 still work)', t.e62(t.u(3), $$select public.platform_security_review(0, false), public.platform_security_review(9999, false)$$), 'NO ERROR');

-- cleanup: demote the second super admin; end the acting session
select t.as_user(t.u(1));
select public.platform_exit_acting();
select t.as_admin();
delete from platform_users where user_id = t.u(3);
