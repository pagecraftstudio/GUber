-- 0059: staff accounts are password-only (P6b follow-up / "P6c" invite path).
-- Google sign-in is CUSTOMER-ONLY (src/app/auth/confirm/route.ts undoes a link on staff accounts). The remaining hole: a person signs in with
-- Google first (a customer), then accepts a staff invite for the same email, and ends up as staff with a Google identity.
-- accept_invite now refuses when the caller's auth account has any identity other than 'email'. Everything else is the 0007 definition.
-- The refusal uses the same P0001 'invalid_invite' as every other invite failure (no probing); it concerns the caller's own account only.
-- ROLLBACK: recreate public.accept_invite exactly as in 0007 (without the identities condition).
-- RUNNER NOTE: no code depends on it; apply any time.

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
       and c.deleted_at is null and c.status in ('trial', 'active')
       and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email');
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
