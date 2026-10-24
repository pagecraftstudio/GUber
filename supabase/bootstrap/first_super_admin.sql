-- ONE-TIME bootstrap of the first MALAKY platform user (super_admin). Run in the Supabase SQL editor (runs as postgres).
--
-- BEFORE YOU RUN IT
--   1) Dashboard -> Authentication -> Users -> "Add user" -> create the account with "Auto Confirm User" ticked.
--      (The handle_new_user trigger creates the profile row automatically.)
--   2) Replace REPLACE_WITH_YOUR_EMAIL below (one place) and run the whole script.
--
-- WHAT IT GUARANTEES (it raises instead of guessing; nothing is changed when it raises)
--   * the e-mail must be a real, CONFIRMED Auth user that already has a profile (matched case-insensitively);
--   * it refuses if ANY other active super_admin already exists: this is a first-user bootstrap, not a promotion tool.
--     Later platform users are created by an existing super_admin, never by SQL;
--   * re-running it for the same, already-active super_admin is a harmless no-op;
--   * it writes one audit row (actor_type 'system', action 'platform.bootstrap_super_admin'), because every privileged
--     change must leave a trace. There is deliberately NO API/RPC that grants platform roles.
do $$
declare
  v_email constant text := lower(trim('REPLACE_WITH_YOUR_EMAIL'));
  v_user  auth.users%rowtype;
  v_role  text;
begin
  if v_email = 'replace_with_your_email' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Set a real e-mail address on the v_email line first.';
  end if;

  select * into v_user from auth.users where lower(email) = v_email;
  if not found then
    raise exception 'No Auth user with that e-mail. Create it first (Authentication -> Users -> Add user, Auto Confirm User ticked).';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception 'That Auth user is not confirmed. Recreate it with Auto Confirm User ticked, or confirm it in the dashboard.';
  end if;
  if not exists (select 1 from public.profiles where id = v_user.id) then
    raise exception 'The user has no profile row (handle_new_user trigger did not run). Check that migrations 0001-0007 are applied.';
  end if;

  select role into v_role from public.platform_users where user_id = v_user.id and is_active;
  if v_role = 'super_admin' then
    raise notice 'Already an active super_admin: nothing to do.';
    return;
  end if;
  if exists (select 1 from public.platform_users where role = 'super_admin' and is_active) then
    raise exception 'An active super_admin already exists. Do not use this script; sign in as that super_admin and manage platform users from the admin area.';
  end if;

  insert into public.platform_users (user_id, role) values (v_user.id, 'super_admin')
  on conflict (user_id) do update set role = 'super_admin', is_active = true;
  perform app_private.write_audit('system', null, 'platform.bootstrap_super_admin', 'platform_user', v_user.id,
                                  jsonb_build_object('method', 'sql_bootstrap'));
  raise notice 'super_admin created for the given e-mail. Sign in at /company/login.';
end $$;

-- Verify: must return exactly one row (role super_admin, is_active true).
select pu.user_id, p.email, pu.role, pu.is_active
from public.platform_users pu join public.profiles p on p.id = pu.user_id
where pu.role = 'super_admin' and pu.is_active;
