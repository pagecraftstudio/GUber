-- 0026: keep Team (company_users, role 'driver') and Drivers (drivers) in sync.
--
-- PROBLEM
--   A driver existed in two unrelated places. Inviting someone with role 'driver' on the Team page created a login but no
--   driver record; adding a driver on the Drivers page created a record but no login. drivers.user_id (0003) was never
--   filled, so a driver who signed in also could not see "my trips" (RLS finds them through drivers.user_id).
--
-- RULE (enforced here, in the database)
--   * A driver LOGIN always belongs to a driver RECORD. A 'driver' invite must carry the record it is for
--     (company_invites.driver_id). Accepting the invite links drivers.user_id to the new member in the same transaction.
--   * invite_driver(driver, email): the only way to create a driver invite (needs users.write, i.e. owner in the seed).
--   * link_driver_login(driver, member): attach an EXISTING member to an EXISTING driver record (repairs data created
--     before this migration). Needs users.write AND drivers.write. If the member is not a driver yet it is made one.
--   * Members and records stay in step: leaving the driver role unlinks the record and marks it inactive; suspending the
--     member marks the record inactive; reactivating restores it. Changing someone TO the driver role without a linked
--     record is refused (use link_driver_login / invite_driver).
--   * Nothing here widens a grant. All functions: SECURITY DEFINER, search_path = '', EXECUTE authenticated only. The
--     company is always derived from auth.uid() -> company_users; driver and member ids are TARGETS that must belong to it
--     (otherwise the same "not found" answer as for an unknown id).
--
-- NOT DONE AUTOMATICALLY: existing driver-role members are not matched to existing records (no safe key: a driver record
-- phone and a login email never have to agree). The owner links them once with link_driver_login (Drivers page).
--
-- ROLLBACK
--   drop trigger if exists driver_invite_needs_record on public.company_invites;
--   drop trigger if exists link_driver_on_member_insert on public.company_users;
--   drop trigger if exists keep_driver_in_step on public.company_users;
--   drop function if exists app_private.driver_invite_needs_record(), app_private.link_driver_on_member_insert(),
--     app_private.keep_driver_in_step(), public.invite_driver(uuid, text), public.link_driver_login(uuid, uuid);
--   drop index if exists public.company_invites_driver_pending_uq;
--   alter table public.company_invites drop constraint company_invites_driver_fk, drop column driver_id;

alter table public.company_invites add column driver_id uuid;
alter table public.company_invites add constraint company_invites_driver_fk
  foreign key (company_id, driver_id) references public.drivers (company_id, id) on delete restrict;
create unique index company_invites_driver_pending_uq on public.company_invites (company_id, driver_id)
  where status = 'pending' and driver_id is not null;
create index company_invites_driver_idx on public.company_invites (company_id, driver_id) where driver_id is not null;

-- ---------- a driver invite must name its driver record ----------
create or replace function app_private.driver_invite_needs_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_driver_role uuid;
begin
  select id into v_driver_role from public.roles where key = 'driver';
  if new.role_id = v_driver_role and new.driver_id is null then
    raise exception 'driver invite needs a driver record' using errcode = '23514'; end if;
  if new.role_id <> v_driver_role and new.driver_id is not null then
    raise exception 'driver record only on a driver invite' using errcode = '23514'; end if;
  return new;
end $$;
create trigger driver_invite_needs_record before insert on public.company_invites
  for each row execute function app_private.driver_invite_needs_record();

-- ---------- accepting links the record ----------
create or replace function app_private.link_driver_on_member_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_driver_role uuid; v_driver uuid; v_n int;
begin
  select id into v_driver_role from public.roles where key = 'driver';
  if new.role_id <> v_driver_role then return new; end if;
  -- accept_invite inserts the member BEFORE it marks the invite accepted, so the invite is still pending here
  select ci.driver_id into v_driver
    from public.company_invites ci join public.profiles p on p.email = ci.email
   where ci.company_id = new.company_id and p.id = new.user_id and ci.status = 'pending'
     and ci.driver_id is not null
   order by ci.created_at desc limit 1;
  -- no pending driver invite = a member created another way (platform tooling, pre-0026 data): nothing to link.
  -- Every invite-based path has one, because driver_invite_needs_record refuses a driver invite without a record.
  if v_driver is null then return new; end if;
  update public.drivers set user_id = new.user_id, status = 'active'
   where id = v_driver and company_id = new.company_id and user_id is null;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'driver record unavailable' using errcode = '23514'; end if;
  return new;
end $$;
create trigger link_driver_on_member_insert after insert on public.company_users
  for each row execute function app_private.link_driver_on_member_insert();

