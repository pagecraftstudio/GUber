-- 0074: Continuous Shuttle, phase S1 - foundations and configuration (docs/plans/CONTINUOUS-SHUTTLE-PLAN.md, SHUTTLE-S0-AUDIT-ADDENDUM.md).
-- A shuttle is a parallel domain (shuttle_*). trips, bookings, tickets, boarding_events and route_subscription_scans are NOT touched.
--
-- WHAT THIS ADDS
--   1. Seven permission keys (shuttle.read|operate|confirm|assign|cash|config|drive) and their role grants (plan section 18).
--   2. Two entitlement keys: feature_shuttle_ops (boolean) and max_shuttle_vehicles (integer). Every existing plan is seeded
--      RESTRICTIVE (false / 0) because a missing plan_entitlements row already means "off" (0015, 0064). The super admin turns
--      the feature on per plan with admin_set_plan_entitlement. max_shuttle_vehicles is only a key here: ENFORCING it needs the
--      vehicle-session table (S2) and its own trigger.
--   3. Rate-limit buckets shuttle.request|decide|board|collect|depart (data rows, same table as 0020).
--   4. route_plans.model ('daily_pair' default | 'shuttle_pair'). Additive; every existing row and every existing RPC keeps daily_pair.
--   5. shuttle_services (one live shuttle service per route) and shuttle_fares (price per ordered station pair).
--   6. app_private.shuttle_enabled(company), a read RPC shuttle_is_enabled(company), and three write RPCs: shuttle_save_service,
--      shuttle_set_service_active, shuttle_save_fares.
--      Reads use the tenant RLS select policy. There are no client table writes.
--
-- DEVIATIONS FROM THE PLAN (all intended, all small)
--   * Fares and the hub are keyed by route_stops ids, not by positional index. An index would silently re-point every price when
--     the route is edited. S2 maps stop ids to indexes inside the operating-day snapshot.
--   * shuttle_events, is_my_shuttle_driver and the lock helpers are NOT created here. They need shuttle_operating_days and
--     shuttle_vehicle_sessions (S2). Creating them now would mean an events table nothing writes and columns without foreign keys.
--   * The "existing RPCs must reject shuttle_pair" rule is deferred to S6. Until then nothing can create a shuttle_pair plan:
--     route_plans has no client write grant and create_route_plan never sets model. S6 adds the guard together with the first RPC that can.
--
-- EXISTING OBJECTS CHANGED: route_plans (one column), permissions/role_permissions/entitlement_definitions/plan_entitlements/
--   rate_limit_policies (rows added). No function body, trigger or policy of an existing object is replaced.
-- ONE BEHAVIOURAL NOTE: a route stop that has a fare cannot be deleted (foreign key on delete restrict). Without a fare nothing changes.
--
-- ROLLBACK (only while no shuttle data matters):
--   drop function public.shuttle_is_enabled(uuid), public.shuttle_save_fares(uuid, jsonb), public.shuttle_set_service_active(uuid, boolean),
--     public.shuttle_save_service(uuid, text, text, boolean, integer, boolean, integer, uuid), app_private.shuttle_enabled(uuid),
--     app_private.shuttle_service_check(), app_private.shuttle_fare_check();
--   drop table public.shuttle_fares, public.shuttle_services;
--   alter table public.route_plans drop column model;
--   delete from app_private.rate_limit_policies where bucket in ('shuttle.request','shuttle.decide','shuttle.board','shuttle.collect','shuttle.depart');
--   delete from public.plan_entitlements where key in ('feature_shuttle_ops','max_shuttle_vehicles');
--   delete from public.entitlement_definitions where key in ('feature_shuttle_ops','max_shuttle_vehicles');
--   delete from public.role_permissions where permission_id in (select id from public.permissions where module = 'shuttle');
--   delete from public.permissions where module = 'shuttle';
-- RUNNER NOTE: apply before deploying any code that calls the shuttle RPCs.
set search_path = public, extensions;

-- ======================= 1. PERMISSIONS =======================
insert into public.permissions (key, module) values
  ('shuttle.read','shuttle'), ('shuttle.operate','shuttle'), ('shuttle.confirm','shuttle'), ('shuttle.assign','shuttle'),
  ('shuttle.cash','shuttle'), ('shuttle.config','shuttle'), ('shuttle.drive','shuttle');

