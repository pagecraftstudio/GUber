-- 0076: Continuous Shuttle, phase S3 - the leg engine (station visits, legs, loading, depart, arrive, reversal, out of service, end session).
-- Builds on 0074 and 0075. trips, bookings, tickets and every other existing table are NOT touched.
--
-- WHAT THIS ADDS
--   Tables  shuttle_station_visits  arrive -> load -> depart at one station of one run (this IS the "loading session")
--           shuttle_legs            one hop between two neighbouring stations, CREATED AT DEPARTURE (never pre-scheduled)
--   Columns shuttle_vehicle_sessions.out_of_service_from ('ready' | 'arrived': where the bus resumes), shuttle_legs.overdue_flagged_at
--   Guards  run status machine, immutable leg snapshot (bus, driver, stations, departure), one in-transit leg per session,
--           visit time order CHECKs, no deletes on visits/legs
--   RPCs    shuttle_open_loading, shuttle_close_loading, shuttle_depart, shuttle_arrive, shuttle_set_out_of_service,
--           shuttle_return_to_service, shuttle_end_session (all: expected state + idempotency key), shuttle_vehicle_detail (read)
--   Job     shuttle-overdue-legs (every minute): flags a leg that is in transit for more than twice its expected time (event leg.overdue)
--
-- RULES (plan sections 7, 10, 20)
--   * Every action takes p_expected_state and p_key. Same key again -> the stored result, replayed true. Same key on another action -> 22023.
--     State already moved -> P0001 "stale state: <current>", nothing written. Unique indexes make a second leg or visit impossible anyway.
--   * Who: shuttle.operate (owner, manager, operations), or the DRIVER of the session's current assignment (shuttle.drive + is_my_shuttle_driver).
--     Out of service, return to service and end session are manager-side only (shuttle.operate).
--   * Lock order: day (FOR SHARE, so buses of one day never block each other, only cancel/close do) -> session -> run. Run numbers of a
--     reversal come from a per-day advisory lock, not a day-row lock, so a reversal can never deadlock against shuttle_cancel_day.
--   * depart creates the leg with bus and driver SNAPSHOTS; a later swap never rewrites history. onboard_at_departure is 0 until S5 (boardings).
--   * arrive may carry the real arrival time (p_occurred_at, <= now, >= departure). More than 60 s in the past counts as LATE and needs a reason.
--   * Reaching the LAST position and opening loading again reverses the bus when the day config allows it: old run finished, new run in the
--     opposite direction with fresh segment rows, bus at position 0 of it. Without reversal the session completes.
--   * Every action needs the day to be open.
--
-- DEFERRED (hooks, first needed later): "all passengers alighted before loading" and "onboard = 0 to end" (S5, no boardings yet);
--   expire/no-show of requested and confirmed bookings at depart (S4); driver-reported out of service (S8, needs notifications).
-- EXISTING OBJECTS CHANGED: shuttle_vehicle_sessions gets one nullable column. app_private.jobs gets one row. Nothing else.
--
-- ROLLBACK (only while no shuttle legs matter):
--   delete from app_private.jobs where name = 'shuttle-overdue-legs';
--   drop function public.shuttle_vehicle_detail(uuid), public.shuttle_end_session(uuid, text, text), public.shuttle_return_to_service(uuid, text, text),
--     public.shuttle_set_out_of_service(uuid, text, text, text), public.shuttle_arrive(uuid, text, text, timestamptz, text), public.shuttle_depart(uuid, text, text),
--     public.shuttle_close_loading(uuid, text, text), public.shuttle_open_loading(uuid, text, text),
--     app_private.shuttle_flag_overdue_legs(), app_private.shuttle_station_name(jsonb, text, integer), app_private.shuttle_assert(public.shuttle_vehicle_sessions, text, text[]),
--     app_private.shuttle_replay(uuid, text, text), app_private.shuttle_begin(uuid, boolean, text), app_private.shuttle_lock_session(uuid),
--     app_private.shuttle_run_status_guard(), app_private.shuttle_leg_guard();
--   drop table public.shuttle_legs, public.shuttle_station_visits;
--   alter table public.shuttle_vehicle_sessions drop column out_of_service_from;
-- RUNNER NOTE: apply before deploying any code that calls these RPCs.
set search_path = public, extensions;