-- ---------- role / status changes keep the record in step ----------
create or replace function app_private.keep_driver_in_step() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_driver_role uuid;
begin
  select id into v_driver_role from public.roles where key = 'driver';
  if old.role_id = v_driver_role and new.role_id <> v_driver_role then
    update public.drivers set user_id = null, status = 'inactive' where company_id = old.company_id and user_id = old.user_id;
  elsif new.role_id = v_driver_role and old.role_id <> v_driver_role then
    if not exists (select 1 from public.drivers d where d.company_id = new.company_id and d.user_id = new.user_id) then
      raise exception 'driver role needs a driver record' using errcode = '23514'; end if;
  elsif new.role_id = v_driver_role and new.status <> old.status then
    update public.drivers set status = case when new.status = 'active' then 'active' else 'inactive' end
     where company_id = new.company_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger keep_driver_in_step after update of role_id, status on public.company_users
  for each row execute function app_private.keep_driver_in_step();

-- ---------- invite_driver ----------
create or replace function public.invite_driver(p_driver_id uuid, p_email text)
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
  d public.drivers%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'invalid email' using errcode = '22023'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.user_id = v_uid and cu.status = 'active';
  if v_company is null or not app_private.has_permission(v_company, 'users.write')
     or not app_private.has_permission(v_company, 'drivers.read') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.drivers x where x.id = p_driver_id and x.company_id = v_company for update;
  if not found then raise exception 'driver not found' using errcode = 'P0002'; end if;
  if d.user_id is not null then raise exception 'driver already has a login' using errcode = '23514'; end if;
  if d.status <> 'active' then raise exception 'driver is inactive' using errcode = '23514'; end if;
  if exists (select 1 from public.profiles p join public.company_users cu on cu.user_id = p.id
             where p.email = v_email::extensions.citext) then
    raise exception 'user already belongs to a company' using errcode = '23505'; end if;
  select r.id into v_role from public.roles r where r.key = 'driver';

  update public.company_invites ci set status = 'expired'
   where ci.company_id = v_company and ci.status = 'pending' and ci.expires_at <= now()
     and (ci.driver_id = p_driver_id or ci.email = v_email::extensions.citext);
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.company_invites (company_id, email, role_id, token_hash, expires_at, invited_by, driver_id)
  values (v_company, v_email::extensions.citext, v_role, app_private.hash_invite_token(v_token), v_exp, v_uid, p_driver_id)
  returning id into v_id;   -- pending invite for the same driver or email => 23505 from the partial unique indexes
  perform app_private.write_audit('company_user', v_company, 'invite.created', 'company_invite', v_id,
                                  jsonb_build_object('role', 'driver', 'driver_id', p_driver_id));
  return query select v_id, v_token, v_exp;
end $$;
revoke all on function public.invite_driver(uuid, text) from public, anon;
grant execute on function public.invite_driver(uuid, text) to authenticated;

-- ---------- link_driver_login ----------
create or replace function public.link_driver_login(p_driver_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role uuid;
  d public.drivers%rowtype;
  m public.company_users%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.user_id = v_uid and cu.status = 'active';
  if v_company is null or not app_private.has_permission(v_company, 'users.write')
     or not app_private.has_permission(v_company, 'drivers.write') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.drivers x where x.id = p_driver_id and x.company_id = v_company for update;
  if not found then raise exception 'driver not found' using errcode = 'P0002'; end if;
  select * into m from public.company_users x where x.id = p_member_id and x.company_id = v_company for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if d.user_id is not null then raise exception 'driver already has a login' using errcode = '23514'; end if;
  if exists (select 1 from public.drivers x where x.company_id = v_company and x.user_id = m.user_id) then
    raise exception 'member already linked to a driver' using errcode = '23514'; end if;
  if exists (select 1 from public.roles r join public.company_users x on x.role_id = r.id
              where x.id = m.id and r.key = 'owner') then
    raise exception 'owner cannot be a driver login' using errcode = '23514'; end if;
  select r.id into v_role from public.roles r where r.key = 'driver';

  update public.drivers set user_id = m.user_id, status = case when m.status = 'active' then 'active' else 'inactive' end
   where id = d.id and company_id = v_company;
  if m.role_id <> v_role then
    update public.company_users set role_id = v_role where id = m.id and company_id = v_company;   -- keep_one_owner / step triggers judge
  end if;
  perform app_private.write_audit('company_user', v_company, 'driver.linked', 'driver', d.id,
    jsonb_build_object('member_id', m.id));
  return jsonb_build_object('driver_id', d.id, 'member_id', m.id);
end $$;
revoke all on function public.link_driver_login(uuid, uuid) from public, anon;
grant execute on function public.link_driver_login(uuid, uuid) to authenticated;
