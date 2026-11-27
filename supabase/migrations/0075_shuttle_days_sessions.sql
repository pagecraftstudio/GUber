-- 0075: Continuous Shuttle, phase S2 - operating day, vehicle sessions, assignments, runs, segments, events.
-- Builds on 0074. trips, bookings, tickets and every other existing table are NOT touched.
--
-- WHAT THIS ADDS
--   Tables  shuttle_operating_days   the day (service_date anchor, station + config SNAPSHOT, status)
--           shuttle_vehicle_sessions one physical bus in a day (state machine, current driver, capacity snapshot)
--           shuttle_assignments      bus/driver history (append-only; only effective_to may be closed once)
--           shuttle_runs             one-direction pass, the row bookings will attach to (S4)
--           shuttle_run_segments     per-segment counters (confirmed_seats CHECK 0..capacity), filled at run creation
--           shuttle_events           append-only operational log
--   Guards  session state machine trigger, day status trigger, one live session per bus and per driver (partial unique indexes),
--           no overlapping assignments per bus or driver (GiST exclusion), max_shuttle_vehicles enforced on live sessions (enforce_limit).
--   RPCs    shuttle_start_day, shuttle_cancel_day (only while every bus is still ready), shuttle_overview (read, with names)
--   Helper  app_private.is_my_shuttle_driver(company, session)
--
-- DESIGN NOTES
--   * Run numbers are allocated per DAY (1..N across all vehicles) under the day row lock; S3 locks the day before it adds a reversal run.
--   * Station snapshot is stored in stop order (idx 0..n-1). A run has a direction; its travel position p maps to snapshot idx p (forward)
--     or n-1-p (backward). session.station_idx and run segments are in TRAVEL positions. Segment seg_idx k = travel position k -> k+1.
--   * A bus may start mid-line; its run still covers the whole pass, positions already behind it are simply never used.
--   * A bus cannot start on the LAST position of its run (it would have no segment ahead).
--   * Replaying shuttle_start_day with the same key returns the stored result (replayed true). A different key for the same date is refused.
--   * Trip conflicts: a bus or driver with a scheduled / boarding / in_progress trip overlapping [max(now, day start), day end) is refused.
--   * Assignments close automatically when their session becomes completed (trigger), so a freed bus or driver is really free.
--
-- DEFERRED (not created here, first caller is S3): shuttle_station_visits, lock helpers, open_loading/depart/arrive RPCs.
-- DEFERRED to S7: replaced_by_session_id on sessions.
-- EXISTING OBJECTS CHANGED: none (rows only: none). New objects only.
--
-- ROLLBACK (only while no shuttle days matter):
--   drop function public.shuttle_overview(uuid, date), public.shuttle_cancel_day(uuid, text), public.shuttle_start_day(uuid, date, jsonb, text),
--     app_private.is_my_shuttle_driver(uuid, uuid), app_private.shuttle_log(uuid, uuid, uuid, text, jsonb, timestamptz, text),
--     app_private.shuttle_actor_role(uuid), app_private.shuttle_day_result(uuid), app_private.shuttle_session_state_guard(),
--     app_private.shuttle_day_status_guard(), app_private.shuttle_session_completed(), app_private.shuttle_assignment_guard();
--   drop table public.shuttle_events, public.shuttle_run_segments, public.shuttle_assignments cascade;
--   alter table public.shuttle_vehicle_sessions drop constraint shuttle_sessions_run_fk;
--   drop table public.shuttle_runs, public.shuttle_vehicle_sessions, public.shuttle_operating_days;
-- RUNNER NOTE: apply before deploying any code that calls these RPCs.
set search_path = public, extensions;

