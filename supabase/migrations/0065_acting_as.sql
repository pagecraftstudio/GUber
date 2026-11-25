-- 0065: super admin "acting as" a company (P9 slice A, decision D5: no 2FA, so the mitigations here are required).
-- DESIGN: the session lives in the DATABASE, keyed by auth.uid(), not in a cookie. Nothing in the browser names the company, so there is nothing to forge or replay.
--   * app_private.acting_sessions: one row per platform user. Created only by platform_enter_acting (super_admin or support, with a written reason), 30 minutes hard
--     (never extended), READ by default. platform_confirm_acting_write (super_admin only, company must be trial/active) switches it to WRITE for the rest of the session.
--   * The platform role is re-checked on EVERY use, so removing or deactivating the staff user ends the session at once. support can never write. billing cannot act.
--   * has_permission / current_company_ids honour the session through ONE helper (acting_allows). Read mode: only '*.read' keys. Write mode (super_admin, active company):
--     '*.write' keys except users.write, domains.write; website.publish is not granted. Suspended and cancelled companies are readable, never writable.
--   * write_audit records actor 'platform_user' with acting_as metadata whenever a session is acting on that company, so existing company audit rows are attributed correctly.
--   * No hard delete: delete_draft_trip refuses while acting. Start, write-enable and end are audited (acting.started / acting.write_enabled / acting.ended).
-- KNOWN GAPS (stated, not hidden): RPCs that never audit stay unaudited while acting (create_route_with_stops, scan_route_subscription, begin_domain_check, ensure_starter_site).
-- ROLLBACK: restore has_permission, current_company_ids, write_audit, delete_draft_trip from 0006 / their latest migrations; drop the four platform_*_acting* functions,
--           app_private.acting_* helpers and app_private.acting_sessions.
-- RUNNER NOTE: apply before deploying code that calls the new RPCs.
set search_path = public, extensions;

create table app_private.acting_sessions (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  company_id       uuid not null references public.companies (id) on delete cascade,
  mode             text not null default 'read' check (mode in ('read', 'write')),
  reason           text not null check (char_length(btrim(reason)) between 3 and 300),
  started_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  write_enabled_at timestamptz,
  constraint acting_sessions_window check (expires_at > started_at),
  constraint acting_sessions_write_pair check ((mode = 'write') = (write_enabled_at is not null))
);
alter table app_private.acting_sessions enable row level security;
revoke all on app_private.acting_sessions from public, anon, authenticated;

-- the live session of the caller, only while the caller is still active platform staff allowed to act
create or replace function app_private.acting_company() returns uuid language sql stable security definer set search_path = '' as $$
  select s.company_id from app_private.acting_sessions s
   where s.user_id = auth.uid() and s.expires_at > now()
     and app_private.platform_role() in ('super_admin', 'support')
     and exists (select 1 from public.companies c where c.id = s.company_id and c.deleted_at is null)
$$;
revoke all on function app_private.acting_company() from public, anon, authenticated;

-- THE rule of what acting grants. Everything else (has_permission, current_company_ids) only asks this.
create or replace function app_private.acting_allows(p_company uuid, p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from app_private.acting_sessions s
      join public.companies c on c.id = s.company_id and c.deleted_at is null
     where s.user_id = auth.uid() and s.company_id = p_company and s.expires_at > now()
       and app_private.platform_role() in ('super_admin', 'support')
       and (
         p_key like '%.read'
         or (s.mode = 'write' and app_private.platform_role() = 'super_admin' and c.status in ('trial', 'active')
             and p_key like '%.write' and p_key not in ('users.write', 'domains.write'))
       ))
$$;
revoke all on function app_private.acting_allows(uuid, text) from public, anon, authenticated;

create or replace function app_private.has_permission(p_company uuid, p_key text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.company_users cu
    join public.profiles p on p.id = cu.user_id and p.is_active
    join public.companies c on c.id = cu.company_id and c.deleted_at is null and c.status in ('trial','active')
    join public.role_permissions rp on rp.role_id = cu.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where cu.user_id = auth.uid() and cu.company_id = p_company and cu.status = 'active' and pm.key = p_key)
  or app_private.acting_allows(p_company, p_key)
$$;

create or replace function app_private.current_company_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select cu.company_id
  from public.company_users cu
  join public.profiles p on p.id = cu.user_id and p.is_active
  join public.companies c on c.id = cu.company_id and c.deleted_at is null and c.status in ('trial','active')
  where cu.user_id = auth.uid() and cu.status = 'active'
  union
  select app_private.acting_company() where app_private.acting_company() is not null
$$;

-- an acting session turns "company_user" audit rows into platform_user rows, with the mode, so a reviewer can always tell who really acted
create or replace function app_private.write_audit(p_actor_type text, p_company uuid, p_action text, p_entity_type text, p_entity_id uuid default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_type text := p_actor_type; v_meta jsonb := coalesce(p_metadata, '{}'::jsonb); v_mode text;
begin
  if p_actor_type = 'company_user' and p_company is not null and auth.uid() is not null then
    select s.mode into v_mode from app_private.acting_sessions s
     where s.user_id = auth.uid() and s.company_id = p_company and s.expires_at > now() and app_private.platform_role() in ('super_admin', 'support');
    if found then v_type := 'platform_user'; v_meta := v_meta || jsonb_build_object('acting_as', true, 'acting_mode', v_mode); end if;
  end if;
  insert into public.audit_logs (actor_id, actor_type, company_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), v_type, p_company, p_action, p_entity_type, p_entity_id, v_meta);
end $$;