-- ======================= TABLES =======================
alter table public.shuttle_vehicle_sessions
  add column out_of_service_from text check (out_of_service_from in ('ready', 'arrived'));

create table public.shuttle_station_visits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  session_id uuid not null,
  run_id uuid not null,
  station_idx smallint not null check (station_idx >= 0),
  arrived_at timestamptz not null default now(),
  loading_started_at timestamptz,
  loading_closed_at timestamptz,
  departed_at timestamptz,
  arrival_recorded_by uuid references public.profiles(id) on delete set null,
  late_recorded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_visits_session_run_station_uq unique (session_id, run_id, station_idx),
  constraint shuttle_visits_session_fk foreign key (company_id, session_id) references public.shuttle_vehicle_sessions(company_id, id) on delete restrict,
  constraint shuttle_visits_run_fk foreign key (company_id, run_id) references public.shuttle_runs(company_id, id) on delete restrict,
  constraint shuttle_visits_loading_order check (loading_started_at is null or loading_started_at >= arrived_at),
  constraint shuttle_visits_closed_order check (loading_closed_at is null or (loading_started_at is not null and loading_closed_at >= loading_started_at)),
  constraint shuttle_visits_departed_order check (departed_at is null or (loading_closed_at is not null and departed_at >= loading_closed_at))
);
create index shuttle_visits_session_idx on public.shuttle_station_visits (company_id, session_id);
create index shuttle_visits_run_idx on public.shuttle_station_visits (company_id, run_id);

create table public.shuttle_legs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  run_id uuid not null,
  session_id uuid not null,
  seq integer not null check (seq >= 1),
  from_station_idx smallint not null check (from_station_idx >= 0),
  to_station_idx smallint not null,
  vehicle_id uuid not null,
  driver_id uuid not null,
  departed_at timestamptz not null default now(),
  arrived_at timestamptz,
  status text not null default 'in_transit' check (status in ('in_transit', 'arrived', 'interrupted')),
  continuation_of_leg_id uuid,
  onboard_at_departure smallint not null default 0 check (onboard_at_departure >= 0),
  overdue_flagged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_legs_session_seq_uq unique (session_id, seq),
  constraint shuttle_legs_neighbours check (to_station_idx = from_station_idx + 1),
  constraint shuttle_legs_arrival_shape check ((status = 'arrived') = (arrived_at is not null)),
  constraint shuttle_legs_time_order check (arrived_at is null or arrived_at >= departed_at),
  constraint shuttle_legs_run_fk foreign key (company_id, run_id) references public.shuttle_runs(company_id, id) on delete restrict,
  constraint shuttle_legs_session_fk foreign key (company_id, session_id) references public.shuttle_vehicle_sessions(company_id, id) on delete restrict,
  constraint shuttle_legs_bus_fk foreign key (company_id, vehicle_id) references public.buses(company_id, id) on delete restrict,
  constraint shuttle_legs_driver_fk foreign key (company_id, driver_id) references public.drivers(company_id, id) on delete restrict,
  constraint shuttle_legs_continuation_fk foreign key (company_id, continuation_of_leg_id) references public.shuttle_legs(company_id, id) on delete restrict
);
create unique index shuttle_legs_one_in_transit on public.shuttle_legs (session_id) where status = 'in_transit';
create index shuttle_legs_run_idx on public.shuttle_legs (company_id, run_id, seq);
create index shuttle_legs_bus_idx on public.shuttle_legs (company_id, vehicle_id);
create index shuttle_legs_driver_idx on public.shuttle_legs (company_id, driver_id);
create index shuttle_legs_continuation_idx on public.shuttle_legs (company_id, continuation_of_leg_id) where continuation_of_leg_id is not null;
create index shuttle_legs_overdue_idx on public.shuttle_legs (departed_at) where status = 'in_transit' and overdue_flagged_at is null;