-- ======================= TABLES =======================
create table public.shuttle_operating_days (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  service_id uuid not null,
  service_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reconciled', 'cancelled')),
  tz text not null,
  stations jsonb not null check (jsonb_typeof(stations) = 'array' and jsonb_array_length(stations) between 2 and 200),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  start_key text not null check (length(start_key) between 1 and 100),
  opened_by uuid references public.profiles(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  cancelled_reason text check (cancelled_reason is null or length(cancelled_reason) between 3 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_days_service_fk foreign key (company_id, service_id) references public.shuttle_services(company_id, id) on delete restrict,
  constraint shuttle_days_cancel_shape check ((status = 'cancelled') = (cancelled_reason is not null))
);
-- blocks a double start of the same service on the same date; a cancelled day may be started again
create unique index shuttle_days_one_per_date on public.shuttle_operating_days (service_id, service_date) where status <> 'cancelled';
create index shuttle_days_service_idx on public.shuttle_operating_days (company_id, service_id, service_date desc);

create table public.shuttle_vehicle_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  day_id uuid not null,
  vehicle_id uuid not null,
  state text not null default 'ready' check (state in ('ready', 'loading', 'in_transit', 'arrived', 'completed', 'out_of_service')),
  station_idx smallint not null check (station_idx >= 0),
  current_driver_id uuid not null,
  current_run_id uuid,
  capacity smallint not null check (capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_sessions_day_fk foreign key (company_id, day_id) references public.shuttle_operating_days(company_id, id) on delete restrict,
  constraint shuttle_sessions_bus_fk foreign key (company_id, vehicle_id) references public.buses(company_id, id) on delete restrict,
  constraint shuttle_sessions_driver_fk foreign key (company_id, current_driver_id) references public.drivers(company_id, id) on delete restrict
);
create unique index shuttle_sessions_one_live_bus on public.shuttle_vehicle_sessions (company_id, vehicle_id) where state <> 'completed';
create unique index shuttle_sessions_one_live_driver on public.shuttle_vehicle_sessions (company_id, current_driver_id) where state <> 'completed';
create index shuttle_sessions_day_idx on public.shuttle_vehicle_sessions (company_id, day_id);
create index shuttle_sessions_bus_idx on public.shuttle_vehicle_sessions (company_id, vehicle_id);
create index shuttle_sessions_driver_idx on public.shuttle_vehicle_sessions (company_id, current_driver_id);

create table public.shuttle_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  day_id uuid not null,
  run_no smallint not null check (run_no >= 1),
  direction text not null check (direction in ('forward', 'backward')),
  session_id uuid not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'finished', 'aborted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_runs_day_run_uq unique (day_id, run_no),
  constraint shuttle_runs_day_fk foreign key (company_id, day_id) references public.shuttle_operating_days(company_id, id) on delete restrict,
  constraint shuttle_runs_session_fk foreign key (company_id, session_id) references public.shuttle_vehicle_sessions(company_id, id) on delete restrict
);
create index shuttle_runs_session_idx on public.shuttle_runs (company_id, session_id);

alter table public.shuttle_vehicle_sessions
  add constraint shuttle_sessions_run_fk foreign key (company_id, current_run_id) references public.shuttle_runs(company_id, id) on delete restrict;
create index shuttle_sessions_run_idx on public.shuttle_vehicle_sessions (company_id, current_run_id) where current_run_id is not null;

create table public.shuttle_run_segments (
  run_id uuid not null,
  seg_idx smallint not null check (seg_idx >= 0),
  company_id uuid not null references public.companies(id) on delete restrict,
  capacity smallint not null check (capacity > 0),
  confirmed_seats smallint not null default 0,
  primary key (run_id, seg_idx),
  constraint shuttle_segments_seats_valid check (confirmed_seats between 0 and capacity),
  constraint shuttle_segments_run_fk foreign key (company_id, run_id) references public.shuttle_runs(company_id, id) on delete restrict
);
create index shuttle_segments_company_idx on public.shuttle_run_segments (company_id, run_id);

create table public.shuttle_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  session_id uuid not null,
  vehicle_id uuid not null,
  driver_id uuid not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  reason text not null check (length(reason) between 1 and 300),
  authorized_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_assignments_range_valid check (effective_to is null or effective_to >= effective_from),
  constraint shuttle_assignments_session_fk foreign key (company_id, session_id) references public.shuttle_vehicle_sessions(company_id, id) on delete restrict,
  constraint shuttle_assignments_bus_fk foreign key (company_id, vehicle_id) references public.buses(company_id, id) on delete restrict,
  constraint shuttle_assignments_driver_fk foreign key (company_id, driver_id) references public.drivers(company_id, id) on delete restrict,
  constraint shuttle_assignments_driver_no_overlap exclude using gist (
    company_id with =, driver_id with =, tstzrange(effective_from, coalesce(effective_to, 'infinity'::timestamptz), '[)') with &&),
  constraint shuttle_assignments_bus_no_overlap exclude using gist (
    company_id with =, vehicle_id with =, tstzrange(effective_from, coalesce(effective_to, 'infinity'::timestamptz), '[)') with &&)
);
create index shuttle_assignments_session_idx on public.shuttle_assignments (company_id, session_id);
create index shuttle_assignments_bus_idx on public.shuttle_assignments (company_id, vehicle_id);
create index shuttle_assignments_driver_idx on public.shuttle_assignments (company_id, driver_id);