-- grants as data (plan section 18). owner = every shuttle key; manager = all but drive; operations = run the day and swap vehicles;
-- booking = decide requests and take cash; driver = drive only (additionally bound to the current session by is_my_shuttle_driver in S2).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r join public.permissions p on p.module = 'shuttle'
join (values
  ('owner','shuttle.read'),('owner','shuttle.operate'),('owner','shuttle.confirm'),('owner','shuttle.assign'),('owner','shuttle.cash'),('owner','shuttle.config'),('owner','shuttle.drive'),
  ('manager','shuttle.read'),('manager','shuttle.operate'),('manager','shuttle.confirm'),('manager','shuttle.assign'),('manager','shuttle.cash'),('manager','shuttle.config'),
  ('operations','shuttle.read'),('operations','shuttle.operate'),('operations','shuttle.assign'),
  ('booking','shuttle.read'),('booking','shuttle.confirm'),('booking','shuttle.cash'),
  ('driver','shuttle.drive')
) g(role_key, perm_key) on g.role_key = r.key and g.perm_key = p.key;

-- ======================= 2. ENTITLEMENTS =======================
insert into public.entitlement_definitions (key, value_type, description) values
  ('feature_shuttle_ops', 'boolean', 'Continuous shuttle operations'),
  ('max_shuttle_vehicles', 'integer', 'Vehicles running in shuttle operations (enforced from S2)');

insert into public.plan_entitlements (plan_id, key, int_value, bool_value)
select p.id, d.key, case when d.value_type = 'integer' then 0 end, case when d.value_type = 'boolean' then false end
from public.plans p cross join public.entitlement_definitions d
where d.key in ('feature_shuttle_ops', 'max_shuttle_vehicles');

-- ======================= 3. RATE LIMITS =======================
insert into app_private.rate_limit_policies (bucket, window_seconds, max_hits, description) values
  ('shuttle.request', 600,   20,  'shuttle booking requests per customer per 10 minutes'),
  ('shuttle.request', 86400, 60,  'shuttle booking requests per customer per day'),
  ('shuttle.decide',  60,    120, 'shuttle confirm/reject per staff or driver per minute'),
  ('shuttle.board',   60,    180, 'shuttle scans per driver per minute (a full bus scans in well under a minute)'),
  ('shuttle.collect', 60,    120, 'shuttle cash entries per staff or driver per minute'),
  ('shuttle.depart',  60,    30,  'shuttle arrive/depart presses per driver per minute (double-press guard, not the idempotency key)');

-- ======================= 4. route_plans.model =======================
alter table public.route_plans
  add column model text not null default 'daily_pair' check (model in ('daily_pair', 'shuttle_pair'));

-- ======================= 5. TABLES =======================
create table public.shuttle_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  route_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  outbound_direction text not null default 'forward' check (outbound_direction in ('forward', 'backward')),
  allow_reverse boolean not null default true,
  request_ttl_minutes smallint not null default 20 check (request_ttl_minutes between 1 and 240),
  allow_walk_in boolean not null default true,
  max_seats_per_request smallint not null default 4 check (max_seats_per_request between 1 and 20),
  hub_stop_id uuid,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_services_route_fk foreign key (company_id, route_id) references public.routes(company_id, id) on delete restrict,
  constraint shuttle_services_hub_fk foreign key (company_id, hub_stop_id) references public.route_stops(company_id, id) on delete restrict
);
-- one LIVE service per route; deactivated rows stay as history
create unique index shuttle_services_one_live_per_route on public.shuttle_services (company_id, route_id) where is_active;
create index shuttle_services_hub_idx on public.shuttle_services (company_id, hub_stop_id) where hub_stop_id is not null;

create table public.shuttle_fares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  service_id uuid not null,
  from_stop_id uuid not null,
  to_stop_id uuid not null,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_fares_pair_uq unique (service_id, from_stop_id, to_stop_id),
  constraint shuttle_fares_distinct check (from_stop_id <> to_stop_id),
  constraint shuttle_fares_service_fk foreign key (company_id, service_id) references public.shuttle_services(company_id, id) on delete cascade,
  constraint shuttle_fares_from_fk foreign key (company_id, from_stop_id) references public.route_stops(company_id, id) on delete restrict,
  constraint shuttle_fares_to_fk foreign key (company_id, to_stop_id) references public.route_stops(company_id, id) on delete restrict
);
create index shuttle_fares_from_idx on public.shuttle_fares (company_id, from_stop_id);
create index shuttle_fares_to_idx on public.shuttle_fares (company_id, to_stop_id);

-- Same-route rules the composite foreign keys cannot express. Run as owner so they can read the route tables; the tenant guard fires first.
create function app_private.shuttle_service_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.routes r where r.id = new.route_id and r.company_id = new.company_id and r.deleted_at is null) then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if new.hub_stop_id is not null and not exists (
       select 1 from public.route_stops s where s.id = new.hub_stop_id and s.company_id = new.company_id and s.route_id = new.route_id) then
    raise exception 'hub stop does not belong to the route' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.route_id is distinct from old.route_id then
    raise exception 'shuttle service route cannot change' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_service_check() from public, anon, authenticated;