-- ======================= GUARDS =======================
-- legs are history: only arrival, status and the overdue flag may change, and in_transit is the only state that can move
create function app_private.shuttle_leg_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.run_id is distinct from old.run_id
     or new.session_id is distinct from old.session_id or new.seq is distinct from old.seq or new.from_station_idx is distinct from old.from_station_idx
     or new.to_station_idx is distinct from old.to_station_idx or new.vehicle_id is distinct from old.vehicle_id or new.driver_id is distinct from old.driver_id
     or new.departed_at is distinct from old.departed_at or new.continuation_of_leg_id is distinct from old.continuation_of_leg_id
     or new.onboard_at_departure is distinct from old.onboard_at_departure or new.created_at is distinct from old.created_at then
    raise exception 'shuttle legs are history: the snapshot columns cannot change' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not (old.status = 'in_transit' and new.status in ('arrived', 'interrupted')) then
    raise exception 'invalid shuttle leg transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  if old.status <> 'in_transit' and new.arrived_at is distinct from old.arrived_at then
    raise exception 'a finished shuttle leg cannot change its arrival' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_leg_guard() from public, anon, authenticated;

create function app_private.shuttle_run_status_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.day_id is distinct from old.day_id or new.run_no is distinct from old.run_no or new.direction is distinct from old.direction then
    raise exception 'shuttle run identity cannot change' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and not exists (
       select 1 from (values ('planned','active'), ('planned','aborted'), ('active','finished'), ('active','aborted')) v(a, b)
       where v.a = old.status and v.b = new.status) then
    raise exception 'invalid shuttle run transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app_private.shuttle_run_status_guard() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['shuttle_station_visits', 'shuttle_legs'] loop
    execute format('create trigger "000_tenant_guard" before insert or update on public.%I for each row execute function app_private.tenant_guard()', t);
    execute format('create trigger forbid_company_id_change before update on public.%I for each row execute function app_private.forbid_company_id_change()', t);
    execute format('create trigger forbid_modify_row before delete on public.%I for each row execute function app_private.forbid_modify()', t);
    execute format('create trigger forbid_modify_stmt before truncate on public.%I for each statement execute function app_private.forbid_modify()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.has_permission(company_id, %L))', t, 'shuttle.read');
    execute format('create policy platform_select on public.%I for select to authenticated using (app_private.is_platform_user())', t);
  end loop;
end $$;
create trigger shuttle_leg_guard before update on public.shuttle_legs for each row execute function app_private.shuttle_leg_guard();
create trigger shuttle_run_status_guard before update on public.shuttle_runs for each row execute function app_private.shuttle_run_status_guard();

-- ======================= HELPERS =======================
-- day (FOR SHARE) -> session (FOR UPDATE). Returns the locked session; id is null when it does not exist.
create function app_private.shuttle_lock_session(p_session uuid) returns public.shuttle_vehicle_sessions
language plpgsql security definer set search_path = '' as $$
declare v_day uuid; v_s public.shuttle_vehicle_sessions;
begin
  select s.day_id into v_day from public.shuttle_vehicle_sessions s where s.id = p_session;
  if v_day is null then return v_s; end if;
  perform 1 from public.shuttle_operating_days d where d.id = v_day for share;
  select * into v_s from public.shuttle_vehicle_sessions s where s.id = p_session for update;
  return v_s;
end $$;
revoke all on function app_private.shuttle_lock_session(uuid) from public, anon, authenticated;

-- authenticate, validate the key, lock, authorize (operate, or the driver of this session unless manager-side only), rate limit
create function app_private.shuttle_begin(p_session uuid, p_manager_only boolean, p_key text) returns public.shuttle_vehicle_sessions
language plpgsql security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_key is null or length(btrim(p_key)) not between 1 and 100 then raise exception 'invalid input' using errcode = '22023'; end if;
  v_s := app_private.shuttle_lock_session(p_session);
  if v_s.id is null or not (
       app_private.has_permission(v_s.company_id, 'shuttle.operate')
       or (not p_manager_only and app_private.has_permission(v_s.company_id, 'shuttle.drive') and app_private.is_my_shuttle_driver(v_s.company_id, v_s.id))) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  perform app_private.rate_limit_hit('shuttle.depart');
  return v_s;
