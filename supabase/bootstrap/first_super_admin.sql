-- ONE-TIME bootstrap of the first MALAKY platform user. Run in the Supabase SQL editor (runs as postgres).
-- 1) Supabase Dashboard -> Authentication -> Users -> "Add user" -> create it with "Auto Confirm User" ticked.
--    (The handle_new_user trigger creates the profile row automatically.)
-- 2) Replace the email below and run this script.
-- There is deliberately NO API/RPC that grants platform roles: only this SQL path (or a later audited admin tool).
insert into public.platform_users (user_id, role)
select id, 'super_admin' from auth.users where email = 'REPLACE_WITH_YOUR_EMAIL'
on conflict (user_id) do update set role = 'super_admin', is_active = true;

-- Verify: must return exactly one row.
select pu.user_id, p.email, pu.role, pu.is_active
from public.platform_users pu join public.profiles p on p.id = pu.user_id
where p.email = 'REPLACE_WITH_YOUR_EMAIL';
