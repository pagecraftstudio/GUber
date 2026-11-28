-- 0077: Continuous Shuttle, phase S4a - capacity core (bookings, the decision log, the ONE writer of segment counters, decide, staff cancel, drift check).
-- Builds on 0074-0076. trips, bookings, tickets and every other existing table are NOT touched.
-- There is NO customer entry point yet (S4b) and NO ticket (S4c): this slice exists so the capacity engine can be raced before any screen exists.
--
-- WHAT THIS ADDS
--   Tables  shuttle_bookings           one row per request/walk-in: run, from_pos -> to_pos (TRAVEL positions), seats, status, who decided and when.
--           shuttle_booking_decisions  append-only log of EVERY decide/cancel attempt, the losers too (outcome, actor, state seen).
--   Writer  app_private.shuttle_apply_segments(run, from_pos, to_pos, seats, sign): the ONLY code that writes shuttle_run_segments.confirmed_seats.
--           The CHECK 0..capacity on the segment is the backstop behind it.
--   Check   app_private.shuttle_segment_drift(): rows where a stored counter differs from the sum of live bookings over that segment. Must be empty.
--   RPCs    shuttle_decide_booking(booking, 'confirm'|'reject', key, reason), shuttle_cancel_booking(booking, key, reason). Both need shuttle.confirm.
--
-- RULES (plan sections 8, 9, 20)
--   * A request holds NO seat. Only a confirmed (or boarded) booking is counted in the segments.
--   * Lock order, always: run -> booking. (S3 locks day -> session -> run; S4b's depart hook will lock run -> bookings, so the order is consistent.)
--   * FIRST WINS. A decision applies only while the booking is still 'requested'. Everything else is a NORMAL answer, not an exception, because an
--     exception would roll back the log row: {outcome:'already_processed'|'no_capacity'|'run_closed'|'too_late'} plus who decided first and when.
--   * Every attempt is logged in shuttle_booking_decisions (and a replay of the same key returns the stored answer with replayed:true).
--   * Cancelling a confirmed booking releases exactly the segments it held, through the same writer.
--   * Counted statuses = confirmed, boarded. Drift compares against exactly those.
--
-- DEVIATIONS FROM THE PLAN / THE S4 SPLIT (all intended)
--   * The permission is shuttle.confirm (seeded in 0074: owner, manager, booking staff), not shuttle.operate. Operations staff can run vehicles but not decide bookings.
--   * Statuses expired, no_show, boarded, completed exist in the CHECK now so S4b/S5 need no table rewrite; S4a never produces them.
--   * No staff "create request" RPC as a test seam: suites and the race script insert requested rows as admin, so no unused public RPC ships.
--
-- EXISTING OBJECTS CHANGED: none. New objects only.
-- ROLLBACK (only while no shuttle bookings matter):
--   drop function public.shuttle_cancel_booking(uuid, text, text), public.shuttle_decide_booking(uuid, text, text, text),
--     app_private.shuttle_cancel_booking_impl(uuid, text, text), app_private.shuttle_decide_booking_impl(uuid, text, text, text),
--     app_private.shuttle_segment_drift(), app_private.shuttle_apply_segments(uuid, integer, integer, integer, integer), app_private.shuttle_booking_guard();
--   drop table public.shuttle_booking_decisions, public.shuttle_bookings;
-- RUNNER NOTE: apply before deploying any code that calls these RPCs.
set search_path = public, extensions;

-- ======================= TABLES =======================
create table public.shuttle_bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  day_id uuid not null,
  run_id uuid not null,
  customer_id uuid,
  from_pos smallint not null check (from_pos >= 0),
  to_pos smallint not null,
  seats smallint not null check (seats between 1 and 20),
  status text not null default 'requested'
    check (status in ('requested', 'confirmed', 'rejected', 'cancelled', 'expired', 'no_show', 'boarded', 'completed')),
  source text not null default 'request' check (source in ('request', 'walk_in', 'staff')),
  request_key text check (request_key is null or length(request_key) between 1 and 100),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text check (decision_reason is null or length(decision_reason) between 1 and 300),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_bookings_range check (to_pos > from_pos),
  constraint shuttle_bookings_day_fk foreign key (company_id, day_id) references public.shuttle_operating_days(company_id, id) on delete restrict,
  constraint shuttle_bookings_run_fk foreign key (company_id, run_id) references public.shuttle_runs(company_id, id) on delete restrict,
  constraint shuttle_bookings_customer_fk foreign key (company_id, customer_id) references public.customers(company_id, id) on delete restrict
);
create unique index shuttle_bookings_request_key_uq on public.shuttle_bookings (company_id, request_key) where request_key is not null;
create index shuttle_bookings_run_status_idx on public.shuttle_bookings (company_id, run_id, status);
create index shuttle_bookings_day_idx on public.shuttle_bookings (company_id, day_id);
create index shuttle_bookings_customer_idx on public.shuttle_bookings (company_id, customer_id) where customer_id is not null;
create index shuttle_bookings_pending_idx on public.shuttle_bookings (company_id, run_id, requested_at) where status = 'requested';