create function app_private.shuttle_fare_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_route uuid;
begin
  select sv.route_id into v_route from public.shuttle_services sv where sv.id = new.service_id and sv.company_id = new.company_id;
  if v_route is null or (select count(*) from public.route_stops s
       where s.company_id = new.company_id and s.route_id = v_route and s.id in (new.from_stop_id, new.to_stop_id)) <> 2 then
    raise exception 'fare stops must belong to the service route' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_fare_check() from public, anon, authenticated;

create trigger "000_tenant_guard" before insert or update on public.shuttle_services for each row execute function app_private.tenant_guard();
create trigger "000_tenant_guard" before insert or update on public.shuttle_fares    for each row execute function app_private.tenant_guard();
create trigger forbid_company_id_change before update on public.shuttle_services for each row execute function app_private.forbid_company_id_change();
create trigger forbid_company_id_change before update on public.shuttle_fares    for each row execute function app_private.forbid_company_id_change();
create trigger set_updated_at before update on public.shuttle_services for each row execute function app_private.set_updated_at();
create trigger set_updated_at before update on public.shuttle_fares    for each row execute function app_private.set_updated_at();
create trigger shuttle_service_check before insert or update on public.shuttle_services for each row execute function app_private.shuttle_service_check();
create trigger shuttle_fare_check before insert or update on public.shuttle_fares for each row execute function app_private.shuttle_fare_check();

alter table public.shuttle_services enable row level security;
alter table public.shuttle_fares enable row level security;
revoke all on public.shuttle_services, public.shuttle_fares from public, anon, authenticated;
grant select on public.shuttle_services, public.shuttle_fares to authenticated;
create policy tenant_select on public.shuttle_services for select to authenticated using (app_private.has_permission(company_id, 'shuttle.read'));
create policy tenant_select on public.shuttle_fares    for select to authenticated using (app_private.has_permission(company_id, 'shuttle.read'));
create policy platform_select on public.shuttle_services for select to authenticated using (app_private.is_platform_user());
create policy platform_select on public.shuttle_fares    for select to authenticated using (app_private.is_platform_user());

-- ======================= 6. FEATURE GATE + RPCs =======================
-- true only when the company has a live subscription whose plan grants feature_shuttle_ops. Missing row / no subscription = false.
create function app_private.shuttle_enabled(p_company uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select pe.bool_value
    from app_private.live_subscription(p_company) ls
    join public.plan_entitlements pe on pe.plan_id = ls.plan_id and pe.key = 'feature_shuttle_ops'), false)
$$;
revoke all on function app_private.shuttle_enabled(uuid) from public, anon, authenticated;