create table public.shuttle_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  day_id uuid not null,
  session_id uuid,
  kind text not null check (kind ~ '^[a-z][a-z_.]{2,59}$'),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (length(actor_role) between 1 and 40),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  client_occurred_at timestamptz,
  recorded_at timestamptz not null default now(),
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 1 and 100),
  unique (company_id, id),
  constraint shuttle_events_day_fk foreign key (company_id, day_id) references public.shuttle_operating_days(company_id, id) on delete restrict,
  constraint shuttle_events_session_fk foreign key (company_id, session_id) references public.shuttle_vehicle_sessions(company_id, id) on delete restrict
);
create unique index shuttle_events_session_key_uq on public.shuttle_events (session_id, idempotency_key) where session_id is not null and idempotency_key is not null;
create index shuttle_events_day_idx on public.shuttle_events (company_id, day_id, recorded_at);
create index shuttle_events_session_idx on public.shuttle_events (company_id, session_id) where session_id is not null;

-- ======================= GUARDS =======================
-- session: legal state moves only; bus and day never change (a vehicle swap is a NEW session, S7)
create function app_private.shuttle_session_state_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.day_id is distinct from old.day_id or new.vehicle_id is distinct from old.vehicle_id then
    raise exception 'shuttle session bus and day cannot change' using errcode = '23514';
  end if;
  if new.state is distinct from old.state and not exists (
       select 1 from (values ('ready','loading'), ('loading','in_transit'), ('in_transit','arrived'), ('arrived','loading'),
                             ('ready','completed'), ('loading','completed'), ('arrived','completed'),
                             ('ready','out_of_service'), ('loading','out_of_service'), ('arrived','out_of_service'), ('in_transit','out_of_service'),
                             ('out_of_service','ready'), ('out_of_service','arrived')) v(a, b)
       where v.a = old.state and v.b = new.state) then
    raise exception 'invalid shuttle session transition % -> %', old.state, new.state using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_session_state_guard() from public, anon, authenticated;

create function app_private.shuttle_day_status_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.service_id is distinct from old.service_id or new.service_date is distinct from old.service_date
     or new.stations is distinct from old.stations or new.config is distinct from old.config or new.tz is distinct from old.tz then
    raise exception 'shuttle day snapshot cannot change' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not exists (
       select 1 from (values ('open','closed'), ('open','cancelled'), ('closed','reconciled')) v(a, b) where v.a = old.status and v.b = new.status) then
    raise exception 'invalid shuttle day transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_day_status_guard() from public, anon, authenticated;

-- a finished session frees its bus and driver: close the open assignment
create function app_private.shuttle_session_completed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.shuttle_assignments set effective_to = now() where session_id = new.id and effective_to is null;
  return new;
end $$;
revoke all on function app_private.shuttle_session_completed() from public, anon, authenticated;

