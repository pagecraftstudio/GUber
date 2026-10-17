-- 0007: Phase 3 auth RPCs. my_context, invites (create / revoke / preview / accept).
-- Rules (same as 0006): tenant is derived from auth.uid() -> company_users. A client-supplied company id
-- is only honoured for platform super_admin; for everyone else it is ignored or must match membership.
-- No client has direct write access to company_invites / company_users (decision D2). These RPCs are the only path.
set search_path = public, extensions;

-- ======================= helpers (private) =======================
create or replace function app_private.hash_invite_token(p_token text) returns text
language sql immutable security definer set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'utf8')), 'hex')
$$;
revoke all on function app_private.hash_invite_token(text) from public, anon, authenticated;

-- ======================= my_context =======================
-- One round trip for the app: who am I, platform role, company membership, effective permissions.
-- Suspended/cancelled company => membership returned (so UI can show "suspended") but permissions = [].
create or replace function public.my_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_member record;
  v_perms jsonb := '[]'::jsonb;
  v_membership jsonb := null;
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
      'locale', v_profile.locale, 'is_active', false, 'platform_role', null, 'membership', null);
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
    'membership', v_membership);
end $$;
revoke all on function public.my_context() from public, anon;
grant execute on function public.my_context() to authenticated;

-- ======================= create_invite =======================
-- Returns the RAW token exactly once. Only its sha256 is stored.
-- Company resolution: super_admin must pass p_company_id; everyone else is pinned to their own company
-- (a different p_company_id is rejected, never trusted). Requires users.write (owner) in that company.
create or replace function public.create_invite(p_email text, p_role_key text, p_company_id uuid default null)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_company uuid;
  v_role uuid;
  v_token text;
  v_id uuid;
  v_exp timestamptz := now() + interval '7 days';
  v_actor text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  if app_private.platform_role() = 'super_admin' then
    if p_company_id is null then raise exception 'company required' using errcode = '22023'; end if;
    v_company := p_company_id;
    v_actor := 'platform_user';
  else
    select cu.company_id into v_company from public.company_users cu where cu.user_id = v_uid and cu.status = 'active';
    if v_company is null then raise exception 'forbidden' using errcode = '42501'; end if;
    if p_company_id is not null and p_company_id <> v_company then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not app_private.has_permission(v_company, 'users.write') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    v_actor := 'company_user';
  end if;

  if not app_private.is_company_active(v_company) then
    raise exception 'company not active' using errcode = '42501';
  end if;

  select r.id into v_role from public.roles r where r.key = p_role_key;
  if v_role is null then raise exception 'unknown role' using errcode = '22023'; end if;

  if exists (select 1 from public.profiles p join public.company_users cu on cu.user_id = p.id
             where p.email = v_email::extensions.citext) then
    raise exception 'user already belongs to a company' using errcode = '23505';
  end if;

  -- free the partial-unique slot held by lapsed invites
  update public.company_invites ci set status = 'expired'
   where ci.company_id = v_company and ci.email = v_email::extensions.citext and ci.status = 'pending' and ci.expires_at <= now();

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 244 random bits
  insert into public.company_invites (company_id, email, role_id, token_hash, expires_at, invited_by)
  values (v_company, v_email::extensions.citext, v_role, app_private.hash_invite_token(v_token), v_exp, v_uid)
  returning id into v_id;     -- pending duplicate => 23505 from the partial unique index

  perform app_private.write_audit(v_actor, v_company, 'invite.created', 'company_invite', v_id,
                                  jsonb_build_object('role', p_role_key));
  return query select v_id, v_token, v_exp;
end $$;
revoke all on function public.create_invite(text, text, uuid) from public, anon;
grant execute on function public.create_invite(text, text, uuid) to authenticated;

-- ======================= revoke_invite =======================
create or replace function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_actor text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select ci.company_id into v_company from public.company_invites ci where ci.id = p_invite_id;

  if v_company is null then raise exception 'forbidden' using errcode = '42501'; end if;   -- same error as no-permission: no oracle
  if app_private.platform_role() = 'super_admin' then
    v_actor := 'platform_user';
  elsif app_private.has_permission(v_company, 'users.write') then
    v_actor := 'company_user';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.company_invites set status = 'revoked' where id = p_invite_id and status = 'pending';
  if found then
    perform app_private.write_audit(v_actor, v_company, 'invite.revoked', 'company_invite', p_invite_id);
  end if;
end $$;
revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ======================= preview_invite =======================
-- For the invite landing page (callable before sign-in). Knowing the token is the credential.
-- Returns nothing for unknown / used / revoked / expired tokens (no way to tell them apart).
create or replace function public.preview_invite(p_token text)
returns table (company_name text, role_name text, email text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.name, r.name, ci.email::text, ci.expires_at
  from public.company_invites ci
  join public.companies c on c.id = ci.company_id
  join public.roles r on r.id = ci.role_id
  where ci.token_hash = app_private.hash_invite_token(coalesce(p_token, ''))
    and ci.status = 'pending' and ci.expires_at > now()
    and c.deleted_at is null and c.status in ('trial', 'active')
$$;
revoke all on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;

-- ======================= accept_invite =======================
-- Checks, in one transaction: token valid + pending + unexpired, caller's auth email == invited email AND
-- confirmed, profile active, company active. Then creates the membership (plan-limit + one-company triggers fire).
-- All failures of the token/email checks use one message so a caller cannot probe which check failed.
create or replace function public.accept_invite(p_token text)
returns table (company_id uuid, role_key text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv record;
  v_ok boolean := false;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select ci.id, ci.company_id, ci.email, ci.role_id, ci.invited_by into v_inv
    from public.company_invites ci
   where ci.token_hash = app_private.hash_invite_token(coalesce(p_token, ''))
     and ci.status = 'pending' and ci.expires_at > now()
   for update;

  if found then
    select true into v_ok
      from auth.users u join public.profiles p on p.id = u.id
      join public.companies c on c.id = v_inv.company_id
     where u.id = v_uid
       and lower(u.email) = lower(v_inv.email::text)
       and u.email_confirmed_at is not null
       and p.is_active
       and c.deleted_at is null and c.status in ('trial', 'active');
  end if;

  if not coalesce(v_ok, false) then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  begin
    insert into public.company_users (company_id, user_id, role_id, invited_by)
    values (v_inv.company_id, v_uid, v_inv.role_id, v_inv.invited_by);
  exception when unique_violation then
    raise exception 'already_member' using errcode = '23505';
  end;

  update public.company_invites set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  perform app_private.write_audit('company_user', v_inv.company_id, 'invite.accepted', 'company_invite', v_inv.id);

  return query select v_inv.company_id, (select r.key from public.roles r where r.id = v_inv.role_id);
end $$;
revoke all on function public.accept_invite(text) from public, anon;
grant execute on function public.accept_invite(text) to authenticated;
