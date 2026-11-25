-- 0066: my_context() reports an active acting session (P9 slice B). The app builds its whole tenant context from this one RPC, so the dashboard
-- works for a platform user acting as a company WITHOUT any permission list being copied into app code: the permissions returned are exactly the keys
-- app_private.acting_allows (0065) grants right now (read keys in read mode, the allowed write keys in write mode, none a suspended company can be written with).
-- A real company membership is replaced by the acting one only while a session is live. Nothing else about my_context changes.
-- ROLLBACK: re-create my_context() from 0007 (the previous definition).
-- RUNNER NOTE: apply after 0065 and before deploying code that reads `acting`.
set search_path = public, extensions;

create or replace function public.my_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_member record;
  v_perms jsonb := '[]'::jsonb;
  v_membership jsonb := null;
  v_acting jsonb := null;
  s record;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id, p.email::text as email, p.full_name, p.locale, p.is_active
    into v_profile from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'profile missing' using errcode = '42501';
  end if;

  -- Deactivated profile: no platform role, no membership, no permissions.
  if not v_profile.is_active then
    return jsonb_build_object(
      'user_id', v_profile.id, 'email', v_profile.email, 'full_name', v_profile.full_name,
      'locale', v_profile.locale, 'is_active', false, 'platform_role', null, 'membership', null, 'acting', null);
  end if;

  -- a live acting session (platform staff only; acting_company() re-checks the role and the company) wins over any membership
  if app_private.acting_company() is not null then
    select x.company_id, x.mode, x.started_at, x.expires_at, c.name as company_name, c.slug::text as company_slug, c.status as company_status
      into s from app_private.acting_sessions x join public.companies c on c.id = x.company_id where x.user_id = v_uid;
    select coalesce(jsonb_agg(pm.key order by pm.key), '[]'::jsonb) into v_perms
      from public.permissions pm where app_private.acting_allows(s.company_id, pm.key);
    v_membership := jsonb_build_object(
      'company_id', s.company_id, 'company_name', s.company_name, 'company_slug', s.company_slug, 'company_status', s.company_status,
      'member_status', 'active', 'role_key', 'platform_acting', 'permissions', v_perms);
    v_acting := jsonb_build_object('mode', s.mode, 'started_at', s.started_at, 'expires_at', s.expires_at);
    return jsonb_build_object(
      'user_id', v_profile.id, 'email', v_profile.email, 'full_name', v_profile.full_name,
      'locale', v_profile.locale, 'is_active', true, 'platform_role', app_private.platform_role(),
      'membership', v_membership, 'acting', v_acting);
  end if;

  select cu.company_id, cu.status as member_status, r.key as role_key, r.id as role_id,
         c.name as company_name, c.slug::text as company_slug, c.status as company_status, c.deleted_at
    into v_member
    from public.company_users cu
    join public.roles r on r.id = cu.role_id
    join public.companies c on c.id = cu.company_id
   where cu.user_id = v_uid
   limit 1;

  if found then
    if v_member.deleted_at is null and v_member.member_status = 'active'
       and v_member.company_status in ('trial', 'active') then
      select coalesce(jsonb_agg(pm.key order by pm.key), '[]'::jsonb) into v_perms
        from public.role_permissions rp join public.permissions pm on pm.id = rp.permission_id
       where rp.role_id = v_member.role_id;
    end if;
    v_membership := jsonb_build_object(
      'company_id', v_member.company_id, 'company_name', v_member.company_name,
      'company_slug', v_member.company_slug,
      'company_status', case when v_member.deleted_at is not null then 'deleted' else v_member.company_status end,
      'member_status', v_member.member_status, 'role_key', v_member.role_key,
      'permissions', v_perms);
  end if;

  return jsonb_build_object(
    'user_id', v_profile.id, 'email', v_profile.email, 'full_name', v_profile.full_name,
    'locale', v_profile.locale, 'is_active', true,
    'platform_role', app_private.platform_role(),
    'membership', v_membership, 'acting', null);
end $$;