create table public.shuttle_booking_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  booking_id uuid not null,
  run_id uuid not null,
  action text not null check (action in ('confirm', 'reject', 'cancel')),
  outcome text not null check (outcome in ('confirmed', 'rejected', 'cancelled', 'already_processed', 'no_capacity', 'run_closed', 'too_late')),
  prior_status text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  actor_role text not null check (length(actor_role) between 1 and 40),
  reason text check (reason is null or length(reason) between 1 and 300),
  idempotency_key text not null check (length(idempotency_key) between 1 and 100),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  unique (company_id, id),
  constraint shuttle_decisions_booking_key_uq unique (booking_id, idempotency_key),
  constraint shuttle_decisions_booking_fk foreign key (company_id, booking_id) references public.shuttle_bookings(company_id, id) on delete restrict,
  constraint shuttle_decisions_run_fk foreign key (company_id, run_id) references public.shuttle_runs(company_id, id) on delete restrict
);
create index shuttle_decisions_booking_idx on public.shuttle_booking_decisions (company_id, booking_id, created_at);
create index shuttle_decisions_run_idx on public.shuttle_booking_decisions (company_id, run_id, created_at);

-- ======================= GUARDS =======================
-- insert: the booking must lie inside the run (one segment row per hop) and the day/run must agree.
-- update: identity never changes; status moves only along legal edges.
create function app_private.shuttle_booking_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.shuttle_runs r where r.id = new.run_id and r.company_id = new.company_id and r.day_id = new.day_id) then
      raise exception 'booking run does not belong to the day' using errcode = '23514'; end if;
    if (select count(*) from public.shuttle_run_segments g where g.run_id = new.run_id and g.seg_idx >= new.from_pos and g.seg_idx < new.to_pos) <> new.to_pos - new.from_pos then
      raise exception 'booking stations are outside the run' using errcode = '23514'; end if;
    return new;
  end if;
  if new.day_id is distinct from old.day_id or new.run_id is distinct from old.run_id or new.customer_id is distinct from old.customer_id
     or new.from_pos is distinct from old.from_pos or new.to_pos is distinct from old.to_pos or new.seats is distinct from old.seats
     or new.source is distinct from old.source or new.request_key is distinct from old.request_key or new.requested_at is distinct from old.requested_at then
    raise exception 'a shuttle booking cannot change its run, stations, seats or owner' using errcode = '23514'; end if;
  if new.status is distinct from old.status and not exists (
       select 1 from (values ('requested','confirmed'), ('requested','rejected'), ('requested','cancelled'), ('requested','expired'),
                             ('confirmed','cancelled'), ('confirmed','no_show'), ('confirmed','boarded'), ('boarded','completed')) v(a, b)
       where v.a = old.status and v.b = new.status) then
    raise exception 'invalid shuttle booking transition % -> %', old.status, new.status using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function app_private.shuttle_booking_guard() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['shuttle_bookings', 'shuttle_booking_decisions'] loop
    execute format('create trigger "000_tenant_guard" before insert or update on public.%I for each row execute function app_private.tenant_guard()', t);
    execute format('create trigger forbid_company_id_change before update on public.%I for each row execute function app_private.forbid_company_id_change()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy tenant_select on public.%I for select to authenticated using (app_private.has_permission(company_id, %L))', t, 'shuttle.read');
    execute format('create policy platform_select on public.%I for select to authenticated using (app_private.is_platform_user())', t);
  end loop;