-- assignments are history: the only change ever allowed is closing effective_to once
create function app_private.shuttle_assignment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.effective_to is not null or new.effective_to is null
     or new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.session_id is distinct from old.session_id
     or new.vehicle_id is distinct from old.vehicle_id or new.driver_id is distinct from old.driver_id
     or new.effective_from is distinct from old.effective_from or new.reason is distinct from old.reason
     or new.authorized_by is distinct from old.authorized_by or new.created_at is distinct from old.created_at then
    raise exception 'shuttle assignments are history: only closing effective_to once is allowed' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_assignment_guard() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['shuttle_operating_days','shuttle_vehicle_sessions','shuttle_runs','shuttle_run_segments','shuttle_assignments','shuttle_events'] loop
    execute format('create trigger "000_tenant_guard" before insert or update on public.%I for each row execute function app_private.tenant_guard()', t);
    execute format('create trigger forbid_company_id_change before update on public.%I for each row execute function app_private.forbid_company_id_change()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.has_permission(company_id, %L))', t, 'shuttle.read');
    execute format('create policy platform_select on public.%I for select to authenticated using (app_private.is_platform_user())', t);
  end loop;
  foreach t in array array['shuttle_operating_days','shuttle_vehicle_sessions','shuttle_runs'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function app_private.set_updated_at()', t);
  end loop;
end $$;

create trigger shuttle_session_state_guard before update on public.shuttle_vehicle_sessions for each row execute function app_private.shuttle_session_state_guard();
create trigger shuttle_session_completed after update of state on public.shuttle_vehicle_sessions for each row
  when (new.state = 'completed' and old.state <> 'completed') execute function app_private.shuttle_session_completed();
create trigger shuttle_day_status_guard before update on public.shuttle_operating_days for each row execute function app_private.shuttle_day_status_guard();
create trigger shuttle_assignment_guard before update on public.shuttle_assignments for each row execute function app_private.shuttle_assignment_guard();
create trigger forbid_modify_row before delete on public.shuttle_assignments for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on public.shuttle_assignments for each statement execute function app_private.forbid_modify();
create trigger forbid_modify_row before update or delete on public.shuttle_events for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on public.shuttle_events for each statement execute function app_private.forbid_modify();
-- plan limit: vehicles that are LIVE at the same time (a completed session no longer counts)
create trigger enforce_limit before insert on public.shuttle_vehicle_sessions for each row execute function app_private.enforce_limit('max_shuttle_vehicles', $$state <> 'completed'$$);

-- ======================= HELPERS =======================
create function app_private.shuttle_actor_role(p_company uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select r.key from public.company_users cu join public.roles r on r.id = cu.role_id
                   where cu.company_id = p_company and cu.user_id = auth.uid() and cu.status = 'active' limit 1), 'platform')
$$;
revoke all on function app_private.shuttle_actor_role(uuid) from public, anon, authenticated;

create function app_private.shuttle_log(p_company uuid, p_day uuid, p_session uuid, p_kind text, p_payload jsonb,
                                        p_client_at timestamptz default null, p_key text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_id, actor_role, payload, client_occurred_at, idempotency_key)
  values (p_company, p_day, p_session, p_kind, auth.uid(), app_private.shuttle_actor_role(p_company), coalesce(p_payload, '{}'::jsonb), p_client_at, p_key)