-- ---- no hard delete while acting: the one explicit delete RPC (copy of the live definition + one guard) ----
create or replace function public.delete_draft_trip(p_trip_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_company uuid; t public.trips%rowtype; v_returns int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select tr.company_id into v_company from public.trips tr where tr.id = p_trip_id;
  if v_company is null or not app_private.has_permission(v_company, 'trips.write') then
    raise exception 'trip not found' using errcode = 'P0002'; end if;
  if app_private.acting_company() is not distinct from v_company then
    raise exception 'deleting is not allowed while acting as a company' using errcode = '42501'; end if;
  select * into t from public.trips tr where tr.id = p_trip_id and tr.company_id = v_company for update;
  if not found then raise exception 'trip not found' using errcode = 'P0002'; end if;
  if t.status <> 'draft' then raise exception 'trip is not a draft' using errcode = '23514'; end if;
  if exists (select 1 from public.bookings b where b.trip_id = t.id) then
    raise exception 'trip has booking history' using errcode = '23514'; end if;
  if exists (select 1 from public.trips r where r.outbound_trip_id = t.id and r.company_id = v_company
              and (r.status <> 'draft' or exists (select 1 from public.bookings b where b.trip_id = r.id))) then
    raise exception 'a return trip is no longer a draft or has bookings' using errcode = '23514'; end if;
  delete from public.trips r where r.outbound_trip_id = t.id and r.company_id = v_company;
  get diagnostics v_returns = row_count;
  delete from public.trips where id = t.id;
  perform app_private.write_audit('company_user', v_company, 'trip.deleted', 'trip', t.id, jsonb_build_object('returns_deleted', v_returns));
  return jsonb_build_object('id', t.id, 'deleted', true);
end $$;

-- ---- the four RPCs the app calls ----
insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description)
select v.* from (values ('acting.enter', 3600, 20, 'platform_enter_acting per user per hour'), ('acting.read', 60, 120, 'platform_acting_status per user per minute')) as v(bucket, window_seconds, max_hits, description)
 where not exists (select 1 from app_private.rate_limit_policies p where p.bucket = v.bucket);

create or replace function public.platform_enter_acting(p_company_id uuid, p_reason text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_role text := app_private.platform_role(); v_exp timestamptz := now() + interval '30 minutes'; v_name text;
begin
  if auth.uid() is null or v_role is null or v_role not in ('super_admin', 'support') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 300 then raise exception 'a reason of 3 to 300 characters is required' using errcode = '22023'; end if;
  perform app_private.rate_limit_hit('acting.enter');
  select c.name into v_name from public.companies c where c.id = p_company_id and c.deleted_at is null;
  if not found then raise exception 'company not found' using errcode = 'P0002'; end if;
  insert into app_private.acting_sessions (user_id, company_id, mode, reason, started_at, expires_at, write_enabled_at)
  values (auth.uid(), p_company_id, 'read', btrim(p_reason), now(), v_exp, null)
  on conflict (user_id) do update set company_id = excluded.company_id, mode = 'read', reason = excluded.reason, started_at = excluded.started_at, expires_at = excluded.expires_at, write_enabled_at = null;
  perform app_private.write_audit('platform_user', p_company_id, 'acting.started', 'company', p_company_id, jsonb_build_object('reason', btrim(p_reason), 'role', v_role, 'expires_at', v_exp));
  return v_exp;
end $$;

-- a second, explicit confirmation per session before anything can be written; never extends the 30 minutes
create or replace function public.platform_confirm_acting_write() returns void
language plpgsql security definer set search_path = '' as $$
declare s app_private.acting_sessions%rowtype; v_status text;
begin
  if auth.uid() is null or app_private.platform_role() is distinct from 'super_admin' then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into s from app_private.acting_sessions x where x.user_id = auth.uid() and x.expires_at > now() for update;
  if not found then raise exception 'no active acting session' using errcode = 'P0002'; end if;
  select c.status into v_status from public.companies c where c.id = s.company_id and c.deleted_at is null;
  if v_status is null or v_status not in ('trial', 'active') then raise exception 'company is not active: it can be read but not changed' using errcode = '23514'; end if;
  if s.mode = 'write' then return; end if;
  update app_private.acting_sessions set mode = 'write', write_enabled_at = now() where user_id = s.user_id;
  perform app_private.write_audit('platform_user', s.company_id, 'acting.write_enabled', 'company', s.company_id, jsonb_build_object('expires_at', s.expires_at));
end $$;

create or replace function public.platform_exit_acting() returns void
language plpgsql security definer set search_path = '' as $$
declare s app_private.acting_sessions%rowtype;
begin
  if auth.uid() is null or app_private.platform_role() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from app_private.acting_sessions x where x.user_id = auth.uid() returning * into s;
  if found then perform app_private.write_audit('platform_user', s.company_id, 'acting.ended', 'company', s.company_id, jsonb_build_object('mode', s.mode, 'ran_out', s.expires_at <= now())); end if;
end $$;

create or replace function public.platform_acting_status() returns table (company_id uuid, company_name text, company_status text, mode text, started_at timestamptz, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or app_private.platform_role() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  perform app_private.rate_limit_hit('acting.read');
  return query
    select s.company_id, c.name::text, c.status::text, s.mode, s.started_at, s.expires_at
      from app_private.acting_sessions s join public.companies c on c.id = s.company_id
     where s.user_id = auth.uid() and s.expires_at > now() and app_private.platform_role() in ('super_admin', 'support');
end $$;

revoke all on function public.platform_enter_acting(uuid, text), public.platform_confirm_acting_write(), public.platform_exit_acting(), public.platform_acting_status() from public, anon;
grant execute on function public.platform_enter_acting(uuid, text), public.platform_confirm_acting_write(), public.platform_exit_acting(), public.platform_acting_status() to authenticated;