end $$;
create trigger set_updated_at before update on public.shuttle_bookings for each row execute function app_private.set_updated_at();
create trigger shuttle_booking_guard before insert or update on public.shuttle_bookings for each row execute function app_private.shuttle_booking_guard();
create trigger forbid_modify_row before delete on public.shuttle_bookings for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on public.shuttle_bookings for each statement execute function app_private.forbid_modify();
create trigger forbid_modify_row before update or delete on public.shuttle_booking_decisions for each row execute function app_private.forbid_modify();
create trigger forbid_modify_stmt before truncate on public.shuttle_booking_decisions for each statement execute function app_private.forbid_modify();

-- ======================= THE ONE WRITER OF SEGMENT COUNTERS =======================
-- p_sign = +1 (hold seats) or -1 (release). Caller holds the run row lock. Every segment of [from, to) must exist, and the segment CHECK
-- (0..capacity) is the last line of defence: an over-booking attempt cannot commit even if a caller forgot the capacity test.
create function app_private.shuttle_apply_segments(p_run uuid, p_from integer, p_to integer, p_seats integer, p_sign integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  if p_sign not in (1, -1) or p_seats < 1 or p_to <= p_from then raise exception 'invalid segment change' using errcode = '22023'; end if;
  update public.shuttle_run_segments set confirmed_seats = confirmed_seats + p_sign * p_seats
   where run_id = p_run and seg_idx >= p_from and seg_idx < p_to;
  get diagnostics v_rows = row_count;
  if v_rows <> p_to - p_from then raise exception 'segment rows missing for run' using errcode = '55000'; end if;
end $$;
revoke all on function app_private.shuttle_apply_segments(uuid, integer, integer, integer, integer) from public, anon, authenticated;

-- stored counter vs the sum of live (confirmed, boarded) bookings over that segment. Empty = healthy.
create function app_private.shuttle_segment_drift() returns table (run_id uuid, seg_idx smallint, stored smallint, computed bigint)
language sql stable security definer set search_path = '' as $$
  select g.run_id, g.seg_idx, g.confirmed_seats, coalesce(sum(b.seats), 0)::bigint
  from public.shuttle_run_segments g
  left join public.shuttle_bookings b on b.run_id = g.run_id and b.status in ('confirmed', 'boarded') and g.seg_idx >= b.from_pos and g.seg_idx < b.to_pos
  group by g.run_id, g.seg_idx, g.confirmed_seats
  having g.confirmed_seats <> coalesce(sum(b.seats), 0)
$$;
revoke all on function app_private.shuttle_segment_drift() from public, anon, authenticated;

-- ======================= DECIDE / CANCEL =======================
create function app_private.shuttle_decide_booking_impl(p_booking uuid, p_decision text, p_key text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := btrim(coalesce(p_key, '')); v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_company uuid; v_run uuid; b public.shuttle_bookings%rowtype; v_run_row public.shuttle_runs%rowtype; v_prior text;
  v_outcome text; v_res jsonb; v_old record; v_decider text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_decision not in ('confirm', 'reject') or length(v_key) not between 1 and 100 or (v_reason is not null and length(v_reason) > 300) then
    raise exception 'invalid input' using errcode = '22023'; end if;
  select bk.company_id, bk.run_id into v_company, v_run from public.shuttle_bookings bk where bk.id = p_booking;
  if v_company is null or not app_private.has_permission(v_company, 'shuttle.confirm') then raise exception 'booking not found' using errcode = 'P0002'; end if;

  -- lock order: run -> booking
  select * into v_run_row from public.shuttle_runs r where r.id = v_run for update;
  select * into b from public.shuttle_bookings bk where bk.id = p_booking for update;
  if not app_private.has_permission(v_company, 'shuttle.confirm') then raise exception 'booking not found' using errcode = 'P0002'; end if;

  select d.action, d.result into v_old from public.shuttle_booking_decisions d where d.booking_id = p_booking and d.idempotency_key = v_key;
  if found then
    if v_old.action <> p_decision then raise exception 'idempotency key already used by another action' using errcode = '22023'; end if;
    return v_old.result || jsonb_build_object('replayed', true);
  end if;

  v_prior := b.status;
  if b.status <> 'requested' then
    v_outcome := 'already_processed';
  elsif p_decision = 'reject' then
    v_outcome := 'rejected';
  elsif v_run_row.status not in ('planned', 'active') then
    v_outcome := 'run_closed';
  elsif exists (select 1 from public.shuttle_legs l where l.run_id = b.run_id and l.from_station_idx >= b.from_pos and l.status <> 'interrupted') then
    v_outcome := 'too_late';                    -- the bus has already left the boarding station of this request
  elsif exists (select 1 from public.shuttle_run_segments g where g.run_id = b.run_id and g.seg_idx >= b.from_pos and g.seg_idx < b.to_pos
                  and g.confirmed_seats + b.seats > g.capacity) then
    v_outcome := 'no_capacity';
  else
    v_outcome := 'confirmed';
  end if;

  if v_outcome = 'confirmed' then
    perform app_private.shuttle_apply_segments(b.run_id, b.from_pos, b.to_pos, b.seats, 1);
    update public.shuttle_bookings set status = 'confirmed', decided_at = now(), decided_by = auth.uid(), decision_reason = v_reason where id = b.id;
  elsif v_outcome = 'rejected' then
    update public.shuttle_bookings set status = 'rejected', decided_at = now(), decided_by = auth.uid(), decision_reason = v_reason where id = b.id;
  end if;

  select pr.full_name into v_decider from public.profiles pr where pr.id = case when v_outcome = 'already_processed' then coalesce(b.decided_by, b.cancelled_by) end;
  select * into b from public.shuttle_bookings bk where bk.id = p_booking;
  v_res := jsonb_build_object('outcome', v_outcome, 'booking_id', b.id, 'status', b.status, 'replayed', false,
            'decided_at', case when v_outcome = 'already_processed' then coalesce(b.decided_at, b.cancelled_at) end, 'decided_by_name', v_decider);
  insert into public.shuttle_booking_decisions (company_id, booking_id, run_id, action, outcome, prior_status, decided_by, actor_role, reason, idempotency_key, result)
  values (v_company, b.id, b.run_id, p_decision, v_outcome, v_prior, auth.uid(), app_private.shuttle_actor_role(v_company), v_reason, v_key, v_res);
  if v_outcome in ('confirmed', 'rejected') then
    perform app_private.shuttle_log(v_company, b.day_id, null, 'booking.' || v_outcome, jsonb_build_object('booking_id', b.id, 'run_id', b.run_id, 'seats', b.seats, 'from_pos', b.from_pos, 'to_pos', b.to_pos));
    perform app_private.write_audit('company_user', v_company, 'shuttle_booking.' || v_outcome, 'shuttle_booking', b.id,
      jsonb_build_object('run_id', b.run_id, 'seats', b.seats, 'from_pos', b.from_pos, 'to_pos', b.to_pos));
  end if;
  return v_res;
end $$;
revoke all on function app_private.shuttle_decide_booking_impl(uuid, text, text, text) from public, anon, authenticated;

-- Staff cancel: requested -> cancelled (no counters), confirmed -> cancelled (releases exactly its segments). Boarded and finished bookings are not cancelled here.
create function app_private.shuttle_cancel_booking_impl(p_booking uuid, p_key text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := btrim(coalesce(p_key, '')); v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_company uuid; v_run uuid; b public.shuttle_bookings%rowtype; v_prior text; v_outcome text; v_res jsonb; v_old record; v_decider text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(v_key) not between 1 and 100 or v_reason is null or length(v_reason) > 300 then raise exception 'invalid input' using errcode = '22023'; end if;
  select bk.company_id, bk.run_id into v_company, v_run from public.shuttle_bookings bk where bk.id = p_booking;
  if v_company is null or not app_private.has_permission(v_company, 'shuttle.confirm') then raise exception 'booking not found' using errcode = 'P0002'; end if;
  perform 1 from public.shuttle_runs r where r.id = v_run for update;                                         -- run -> booking
  select * into b from public.shuttle_bookings bk where bk.id = p_booking for update;
  if not app_private.has_permission(v_company, 'shuttle.confirm') then raise exception 'booking not found' using errcode = 'P0002'; end if;
  select d.action, d.result into v_old from public.shuttle_booking_decisions d where d.booking_id = p_booking and d.idempotency_key = v_key;
  if found then
    if v_old.action <> 'cancel' then raise exception 'idempotency key already used by another action' using errcode = '22023'; end if;
    return v_old.result || jsonb_build_object('replayed', true);
  end if;
  v_prior := b.status;
  if b.status in ('requested', 'confirmed') then
    if b.status = 'confirmed' then perform app_private.shuttle_apply_segments(b.run_id, b.from_pos, b.to_pos, b.seats, -1); end if;
    update public.shuttle_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), decision_reason = coalesce(decision_reason, v_reason) where id = b.id;
    v_outcome := 'cancelled';
  else
    v_outcome := 'already_processed';
  end if;
  select pr.full_name into v_decider from public.profiles pr where pr.id = case when v_outcome = 'already_processed' then coalesce(b.cancelled_by, b.decided_by) end;
  select * into b from public.shuttle_bookings bk where bk.id = p_booking;
  v_res := jsonb_build_object('outcome', v_outcome, 'booking_id', b.id, 'status', b.status, 'replayed', false,
            'decided_at', case when v_outcome = 'already_processed' then coalesce(b.cancelled_at, b.decided_at) end, 'decided_by_name', v_decider);
  insert into public.shuttle_booking_decisions (company_id, booking_id, run_id, action, outcome, prior_status, decided_by, actor_role, reason, idempotency_key, result)
  values (v_company, b.id, b.run_id, 'cancel', v_outcome, v_prior, auth.uid(), app_private.shuttle_actor_role(v_company), v_reason, v_key, v_res);
  if v_outcome = 'cancelled' then
    perform app_private.shuttle_log(v_company, b.day_id, null, 'booking.cancelled', jsonb_build_object('booking_id', b.id, 'run_id', b.run_id, 'prior_status', v_prior, 'seats', b.seats));
    perform app_private.write_audit('company_user', v_company, 'shuttle_booking.cancelled', 'shuttle_booking', b.id, jsonb_build_object('run_id', b.run_id, 'prior_status', v_prior, 'seats', b.seats));
  end if;
  return v_res;
end $$;
revoke all on function app_private.shuttle_cancel_booking_impl(uuid, text, text) from public, anon, authenticated;

-- Public wrappers: rate limit (bucket shuttle.decide, 0074), then the impl. Same split as 0020 / 0057.
create function public.shuttle_decide_booking(p_booking_id uuid, p_decision text, p_key text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('shuttle.decide');
  return app_private.shuttle_decide_booking_impl(p_booking_id, p_decision, p_key, p_reason);
end $$;
create function public.shuttle_cancel_booking(p_booking_id uuid, p_key text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('shuttle.decide');
  return app_private.shuttle_cancel_booking_impl(p_booking_id, p_key, p_reason);
end $$;
revoke all on function public.shuttle_decide_booking(uuid, text, text, text) from public, anon;
revoke all on function public.shuttle_cancel_booking(uuid, text, text) from public, anon;
grant execute on function public.shuttle_decide_booking(uuid, text, text, text) to authenticated;
grant execute on function public.shuttle_cancel_booking(uuid, text, text) to authenticated;