$$;
revoke all on function app_private.shuttle_log(uuid, uuid, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;

-- the driver of the session's CURRENT assignment, signed in, active
create function app_private.is_my_shuttle_driver(p_company uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shuttle_vehicle_sessions s
    where s.id = p_session and s.company_id = p_company and s.state <> 'completed'
      and app_private.is_my_driver(p_company, s.current_driver_id))
$$;
revoke all on function app_private.is_my_shuttle_driver(uuid, uuid) from public, anon, authenticated;

create function app_private.shuttle_day_result(p_day uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('day_id', d.id, 'service_date', d.service_date, 'sessions', coalesce((
    select jsonb_agg(jsonb_build_object('session_id', s.id, 'run_id', s.current_run_id, 'bus_id', s.vehicle_id, 'driver_id', s.current_driver_id) order by r.run_no)
    from public.shuttle_vehicle_sessions s join public.shuttle_runs r on r.id = s.current_run_id where s.day_id = d.id), '[]'::jsonb))
  from public.shuttle_operating_days d where d.id = p_day
$$;
revoke all on function app_private.shuttle_day_result(uuid) from public, anon, authenticated;

-- ======================= RPCs =======================
-- p_vehicles = [{"bus_id":uuid,"driver_id":uuid,"start_station_idx":0..n-1 (stop order),"direction":"forward"|"backward"}, ...]
create function public.shuttle_start_day(p_service_id uuid, p_service_date date, p_vehicles jsonb, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_svc public.shuttle_services%rowtype; v_company uuid; v_tz text; v_today date; v_stations jsonb; v_n integer;
  v_day uuid; v_existing public.shuttle_operating_days%rowtype; v_el jsonb; v_bus public.buses%rowtype; v_drv public.drivers%rowtype;
  v_dir text; v_idx integer; v_pos integer; v_sess uuid; v_run uuid; v_runno integer := 0;
  v_day_start timestamptz; v_day_end timestamptz; v_from timestamptz; v_seen_b uuid[] := '{}'; v_seen_d uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_svc from public.shuttle_services s where s.id = p_service_id;
  if not found or not app_private.has_permission(v_svc.company_id, 'shuttle.operate') then
    raise exception 'service not found' using errcode = 'P0002'; end if;
  v_company := v_svc.company_id;
  if not app_private.shuttle_enabled(v_company) then raise exception 'shuttle operations are not included in the plan' using errcode = '42501'; end if;
  if not v_svc.is_active then raise exception 'shuttle service is not active' using errcode = '23514'; end if;
  if p_service_date is null or p_key is null or length(btrim(p_key)) not between 1 and 100 then raise exception 'invalid input' using errcode = '22023'; end if;
  if p_vehicles is null or jsonb_typeof(p_vehicles) <> 'array' or jsonb_array_length(p_vehicles) not between 1 and 50 then
    raise exception 'invalid vehicle list' using errcode = '22023'; end if;
  select coalesce(cs.timezone, 'UTC') into v_tz from public.company_settings cs where cs.company_id = v_company;
  v_tz := coalesce(v_tz, 'UTC');
  v_today := (now() at time zone v_tz)::date;
  if p_service_date < v_today - 1 or p_service_date > v_today + 1 then raise exception 'invalid service date' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_service_id::text || p_service_date::text, 0));
  select * into v_existing from public.shuttle_operating_days d where d.service_id = p_service_id and d.service_date = p_service_date and d.status <> 'cancelled';
  if found then
    if v_existing.start_key = btrim(p_key) then
      return app_private.shuttle_day_result(v_existing.id) || jsonb_build_object('replayed', true);
    end if;
    raise exception 'a shuttle day already exists for this date' using errcode = '23505';
  end if;

  select jsonb_agg(jsonb_build_object('idx', x.rn - 1, 'stop_id', x.id, 'name', x.name, 'offset_minutes', x.offset_minutes) order by x.rn)
    into v_stations
  from (select s.id, s.name, s.offset_minutes, row_number() over (order by s.stop_order, s.id) as rn
        from public.route_stops s where s.company_id = v_company and s.route_id = v_svc.route_id and s.is_active) x;
  v_n := coalesce(jsonb_array_length(v_stations), 0);
  if v_n < 2 then raise exception 'route needs at least two active stops' using errcode = '23514'; end if;

  v_day_start := (p_service_date::timestamp) at time zone v_tz;
  v_day_end := ((p_service_date + 1)::timestamp) at time zone v_tz;
  v_from := greatest(v_day_start, now());

  insert into public.shuttle_operating_days (company_id, service_id, service_date, tz, stations, config, start_key, opened_by)
  values (v_company, p_service_id, p_service_date, v_tz, v_stations,
          jsonb_build_object('name', v_svc.name, 'outbound_direction', v_svc.outbound_direction, 'allow_reverse', v_svc.allow_reverse,
                             'allow_walk_in', v_svc.allow_walk_in, 'request_ttl_minutes', v_svc.request_ttl_minutes,
                             'max_seats_per_request', v_svc.max_seats_per_request, 'hub_stop_id', v_svc.hub_stop_id),
          btrim(p_key), auth.uid())
  returning id into v_day;

  for v_el in select e from jsonb_array_elements(p_vehicles) e loop
    if jsonb_typeof(v_el) <> 'object'
       or (v_el ->> 'bus_id') !~ c_uuid or (v_el ->> 'driver_id') !~ c_uuid
       or (v_el ->> 'start_station_idx') !~ '^[0-9]{1,3}$'
       or (v_el ->> 'direction') not in ('forward', 'backward') then
      raise exception 'invalid vehicle list' using errcode = '22023'; end if;
    v_idx := (v_el ->> 'start_station_idx')::integer;
    v_dir := v_el ->> 'direction';
    if v_idx > v_n - 1 then raise exception 'invalid start station' using errcode = '22023'; end if;
    v_pos := case when v_dir = 'forward' then v_idx else v_n - 1 - v_idx end;
    if v_pos > v_n - 2 then raise exception 'invalid start station' using errcode = '22023'; end if;
    if (v_el ->> 'bus_id')::uuid = any (v_seen_b) or (v_el ->> 'driver_id')::uuid = any (v_seen_d) then
      raise exception 'invalid vehicle list' using errcode = '22023'; end if;
    v_seen_b := v_seen_b || (v_el ->> 'bus_id')::uuid;
    v_seen_d := v_seen_d || (v_el ->> 'driver_id')::uuid;

    select * into v_bus from public.buses b where b.id = (v_el ->> 'bus_id')::uuid and b.company_id = v_company;
    if not found then raise exception 'bus not found' using errcode = 'P0002'; end if;
    if v_bus.status <> 'active' then raise exception 'bus is not active' using errcode = '23514'; end if;
    select * into v_drv from public.drivers d where d.id = (v_el ->> 'driver_id')::uuid and d.company_id = v_company;
    if not found then raise exception 'driver not found' using errcode = 'P0002'; end if;
    if v_drv.status <> 'active' then raise exception 'driver is not active' using errcode = '23514'; end if;

    if exists (select 1 from public.shuttle_vehicle_sessions s where s.company_id = v_company and s.vehicle_id = v_bus.id and s.state <> 'completed') then
      raise exception 'bus is already in a live shuttle session' using errcode = '23505'; end if;
    if exists (select 1 from public.shuttle_vehicle_sessions s where s.company_id = v_company and s.current_driver_id = v_drv.id and s.state <> 'completed') then
      raise exception 'driver is already in a live shuttle session' using errcode = '23505'; end if;
    if v_from < v_day_end then
      if exists (select 1 from public.trips t where t.company_id = v_company and t.bus_id = v_bus.id and t.status in ('scheduled', 'boarding', 'in_progress')
                   and tstzrange(t.departure_at, t.blocked_until) && tstzrange(v_from, v_day_end)) then
        raise exception 'bus has a scheduled trip in that window' using errcode = '23514'; end if;
      if exists (select 1 from public.trips t where t.company_id = v_company and t.driver_id = v_drv.id and t.status in ('scheduled', 'boarding', 'in_progress')
                   and tstzrange(t.departure_at, t.blocked_until) && tstzrange(v_from, v_day_end)) then
        raise exception 'driver has a scheduled trip in that window' using errcode = '23514'; end if;
    end if;

    insert into public.shuttle_vehicle_sessions (company_id, day_id, vehicle_id, station_idx, current_driver_id, capacity)
    values (v_company, v_day, v_bus.id, v_pos, v_drv.id, v_bus.capacity) returning id into v_sess;
    insert into public.shuttle_assignments (company_id, session_id, vehicle_id, driver_id, reason, authorized_by)
    values (v_company, v_sess, v_bus.id, v_drv.id, 'day_start', auth.uid());
    v_runno := v_runno + 1;
    insert into public.shuttle_runs (company_id, day_id, run_no, direction, session_id) values (v_company, v_day, v_runno, v_dir, v_sess) returning id into v_run;
    insert into public.shuttle_run_segments (run_id, seg_idx, company_id, capacity)
    select v_run, g, v_company, v_bus.capacity from generate_series(0, v_n - 2) g;
    update public.shuttle_vehicle_sessions set current_run_id = v_run where id = v_sess;
    perform app_private.shuttle_log(v_company, v_day, v_sess, 'session.started',
      jsonb_build_object('bus_id', v_bus.id, 'driver_id', v_drv.id, 'run_id', v_run, 'direction', v_dir, 'station_pos', v_pos, 'capacity', v_bus.capacity));
  end loop;

  perform app_private.shuttle_log(v_company, v_day, null, 'day.started', jsonb_build_object('service_id', p_service_id, 'vehicles', v_runno), null, null);
  perform app_private.write_audit('company_user', v_company, 'shuttle_day.started', 'shuttle_day', v_day,
    jsonb_build_object('service_id', p_service_id, 'service_date', p_service_date, 'vehicles', v_runno));
  return app_private.shuttle_day_result(v_day) || jsonb_build_object('replayed', false);
end $$;

-- Only while nothing has moved: every bus still 'ready'. Frees every bus and driver; the date may be started again.
create function public.shuttle_cancel_day(p_day_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_day public.shuttle_operating_days%rowtype; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_day from public.shuttle_operating_days d where d.id = p_day_id for update;
  if not found or not app_private.has_permission(v_day.company_id, 'shuttle.operate') then
    raise exception 'day not found' using errcode = 'P0002'; end if;
  if length(v_reason) not between 3 and 300 then raise exception 'reason required' using errcode = '22023'; end if;
  if v_day.status <> 'open' then raise exception 'day is not open' using errcode = '23514'; end if;
  perform 1 from public.shuttle_vehicle_sessions s where s.day_id = p_day_id order by s.id for update;
  if exists (select 1 from public.shuttle_vehicle_sessions s where s.day_id = p_day_id and s.state <> 'ready') then
    raise exception 'day has started and cannot be cancelled' using errcode = '23514'; end if;
  update public.shuttle_vehicle_sessions set state = 'completed' where day_id = p_day_id;
  update public.shuttle_runs set status = 'aborted' where day_id = p_day_id;
  update public.shuttle_operating_days set status = 'cancelled', cancelled_reason = v_reason where id = p_day_id;
  perform app_private.shuttle_log(v_day.company_id, p_day_id, null, 'day.cancelled', jsonb_build_object('reason', v_reason));
  perform app_private.write_audit('company_user', v_day.company_id, 'shuttle_day.cancelled', 'shuttle_day', p_day_id, jsonb_build_object('reason', v_reason));
end $$;

-- The overview screen: the day of a date (default: today in the company zone) with names. Null day when none was started.
create function public.shuttle_overview(p_service_id uuid, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_svc public.shuttle_services%rowtype; v_tz text; v_date date; v_day public.shuttle_operating_days%rowtype; v_n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_svc from public.shuttle_services s where s.id = p_service_id;
  if not found or not app_private.has_permission(v_svc.company_id, 'shuttle.read') then raise exception 'service not found' using errcode = 'P0002'; end if;
  select coalesce(cs.timezone, 'UTC') into v_tz from public.company_settings cs where cs.company_id = v_svc.company_id;
  v_date := coalesce(p_date, (now() at time zone coalesce(v_tz, 'UTC'))::date);
  select * into v_day from public.shuttle_operating_days d where d.service_id = p_service_id and d.service_date = v_date and d.status <> 'cancelled';
  if not found then return jsonb_build_object('service_date', v_date, 'day', null, 'sessions', '[]'::jsonb); end if;
  v_n := jsonb_array_length(v_day.stations);
  return jsonb_build_object(
    'service_date', v_date,
    'day', jsonb_build_object('id', v_day.id, 'status', v_day.status, 'opened_at', v_day.opened_at, 'stations', v_day.stations),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'state', s.state, 'run_id', r.id, 'run_no', r.run_no, 'direction', r.direction, 'capacity', s.capacity,
        'bus_id', b.id, 'plate', b.plate_number, 'driver_id', d.id, 'driver_name', d.full_name,
        'station_pos', s.station_idx,
        'station_name', v_day.stations -> (case when r.direction = 'forward' then s.station_idx else v_n - 1 - s.station_idx end) ->> 'name') order by r.run_no)
      from public.shuttle_vehicle_sessions s
      join public.shuttle_runs r on r.id = s.current_run_id
      join public.buses b on b.id = s.vehicle_id join public.drivers d on d.id = s.current_driver_id
      where s.day_id = v_day.id), '[]'::jsonb));
end $$;

revoke all on function public.shuttle_start_day(uuid, date, jsonb, text) from public, anon;
revoke all on function public.shuttle_cancel_day(uuid, text) from public, anon;
revoke all on function public.shuttle_overview(uuid, date) from public, anon;
grant execute on function public.shuttle_start_day(uuid, date, jsonb, text) to authenticated;
grant execute on function public.shuttle_cancel_day(uuid, text) to authenticated;
grant execute on function public.shuttle_overview(uuid, date) to authenticated;