end $$;
revoke all on function app_private.shuttle_begin(uuid, boolean, text) from public, anon, authenticated;

-- the stored result of an earlier call with the same key (null when new). Same key on another action is a client bug.
create function app_private.shuttle_replay(p_session uuid, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_res jsonb;
begin
  select e.kind, e.payload -> 'result' into v_kind, v_res from public.shuttle_events e where e.session_id = p_session and e.idempotency_key = btrim(p_key);
  if v_kind is null then return null; end if;
  if v_kind <> p_kind then raise exception 'idempotency key already used by another action' using errcode = '22023'; end if;
  return coalesce(v_res, '{}'::jsonb);
end $$;
revoke all on function app_private.shuttle_replay(uuid, text, text) from public, anon, authenticated;

-- day must be open; the client's idea of the state must match; the action must be legal in it
create function app_private.shuttle_assert(p_s public.shuttle_vehicle_sessions, p_expected text, p_allowed text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select d.status from public.shuttle_operating_days d where d.id = p_s.day_id) <> 'open' then
    raise exception 'day is not open' using errcode = '23514'; end if;
  if p_expected is null or p_expected <> p_s.state then raise exception 'stale state: %', p_s.state using errcode = 'P0001'; end if;
  if not (p_s.state = any (p_allowed)) then raise exception 'action not allowed in state %', p_s.state using errcode = '23514'; end if;
end $$;
revoke all on function app_private.shuttle_assert(public.shuttle_vehicle_sessions, text, text[]) from public, anon, authenticated;

-- travel position -> station name (snapshot is in stop order; a backward run reads it from the other end)
create function app_private.shuttle_station_name(p_stations jsonb, p_direction text, p_pos integer) returns text
language sql immutable set search_path = '' as $$
  select p_stations -> (case when p_direction = 'forward' then p_pos else jsonb_array_length(p_stations) - 1 - p_pos end) ->> 'name'
$$;
revoke all on function app_private.shuttle_station_name(jsonb, text, integer) from public, anon, authenticated;

-- ======================= RPCs =======================
create function public.shuttle_open_loading(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shuttle_vehicle_sessions; v_run public.shuttle_runs; v_day public.shuttle_operating_days; v_res jsonb; v_n integer;
  v_visit uuid; v_reversed boolean := false; v_newrun uuid; v_runno integer; v_dir text; v_state text; v_pos integer;
begin
  v_s := app_private.shuttle_begin(p_session, false, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'session.loading_opened', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['ready', 'arrived']);
  select * into v_run from public.shuttle_runs r where r.id = v_s.current_run_id for update;
  select * into v_day from public.shuttle_operating_days d where d.id = v_s.day_id;
  v_n := jsonb_array_length(v_day.stations);
  v_state := 'loading'; v_pos := v_s.station_idx; v_dir := v_run.direction;

  if v_s.state = 'ready' then
    insert into public.shuttle_station_visits (company_id, session_id, run_id, station_idx, arrival_recorded_by, loading_started_at)
    values (v_s.company_id, v_s.id, v_run.id, v_s.station_idx, auth.uid(), now()) returning id into v_visit;
  elsif v_s.station_idx >= v_n - 1 then
    -- end of the run: reverse when allowed, otherwise the session is over
    update public.shuttle_runs set status = 'finished' where id = v_run.id and status = 'active';
    if coalesce((v_day.config ->> 'allow_reverse')::boolean, false) then
      perform pg_advisory_xact_lock(hashtextextended('shuttle_run_no:' || v_s.day_id::text, 0));
      select coalesce(max(r.run_no), 0) + 1 into v_runno from public.shuttle_runs r where r.day_id = v_s.day_id;
      v_dir := case when v_run.direction = 'forward' then 'backward' else 'forward' end;
      insert into public.shuttle_runs (company_id, day_id, run_no, direction, session_id) values (v_s.company_id, v_s.day_id, v_runno, v_dir, v_s.id) returning id into v_newrun;
      insert into public.shuttle_run_segments (run_id, seg_idx, company_id, capacity) select v_newrun, g, v_s.company_id, v_s.capacity from generate_series(0, v_n - 2) g;
      update public.shuttle_vehicle_sessions set current_run_id = v_newrun, station_idx = 0, state = 'loading' where id = v_s.id;
      insert into public.shuttle_station_visits (company_id, session_id, run_id, station_idx, arrival_recorded_by, loading_started_at)
      values (v_s.company_id, v_s.id, v_newrun, 0, auth.uid(), now()) returning id into v_visit;
      perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'run.reversed',
        jsonb_build_object('from_run_id', v_run.id, 'to_run_id', v_newrun, 'direction', v_dir, 'run_no', v_runno));
      v_reversed := true; v_pos := 0;
    else
      update public.shuttle_vehicle_sessions set state = 'completed' where id = v_s.id;
      v_state := 'completed';
    end if;
  else
    update public.shuttle_station_visits set loading_started_at = coalesce(loading_started_at, now()), loading_closed_at = null
     where session_id = v_s.id and run_id = v_run.id and station_idx = v_s.station_idx returning id into v_visit;
    if v_visit is null then raise exception 'no visit for the current station' using errcode = 'XX000'; end if;
  end if;
  if not v_reversed and v_state = 'loading' then
    update public.shuttle_vehicle_sessions set state = 'loading' where id = v_s.id;
  end if;

  v_res := jsonb_build_object('session_id', v_s.id, 'state', v_state, 'run_id', coalesce(v_newrun, v_run.id), 'direction', v_dir, 'station_pos', v_pos,
    'station_name', app_private.shuttle_station_name(v_day.stations, v_dir, v_pos), 'visit_id', v_visit, 'reversed', v_reversed, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'session.loading_opened', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;

create function public.shuttle_close_loading(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions; v_res jsonb; v_visit public.shuttle_station_visits; v_already boolean;
begin
  v_s := app_private.shuttle_begin(p_session, false, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'session.loading_closed', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['loading']);
  select * into v_visit from public.shuttle_station_visits v where v.session_id = v_s.id and v.run_id = v_s.current_run_id and v.station_idx = v_s.station_idx for update;
  if not found then raise exception 'no visit for the current station' using errcode = 'XX000'; end if;
  v_already := v_visit.loading_closed_at is not null;
  update public.shuttle_station_visits set loading_closed_at = coalesce(loading_closed_at, now()) where id = v_visit.id;
  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'loading', 'visit_id', v_visit.id, 'already_closed', v_already, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'session.loading_closed', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;

create function public.shuttle_depart(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shuttle_vehicle_sessions; v_run public.shuttle_runs; v_day public.shuttle_operating_days; v_visit public.shuttle_station_visits;
  v_res jsonb; v_n integer; v_seq integer; v_leg uuid;
begin
  v_s := app_private.shuttle_begin(p_session, false, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'leg.departed', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['loading']);
  select * into v_run from public.shuttle_runs r where r.id = v_s.current_run_id for update;
  select * into v_day from public.shuttle_operating_days d where d.id = v_s.day_id;
  v_n := jsonb_array_length(v_day.stations);
  if v_s.station_idx >= v_n - 1 then raise exception 'nothing ahead of the last station' using errcode = '23514'; end if;
  select * into v_visit from public.shuttle_station_visits v where v.session_id = v_s.id and v.run_id = v_run.id and v.station_idx = v_s.station_idx for update;
  if not found then raise exception 'no visit for the current station' using errcode = 'XX000'; end if;

  update public.shuttle_station_visits set loading_closed_at = coalesce(loading_closed_at, now()), departed_at = now() where id = v_visit.id;
  select coalesce(max(l.seq), 0) + 1 into v_seq from public.shuttle_legs l where l.session_id = v_s.id;
  insert into public.shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id)
  values (v_s.company_id, v_run.id, v_s.id, v_seq, v_s.station_idx, v_s.station_idx + 1, v_s.vehicle_id, v_s.current_driver_id) returning id into v_leg;
  update public.shuttle_runs set status = 'active' where id = v_run.id and status = 'planned';
  update public.shuttle_vehicle_sessions set state = 'in_transit' where id = v_s.id;

  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'in_transit', 'leg_id', v_leg, 'seq', v_seq, 'run_id', v_run.id,
    'from_pos', v_s.station_idx, 'to_pos', v_s.station_idx + 1,
    'from_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_s.station_idx),
    'to_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_s.station_idx + 1), 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'leg.departed', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;

-- p_occurred_at: when the bus really arrived (offline press, forgotten press). More than 60 s ago = late, reason required.
create function public.shuttle_arrive(p_session uuid, p_expected_state text, p_key text, p_occurred_at timestamptz default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shuttle_vehicle_sessions; v_run public.shuttle_runs; v_day public.shuttle_operating_days; v_leg public.shuttle_legs;
  v_res jsonb; v_at timestamptz; v_late boolean; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_visit uuid;
begin
  v_s := app_private.shuttle_begin(p_session, false, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'leg.arrived', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['in_transit']);
  select * into v_leg from public.shuttle_legs l where l.session_id = v_s.id and l.status = 'in_transit' for update;
  if not found then raise exception 'no leg in transit' using errcode = 'XX000'; end if;
  select * into v_run from public.shuttle_runs r where r.id = v_leg.run_id for update;
  select * into v_day from public.shuttle_operating_days d where d.id = v_s.day_id;

  v_at := coalesce(p_occurred_at, now());
  if v_at > now() + interval '5 seconds' or v_at < v_leg.departed_at then raise exception 'invalid arrival time' using errcode = '22023'; end if;
  v_at := least(v_at, now());
  v_late := p_occurred_at is not null and p_occurred_at < now() - interval '60 seconds';
  if v_late and (v_reason is null or length(v_reason) not between 3 and 300) then raise exception 'reason required' using errcode = '22023'; end if;
  if v_reason is not null and length(v_reason) > 300 then raise exception 'reason required' using errcode = '22023'; end if;

  update public.shuttle_legs set status = 'arrived', arrived_at = v_at where id = v_leg.id;
  insert into public.shuttle_station_visits (company_id, session_id, run_id, station_idx, arrived_at, arrival_recorded_by, late_recorded)
  values (v_s.company_id, v_s.id, v_leg.run_id, v_leg.to_station_idx, v_at, auth.uid(), v_late) returning id into v_visit;
  update public.shuttle_vehicle_sessions set state = 'arrived', station_idx = v_leg.to_station_idx where id = v_s.id;

  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'arrived', 'leg_id', v_leg.id, 'visit_id', v_visit, 'station_pos', v_leg.to_station_idx,
    'station_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_leg.to_station_idx), 'late', v_late,
    'last_station', v_leg.to_station_idx >= jsonb_array_length(v_day.stations) - 1, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'leg.arrived',
    jsonb_build_object('result', v_res, 'late', v_late, 'reason', v_reason, 'occurred_at', v_at), p_occurred_at, btrim(p_key));
  return v_res;
end $$;

create function public.shuttle_set_out_of_service(p_session uuid, p_expected_state text, p_key text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions; v_res jsonb; v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_s := app_private.shuttle_begin(p_session, true, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'session.out_of_service', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['ready', 'loading', 'arrived']);
  if length(v_reason) not between 3 and 300 then raise exception 'reason required' using errcode = '22023'; end if;
  update public.shuttle_vehicle_sessions set state = 'out_of_service', out_of_service_from = case when v_s.state = 'ready' then 'ready' else 'arrived' end where id = v_s.id;
  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'out_of_service', 'resumes_as', case when v_s.state = 'ready' then 'ready' else 'arrived' end, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'session.out_of_service', jsonb_build_object('result', v_res, 'reason', v_reason, 'was', v_s.state), null, btrim(p_key));
  return v_res;
end $$;

create function public.shuttle_return_to_service(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions; v_res jsonb; v_to text;
begin
  v_s := app_private.shuttle_begin(p_session, true, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'session.returned', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['out_of_service']);
  v_to := coalesce(v_s.out_of_service_from, 'arrived');
  update public.shuttle_vehicle_sessions set state = v_to, out_of_service_from = null where id = v_s.id;
  v_res := jsonb_build_object('session_id', v_s.id, 'state', v_to, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'session.returned', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;

-- Manager side. The run ends with the session: never started = aborted, started = finished.
create function public.shuttle_end_session(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions; v_res jsonb;
begin
  v_s := app_private.shuttle_begin(p_session, true, p_key);
  v_res := app_private.shuttle_replay(v_s.id, 'session.ended', p_key);
  if v_res is not null then return v_res || jsonb_build_object('replayed', true); end if;
  perform app_private.shuttle_assert(v_s, p_expected_state, array['ready', 'loading', 'arrived']);
  perform 1 from public.shuttle_runs r where r.id = v_s.current_run_id for update;
  update public.shuttle_runs set status = case when status = 'planned' then 'aborted' else 'finished' end where id = v_s.current_run_id and status in ('planned', 'active');
  update public.shuttle_vehicle_sessions set state = 'completed' where id = v_s.id;
  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'completed', 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'session.ended', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;

-- Read side for the vehicle screen (staff with shuttle.read).
create function public.shuttle_vehicle_detail(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.shuttle_vehicle_sessions; v_run public.shuttle_runs; v_day public.shuttle_operating_days; v_n integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_s from public.shuttle_vehicle_sessions s where s.id = p_session;
  if not found or not app_private.has_permission(v_s.company_id, 'shuttle.read') then raise exception 'session not found' using errcode = 'P0002'; end if;
  select * into v_run from public.shuttle_runs r where r.id = v_s.current_run_id;
  select * into v_day from public.shuttle_operating_days d where d.id = v_s.day_id;
  v_n := jsonb_array_length(v_day.stations);
  return jsonb_build_object(
    'session', jsonb_build_object('id', v_s.id, 'state', v_s.state, 'station_pos', v_s.station_idx, 'capacity', v_s.capacity, 'out_of_service_from', v_s.out_of_service_from,
      'day_id', v_day.id, 'day_status', v_day.status, 'service_date', v_day.service_date,
      'station_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_s.station_idx),
      'bus_id', v_s.vehicle_id, 'plate', (select b.plate_number from public.buses b where b.id = v_s.vehicle_id),
      'driver_id', v_s.current_driver_id, 'driver_name', (select d.full_name from public.drivers d where d.id = v_s.current_driver_id)),
    'run', jsonb_build_object('id', v_run.id, 'run_no', v_run.run_no, 'direction', v_run.direction, 'status', v_run.status),
    'stations', (select jsonb_agg(app_private.shuttle_station_name(v_day.stations, v_run.direction, g) order by g) from generate_series(0, v_n - 1) g),
    'visit', (select jsonb_build_object('id', v.id, 'station_pos', v.station_idx, 'arrived_at', v.arrived_at, 'loading_started_at', v.loading_started_at,
                'loading_closed_at', v.loading_closed_at, 'late_recorded', v.late_recorded)
              from public.shuttle_station_visits v where v.session_id = v_s.id and v.run_id = v_run.id and v.station_idx = v_s.station_idx),
    'leg', (select jsonb_build_object('id', l.id, 'seq', l.seq, 'from_pos', l.from_station_idx, 'to_pos', l.to_station_idx, 'departed_at', l.departed_at,
                'overdue', l.overdue_flagged_at is not null) from public.shuttle_legs l where l.session_id = v_s.id and l.status = 'in_transit'),
    'legs', coalesce((select jsonb_agg(x order by x.seq desc) from (
      select l.seq, l.status, l.departed_at, l.arrived_at, r.run_no, r.direction, l.from_station_idx as from_pos, l.to_station_idx as to_pos,
             app_private.shuttle_station_name(v_day.stations, r.direction, l.from_station_idx) as from_name,
             app_private.shuttle_station_name(v_day.stations, r.direction, l.to_station_idx) as to_name
      from public.shuttle_legs l join public.shuttle_runs r on r.id = l.run_id where l.session_id = v_s.id order by l.seq desc limit 30) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(y order by y.at desc) from (
      select e.kind, e.recorded_at as at, e.actor_role, e.payload ->> 'reason' as reason
      from public.shuttle_events e where e.session_id = v_s.id order by e.recorded_at desc, e.id desc limit 30) y), '[]'::jsonb));
end $$;

-- ======================= OVERDUE JOB =======================
-- A leg in transit for more than twice its expected time (stop offsets of the day snapshot; 20 minutes when they say nothing) is flagged once.
create function app_private.shuttle_flag_overdue_legs() returns void
language plpgsql security definer set search_path = '' as $$
declare r record; v_expected integer; v_elapsed integer;
begin
  for r in
    select l.id as leg_id, l.company_id, l.session_id, l.departed_at, l.from_station_idx, l.to_station_idx, run.direction, d.id as day_id, d.stations
    from public.shuttle_legs l
    join public.shuttle_runs run on run.id = l.run_id
    join public.shuttle_operating_days d on d.id = run.day_id
    where l.status = 'in_transit' and l.overdue_flagged_at is null and d.status = 'open' and l.departed_at < now() - interval '10 minutes'
    order by l.departed_at limit 500
  loop
    v_expected := abs(coalesce((r.stations -> (case when r.direction = 'forward' then r.to_station_idx else jsonb_array_length(r.stations) - 1 - r.to_station_idx end) ->> 'offset_minutes')::integer, 0)
                    - coalesce((r.stations -> (case when r.direction = 'forward' then r.from_station_idx else jsonb_array_length(r.stations) - 1 - r.from_station_idx end) ->> 'offset_minutes')::integer, 0));
    if v_expected < 1 then v_expected := 20; end if;
    v_elapsed := floor(extract(epoch from (now() - r.departed_at)) / 60);
    if v_elapsed > 2 * v_expected then
      update public.shuttle_legs set overdue_flagged_at = now() where id = r.leg_id and overdue_flagged_at is null and status = 'in_transit';
      if found then
        insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_role, payload)
        values (r.company_id, r.day_id, r.session_id, 'leg.overdue', 'system', jsonb_build_object('leg_id', r.leg_id, 'expected_minutes', v_expected, 'elapsed_minutes', v_elapsed));
      end if;
    end if;
  end loop;
end $$;
revoke all on function app_private.shuttle_flag_overdue_legs() from public, anon, authenticated;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('shuttle-overdue-legs', 'shuttle_flag_overdue_legs', 60, 900) on conflict (name) do nothing;

revoke all on function public.shuttle_open_loading(uuid, text, text), public.shuttle_close_loading(uuid, text, text), public.shuttle_depart(uuid, text, text),
  public.shuttle_arrive(uuid, text, text, timestamptz, text), public.shuttle_set_out_of_service(uuid, text, text, text),
  public.shuttle_return_to_service(uuid, text, text), public.shuttle_end_session(uuid, text, text), public.shuttle_vehicle_detail(uuid) from public, anon;
grant execute on function public.shuttle_open_loading(uuid, text, text), public.shuttle_close_loading(uuid, text, text), public.shuttle_depart(uuid, text, text),
  public.shuttle_arrive(uuid, text, text, timestamptz, text), public.shuttle_set_out_of_service(uuid, text, text, text),
  public.shuttle_return_to_service(uuid, text, text), public.shuttle_end_session(uuid, text, text), public.shuttle_vehicle_detail(uuid) to authenticated;
