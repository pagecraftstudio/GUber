-- 61: my_context() and acting sessions (migration 0066). Needs 01 fixtures (A=101, B=102; users 1 super_admin, 9 support, 2 ownerA) and the 0065 RPCs.
select t.as_admin();
create or replace function t.err61(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;

select t.as_user(t.u(1));
select t.eq('before: staff context has no membership and no acting', (select (my_context() -> 'membership')::text || '/' || (my_context() -> 'acting')::text), 'null/null');
select t.passes('enter A', format($q$select public.platform_enter_acting(%L, 'ctx check')$q$, t.u(101)));
select t.eq('acting: membership is company A', (select (my_context() -> 'membership' ->> 'company_id')::uuid), t.u(101));
select t.eq('acting: role key says platform_acting', (select my_context() -> 'membership' ->> 'role_key'), 'platform_acting');
select t.eq('acting: mode is read', (select my_context() -> 'acting' ->> 'mode'), 'read');
select t.eq('read: has trips.read', (select my_context() -> 'membership' -> 'permissions' ? 'trips.read'), true);
select t.eq('read: has no trips.write', (select my_context() -> 'membership' -> 'permissions' ? 'trips.write'), false);
select t.eq('platform role is still reported', (select my_context() ->> 'platform_role'), 'super_admin');
select t.passes('confirm write', $$select public.platform_confirm_acting_write()$$);
select t.eq('write: acting mode is write', (select my_context() -> 'acting' ->> 'mode'), 'write');
select t.eq('write: has trips.write', (select my_context() -> 'membership' -> 'permissions' ? 'trips.write'), true);
select t.eq('write: still no users.write / domains.write / website.publish', (select (my_context() -> 'membership' -> 'permissions') ?| array['users.write', 'domains.write', 'website.publish']), false);
select t.eq('the permission list is exactly what has_permission would grant', (select count(*) from jsonb_array_elements_text(my_context() -> 'membership' -> 'permissions')),
  (select count(*) from permissions pm where pm.key like '%.read' and pm.key <> 'trips.read_assigned' or pm.key like '%.write' and pm.key not in ('users.write', 'domains.write')));

select t.as_user(t.u(2));
select t.eq('an owner is untouched: still company A as owner, no acting', (select (my_context() -> 'membership' ->> 'role_key') || '/' || coalesce((my_context() -> 'acting')::text, 'x')), 'owner/null');
select t.as_user(t.u(9));
select t.eq('another staff member does not inherit the session', (select (my_context() -> 'membership')::text || '/' || (my_context() -> 'acting')::text), 'null/null');

select t.as_user(t.u(1));
select t.passes('exit', $$select public.platform_exit_acting()$$);
select t.eq('after exit: no membership, no acting', (select (my_context() -> 'membership')::text || '/' || (my_context() -> 'acting')::text), 'null/null');
select t.as_admin();
select t.passes('enter again', format($q$select 1 where false$q$));
update app_private.acting_sessions set expires_at = now() where user_id = t.u(1);
select t.eq('no session row left over', (select count(*) from app_private.acting_sessions), 0::bigint);
