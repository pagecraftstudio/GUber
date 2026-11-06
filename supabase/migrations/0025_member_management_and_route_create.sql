-- 0025: M2 completion - company user management RPCs and atomic route creation.
--
-- WHY
--   * /dashboard/users must change a member's role and deactivate / reactivate a member. company_users has NO client write
--     path (0006: writes only via RPC, which is what stops a manager promoting themselves). These two RPCs are the only
--     paths, and they authorise from auth.uid() -> company_users, never from a parameter.
--   * Route creation was two calls (route, then stops): a failed stop save left a route without stops. create_route_with_stops
--     does both in ONE transaction; any failure rolls the route back too.
--
-- SECURITY
--   * SECURITY DEFINER, search_path = ''. EXECUTE: authenticated only.
--   * set_member_role / set_member_status: caller needs users.write in THEIR company (owner only in the seed; the manager
--     role deliberately lacks it). The member id is a TARGET: it must belong to the caller's company, otherwise P0002 (same
--     answer as unknown). A caller cannot change their OWN role or status (no self-lockout, no self-promotion).
--   * The existing keep_one_owner trigger (0004) still guarantees at least one active owner per company.
--   * Platform staff are not tenant members and cannot call these (they use the admin RPCs).
--   * create_route_with_stops: company is derived from the caller's membership; routes.write required; the plan limit
--     trigger (max_routes) fires on the route insert exactly as before.
--
-- ROLLBACK
--   drop function if exists public.set_member_role(uuid, text);
--   drop function if exists public.set_member_status(uuid, text);
--   drop function if exists public.create_route_with_stops(text, text, text, text, text, jsonb);

create or replace function public.set_member_role(p_member_id uuid, p_role_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_role uuid;
  m public.company_users%rowtype;
  v_old text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.id = p_member_id;
  if v_company is null or not app_private.has_permission(v_company, 'users.write') then
    raise exception 'member not found' using errcode = 'P0002'; end if;
  select * into m from public.company_users cu where cu.id = p_member_id and cu.company_id = v_company for update;
  if m.user_id = v_uid then raise exception 'cannot change your own role' using errcode = '23514'; end if;
  select r.id into v_role from public.roles r where r.key = p_role_key;
  if v_role is null then raise exception 'unknown role' using errcode = '22023'; end if;
  select r.key into v_old from public.roles r where r.id = m.role_id;
  if m.role_id = v_role then
    return jsonb_build_object('id', m.id, 'role', p_role_key, 'changed', false);
  end if;
  update public.company_users set role_id = v_role where id = m.id and company_id = v_company;   -- keep_one_owner trigger judges
  perform app_private.write_audit('company_user', v_company, 'member.role_changed', 'company_user', m.id,
    jsonb_build_object('from', v_old, 'to', p_role_key));
  return jsonb_build_object('id', m.id, 'role', p_role_key, 'changed', true);
end $$;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;

create or replace function public.set_member_status(p_member_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  m public.company_users%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'invalid member status' using errcode = '22023'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.id = p_member_id;
  if v_company is null or not app_private.has_permission(v_company, 'users.write') then
    raise exception 'member not found' using errcode = 'P0002'; end if;
  select * into m from public.company_users cu where cu.id = p_member_id and cu.company_id = v_company for update;
  if m.user_id = v_uid then raise exception 'cannot change your own status' using errcode = '23514'; end if;
  if m.status = p_status then
    return jsonb_build_object('id', m.id, 'status', p_status, 'changed', false);
  end if;
  update public.company_users set status = p_status where id = m.id and company_id = v_company;   -- keep_one_owner trigger judges
  perform app_private.write_audit('company_user', v_company, 'member.status_changed', 'company_user', m.id,
    jsonb_build_object('from', m.status, 'to', p_status));
  return jsonb_build_object('id', m.id, 'status', p_status, 'changed', true);
end $$;
revoke all on function public.set_member_status(uuid, text) from public, anon;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- ======================= atomic route + stops =======================
create or replace function public.create_route_with_stops(
  p_name text, p_code text, p_origin text, p_destination text, p_description text, p_stops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_route uuid;
  v_saved jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select cu.company_id into v_company from public.company_users cu where cu.user_id = v_uid and cu.status = 'active' limit 1;
  if v_company is null or not app_private.has_permission(v_company, 'routes.write') then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120
     or char_length(btrim(coalesce(p_origin, ''))) not between 1 and 120
     or char_length(btrim(coalesce(p_destination, ''))) not between 1 and 120
     or char_length(coalesce(p_code, '')) > 20 or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'invalid route' using errcode = '22023'; end if;

  insert into public.routes (company_id, name, code, origin_name, destination_name, description)
  values (v_company, btrim(p_name), nullif(btrim(coalesce(p_code, '')), ''), btrim(p_origin), btrim(p_destination),
          nullif(btrim(coalesce(p_description, '')), ''))
  returning id into v_route;                      -- max_routes trigger (0004) fires here

  v_saved := public.save_route_stops(v_route, p_stops);   -- validates; raises => the route insert rolls back too
  return jsonb_build_object('route_id', v_route, 'stops', v_saved -> 'count');
end $$;
revoke all on function public.create_route_with_stops(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.create_route_with_stops(text, text, text, text, text, jsonb) to authenticated;