-- Read side for the settings screen: is the feature on for MY company? Only a member with shuttle.read gets an answer (others: false),
-- so this reveals nothing about another company's plan.
create function public.shuttle_is_enabled(p_company uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_company is null or not app_private.has_permission(p_company, 'shuttle.read') then return false; end if;
  return app_private.shuttle_enabled(p_company);
end $$;
revoke all on function public.shuttle_is_enabled(uuid) from public, anon;
grant execute on function public.shuttle_is_enabled(uuid) to authenticated;

-- Create the live service of a route, or update it. Company comes from the route row, never from the caller.
create function public.shuttle_save_service(
  p_route_id uuid, p_name text, p_outbound_direction text, p_allow_reverse boolean, p_request_ttl_minutes integer,
  p_allow_walk_in boolean, p_max_seats_per_request integer, p_hub_stop_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_id uuid; v_new boolean := false;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select r.company_id into v_company from public.routes r where r.id = p_route_id and r.deleted_at is null for update;
  if v_company is null or not app_private.has_permission(v_company, 'shuttle.config') then
    raise exception 'route not found' using errcode = 'P0002'; end if;
  if not app_private.shuttle_enabled(v_company) then
    raise exception 'shuttle operations are not included in the plan' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then raise exception 'invalid name' using errcode = '22023'; end if;
  if p_outbound_direction is null or p_outbound_direction not in ('forward', 'backward') then raise exception 'invalid outbound direction' using errcode = '22023'; end if;
  if p_allow_reverse is null or p_allow_walk_in is null then raise exception 'invalid flag' using errcode = '22023'; end if;
  if p_request_ttl_minutes is null or p_request_ttl_minutes not between 1 and 240 then raise exception 'invalid request ttl' using errcode = '22023'; end if;
  if p_max_seats_per_request is null or p_max_seats_per_request not between 1 and 20 then raise exception 'invalid max seats' using errcode = '22023'; end if;

  select s.id into v_id from public.shuttle_services s where s.company_id = v_company and s.route_id = p_route_id and s.is_active for update;
  if v_id is null then
    insert into public.shuttle_services (company_id, route_id, name, outbound_direction, allow_reverse, request_ttl_minutes, allow_walk_in,
                                         max_seats_per_request, hub_stop_id, created_by)
    values (v_company, p_route_id, btrim(p_name), p_outbound_direction, p_allow_reverse, p_request_ttl_minutes, p_allow_walk_in,
            p_max_seats_per_request, p_hub_stop_id, auth.uid())
    returning id into v_id;
    v_new := true;
  else
    update public.shuttle_services set name = btrim(p_name), outbound_direction = p_outbound_direction, allow_reverse = p_allow_reverse,
      request_ttl_minutes = p_request_ttl_minutes, allow_walk_in = p_allow_walk_in, max_seats_per_request = p_max_seats_per_request,
      hub_stop_id = p_hub_stop_id
    where id = v_id;
  end if;
  perform app_private.write_audit('company_user', v_company, case when v_new then 'shuttle_service.created' else 'shuttle_service.updated' end,
    'shuttle_service', v_id,
    jsonb_build_object('route_id', p_route_id, 'outbound_direction', p_outbound_direction, 'allow_reverse', p_allow_reverse,
                       'request_ttl_minutes', p_request_ttl_minutes, 'allow_walk_in', p_allow_walk_in, 'max_seats_per_request', p_max_seats_per_request));
  return v_id;
end $$;

-- Switch a service off or on. Reactivating fails (23505) when the route already has another live service.
create function public.shuttle_set_service_active(p_service_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_active is null then raise exception 'invalid flag' using errcode = '22023'; end if;
  select s.company_id into v_company from public.shuttle_services s where s.id = p_service_id for update;
  if v_company is null or not app_private.has_permission(v_company, 'shuttle.config') then
    raise exception 'service not found' using errcode = 'P0002'; end if;
  -- turning a service OFF is always allowed (a plan downgrade must not trap a company); turning it ON needs the feature
  if p_active and not app_private.shuttle_enabled(v_company) then
    raise exception 'shuttle operations are not included in the plan' using errcode = '42501'; end if;
  begin
    update public.shuttle_services set is_active = p_active where id = p_service_id;
  exception when unique_violation then
    raise exception 'the route already has a live shuttle service' using errcode = '23505';
  end;
  perform app_private.write_audit('company_user', v_company, case when p_active then 'shuttle_service.activated' else 'shuttle_service.deactivated' end,
    'shuttle_service', p_service_id, '{}'::jsonb);
end $$;

-- Replace the whole fare matrix of a service in one transaction. p_fares = [{"from_stop_id":uuid,"to_stop_id":uuid,"price":number}, ...]
-- Fares are copied into a booking when it is confirmed (S4), so replacing the matrix never changes an existing booking.
create function public.shuttle_save_fares(p_service_id uuid, p_fares jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select s.company_id into v_company from public.shuttle_services s where s.id = p_service_id for update;
  if v_company is null or not app_private.has_permission(v_company, 'shuttle.config') then
    raise exception 'service not found' using errcode = 'P0002'; end if;
  if not app_private.shuttle_enabled(v_company) then
    raise exception 'shuttle operations are not included in the plan' using errcode = '42501'; end if;
  if p_fares is null or jsonb_typeof(p_fares) <> 'array' or jsonb_array_length(p_fares) > 2000 then
    raise exception 'fares must be an array of at most 2000 rows' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_fares) e
             where jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'price') <> 'number'
                or (e ->> 'from_stop_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or (e ->> 'to_stop_id')   !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'invalid fare row' using errcode = '22023'; end if;

  delete from public.shuttle_fares where service_id = p_service_id;
  begin
    insert into public.shuttle_fares (company_id, service_id, from_stop_id, to_stop_id, price)
    select v_company, p_service_id, (e ->> 'from_stop_id')::uuid, (e ->> 'to_stop_id')::uuid, round((e ->> 'price')::numeric, 2)
    from jsonb_array_elements(p_fares) e;
  exception when unique_violation then
    raise exception 'duplicate station pair in fares' using errcode = '22023';
  end;
  get diagnostics v_n = row_count;
  perform app_private.write_audit('company_user', v_company, 'shuttle_fares.saved', 'shuttle_service', p_service_id, jsonb_build_object('rows', v_n));
  return v_n;
end $$;

revoke all on function public.shuttle_save_service(uuid, text, text, boolean, integer, boolean, integer, uuid) from public, anon;
revoke all on function public.shuttle_set_service_active(uuid, boolean) from public, anon;
revoke all on function public.shuttle_save_fares(uuid, jsonb) from public, anon;
grant execute on function public.shuttle_save_service(uuid, text, text, boolean, integer, boolean, integer, uuid) to authenticated;
grant execute on function public.shuttle_set_service_active(uuid, boolean) to authenticated;
grant execute on function public.shuttle_save_fares(uuid, jsonb) to authenticated;
