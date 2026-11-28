-- 0078: Continuous Shuttle, phase S4b - request intake. Builds on 0074-0077. trips, bookings, tickets and every scheduled-trip object are NOT touched.
-- A customer can now ASK for a seat. A request holds NO seat and never touches shuttle_run_segments: only shuttle_decide_booking (0077) does.
--
-- WHAT THIS ADDS
--   Column  shuttle_bookings.expires_at (nullable, additive): set by a request; the job falls back to requested_at + the day's request_ttl_minutes when null.
--   Gate    app_private.shuttle_run_gate(run): the ONE place that says whether a run still takes requests and from which position. Used by request and availability.
--   RPCs    shuttle_request_booking        customer. Rate limit, captcha pass (purpose 'booking', consumed only after every rule passed), idempotency key.
--           shuttle_cancel_my_booking      customer. requested -> cancelled (no counters); confirmed -> cancelled (releases exactly its segments). Not after boarding.
--           shuttle_my_bookings            customer. Only own rows; friendly state codes ('awaiting_confirmation' for a request).
--           shuttle_run_availability       any signed-in user. Runs of a service's day with approximate free seats per hop. No plates, no driver names.
--   Sweep   app_private.shuttle_sweep_at_departure + shuttle_depart REPLACED (same signature, same body, plus the hook): when a bus leaves position p,
--           requests that board at or before p become 'expired', confirmed bookings that did not board at or before p become 'no_show' and release their
--           segments through the one writer. The leg also records onboard_at_departure (boarded bookings covering the hop; none exist until S5).
--   Job     expire-shuttle-requests (every minute): expires requests past their TTL, and requests of a run/day that is no longer open.
--
-- RULES
--   * Lock order is unchanged: day -> session -> run -> booking. Request, customer cancel, decide, sweep and the job all take the RUN row first, so a request
--     validated before a departure either commits before it (and is swept) or waits and then fails the gate. A request can never be left behind a departed bus.
--   * Customer-facing refusals use errcode 23514 and a stable message prefix the UI maps: not_accepting:<reason>, station_passed, full, too_many_open_requests,
--     invalid_seats, invalid_stations. A request for a segment that is full right now is refused (the customer must not be misled); confirm re-checks anyway.
--   * A request is refused when the run is out of service, closed, has no stop ahead, or the boarding station is behind the bus or its loading is closed.
--   * At most 5 open (requested) requests per customer per company.
--   * Customers get a customers row linked to their account on the first request (same rule as create_my_booking_impl: a phone that already belongs to another row
--     of the company is refused with 23505, never attached silently).
--   * Cancel after boarding is NOT allowed (decision Q7). The result is a normal answer {outcome:'already_processed'}.
--   * Expired / no_show are written by the system; they are logged in shuttle_events (actor_role 'system'), not in shuttle_booking_decisions (human decisions).
--
-- DEFERRED: tickets (S4c), walk-ins (S4c), boarding (S5; until then every confirmed booking whose bus leaves its station becomes no_show), notifications (S8).
-- EXISTING OBJECTS CHANGED: shuttle_bookings gets one nullable column; shuttle_depart (0076) is replaced with the identical body plus the sweep call and
--   the onboard count. Nothing else.
-- ROLLBACK (only while no shuttle bookings matter):
--   delete from app_private.jobs where name = 'expire-shuttle-requests';
--   re-create public.shuttle_depart from 0076;
--   drop function public.shuttle_run_availability(uuid, date), public.shuttle_my_bookings(integer), public.shuttle_cancel_my_booking(uuid, text),
--     public.shuttle_request_booking(uuid, integer, integer, integer, text, text, text), app_private.expire_shuttle_requests(),
--     app_private.shuttle_sweep_at_departure(uuid, uuid, uuid, uuid, integer), app_private.shuttle_cancel_my_booking_impl(uuid, text),
--     app_private.shuttle_request_booking_impl(uuid, integer, integer, integer, text, text, text), app_private.shuttle_booking_view(uuid),
--     app_private.shuttle_run_gate(uuid);
--   alter table public.shuttle_bookings drop column expires_at;
-- RUNNER NOTE: apply before deploying any code that calls these RPCs.
set search_path = public, extensions;

alter table public.shuttle_bookings add column expires_at timestamptz;

-- ======================= GATE: does this run take requests, and from where? =======================
create function app_private.shuttle_run_gate(p_run uuid) returns table (first_pos integer, reason text, stations integer)
language plpgsql stable security definer set search_path = '' as $$
declare r public.shuttle_runs%rowtype; s public.shuttle_vehicle_sessions%rowtype; d public.shuttle_operating_days%rowtype; v_closed boolean; v_n integer; v_first integer;
begin
  select * into r from public.shuttle_runs x where x.id = p_run;
  if not found then return query select null::integer, 'run_not_found'::text, 0; return; end if;
  select * into d from public.shuttle_operating_days x where x.id = r.day_id;
  select * into s from public.shuttle_vehicle_sessions x where x.id = r.session_id;
  v_n := jsonb_array_length(d.stations);
  if d.status <> 'open' then return query select null::integer, 'day_closed'::text, v_n; return; end if;
  if r.status not in ('planned', 'active') or s.state = 'completed' or s.current_run_id is distinct from r.id then return query select null::integer, 'run_closed'::text, v_n; return; end if;
  if s.state = 'out_of_service' then return query select null::integer, 'out_of_service'::text, v_n; return; end if;
  v_first := case when s.state = 'in_transit' then s.station_idx + 1 else s.station_idx end;
  if s.state = 'loading' then
    select (v.loading_closed_at is not null) into v_closed from public.shuttle_station_visits v where v.session_id = s.id and v.run_id = r.id and v.station_idx = s.station_idx;
    if coalesce(v_closed, false) then v_first := v_first + 1; end if;
  end if;
  if v_first > v_n - 2 then return query select null::integer, 'no_stops_ahead'::text, v_n; return; end if;
  return query select v_first, null::text, v_n;
end $$;
revoke all on function app_private.shuttle_run_gate(uuid) from public, anon, authenticated;

-- ======================= VIEW OF ONE BOOKING (what the customer is shown) =======================
create function app_private.shuttle_booking_view(p_booking uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'booking_id', b.id, 'status', b.status,
    'state', case b.status when 'requested' then 'awaiting_confirmation' else b.status end,
    'seats', b.seats, 'run_id', b.run_id, 'run_no', r.run_no, 'direction', r.direction,
    'from_pos', b.from_pos, 'to_pos', b.to_pos,
    'from_name', app_private.shuttle_station_name(d.stations, r.direction, b.from_pos), 'to_name', app_private.shuttle_station_name(d.stations, r.direction, b.to_pos),
    'service_name', d.config ->> 'name', 'service_date', d.service_date,
    'requested_at', b.requested_at, 'expires_at', b.expires_at, 'decided_at', b.decided_at, 'cancelled_at', b.cancelled_at)
  from public.shuttle_bookings b
  join public.shuttle_runs r on r.company_id = b.company_id and r.id = b.run_id
  join public.shuttle_operating_days d on d.company_id = b.company_id and d.id = b.day_id
  where b.id = p_booking
$$;
revoke all on function app_private.shuttle_booking_view(uuid) from public, anon, authenticated;

-- ======================= REQUEST =======================
create function app_private.shuttle_request_booking_impl(p_run_id uuid, p_from integer, p_to integer, p_seats integer, p_full_name text, p_phone text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_key text := btrim(coalesce(p_key, '')); v_name text := btrim(coalesce(p_full_name, '')); v_phone text;
  v_company uuid; r public.shuttle_runs%rowtype; d public.shuttle_operating_days%rowtype; v_gate record; v_cust uuid; v_old public.shuttle_bookings%rowtype;
  v_n integer; v_max integer; v_ttl integer; v_free integer; v_open integer; b public.shuttle_bookings%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(v_key) not between 1 and 100 or p_run_id is null or p_from is null or p_to is null or p_seats is null
     or length(v_name) not between 2 and 120 or v_name ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then
    raise exception 'invalid input' using errcode = '22023'; end if;
  v_phone := app_private.normalize_phone(p_phone);
  if v_phone is null or v_phone !~ '^\+[0-9]{8,15}$' then raise exception 'invalid phone' using errcode = '22023'; end if;
  select x.company_id into v_company from public.shuttle_runs x where x.id = p_run_id;
  if v_company is null then raise exception 'run not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.profiles pr where pr.id = v_uid and pr.is_active) then raise exception 'account disabled' using errcode = '42501'; end if;
  if not app_private.is_company_active(v_company) or not app_private.shuttle_enabled(v_company) then raise exception 'run not found' using errcode = 'P0002'; end if;

  perform 1 from public.shuttle_runs x where x.id = p_run_id for update;                       -- run first (same order as decide, sweep and the job)
  select * into r from public.shuttle_runs x where x.id = p_run_id;
  select * into d from public.shuttle_operating_days x where x.id = r.day_id;
  select c.id into v_cust from public.customers c where c.company_id = v_company and c.user_id = v_uid and c.deleted_at is null;

  -- same key = the same request (replay, no new captcha pass, no new checks); the same key for anything else is a client bug
  select * into v_old from public.shuttle_bookings x where x.company_id = v_company and x.request_key = v_key;
  if found then
    if v_cust is not null and v_old.customer_id = v_cust and v_old.run_id = p_run_id and v_old.from_pos = p_from and v_old.to_pos = p_to and v_old.seats = p_seats then
      return app_private.shuttle_booking_view(v_old.id) || jsonb_build_object('replayed', true);
    end if;
    raise exception 'idempotency key already used' using errcode = '22023';
  end if;

  v_n := jsonb_array_length(d.stations);
  v_max := coalesce((d.config ->> 'max_seats_per_request')::integer, 4);
  v_ttl := coalesce((d.config ->> 'request_ttl_minutes')::integer, 20);
  if p_seats < 1 or p_seats > v_max then raise exception 'invalid_seats' using errcode = '23514', hint = format('max=%s', v_max); end if;
  if p_from < 0 or p_to > v_n - 1 or p_from >= p_to then raise exception 'invalid_stations' using errcode = '23514'; end if;
  select * into v_gate from app_private.shuttle_run_gate(p_run_id);
  if v_gate.reason is not null then raise exception 'not_accepting:%', v_gate.reason using errcode = '23514'; end if;
  if p_from < v_gate.first_pos then raise exception 'station_passed' using errcode = '23514'; end if;
  if v_cust is not null then
    select count(*) into v_open from public.shuttle_bookings x where x.company_id = v_company and x.customer_id = v_cust and x.status = 'requested';
    if v_open >= 5 then raise exception 'too_many_open_requests' using errcode = '23514'; end if;
  end if;
  select min(g.capacity - g.confirmed_seats) into v_free from public.shuttle_run_segments g where g.run_id = p_run_id and g.seg_idx >= p_from and g.seg_idx < p_to;
  if coalesce(v_free, 0) < p_seats then raise exception 'full' using errcode = '23514', hint = format('free=%s', greatest(coalesce(v_free, 0), 0)); end if;

  if v_cust is null then
    if exists (select 1 from public.customers c where c.company_id = v_company and c.phone = v_phone and c.deleted_at is null) then
      raise exception 'phone already registered for this company: verify your phone to link it' using errcode = '23505'; end if;
    insert into public.customers (company_id, user_id, full_name, phone) values (v_company, v_uid, v_name, v_phone) returning id into v_cust;
  end if;

  perform app_private.consume_captcha_pass('booking');                                            -- only now: a refused request never burns a pass
  insert into public.shuttle_bookings (company_id, day_id, run_id, customer_id, from_pos, to_pos, seats, status, source, request_key, expires_at)
  values (v_company, d.id, p_run_id, v_cust, p_from, p_to, p_seats, 'requested', 'request', v_key, now() + make_interval(mins => v_ttl)) returning * into b;
  insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_id, actor_role, payload)
  values (v_company, d.id, null, 'booking.requested', v_uid, 'customer',
          jsonb_build_object('booking_id', b.id, 'run_id', b.run_id, 'from_pos', b.from_pos, 'to_pos', b.to_pos, 'seats', b.seats));
  return app_private.shuttle_booking_view(b.id) || jsonb_build_object('replayed', false);
end $$;
revoke all on function app_private.shuttle_request_booking_impl(uuid, integer, integer, integer, text, text, text) from public, anon, authenticated;

create function public.shuttle_request_booking(p_run_id uuid, p_from_pos integer, p_to_pos integer, p_seats integer, p_full_name text, p_phone text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('shuttle.request');
  return app_private.shuttle_request_booking_impl(p_run_id, p_from_pos, p_to_pos, p_seats, p_full_name, p_phone, p_key);
end $$;

-- ======================= CUSTOMER CANCEL =======================
create function app_private.shuttle_cancel_my_booking_impl(p_booking uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := btrim(coalesce(p_key, '')); v_company uuid; v_run uuid; b public.shuttle_bookings%rowtype; v_old record; v_prior text; v_outcome text; v_res jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if length(v_key) not between 1 and 100 or p_booking is null then raise exception 'invalid input' using errcode = '22023'; end if;
  select x.company_id, x.run_id into v_company, v_run from public.shuttle_bookings x
   where x.id = p_booking and x.customer_id in (select app_private.my_customer_ids());
  if v_company is null then raise exception 'booking not found' using errcode = 'P0002'; end if;
  perform 1 from public.shuttle_runs r where r.id = v_run for update;                           -- run -> booking
  select * into b from public.shuttle_bookings x where x.id = p_booking for update;
  select d.action, d.result into v_old from public.shuttle_booking_decisions d where d.booking_id = p_booking and d.idempotency_key = v_key;
  if found then
    if v_old.action <> 'cancel' then raise exception 'idempotency key already used by another action' using errcode = '22023'; end if;
    return v_old.result || jsonb_build_object('replayed', true);
  end if;
  v_prior := b.status;
  if b.status in ('requested', 'confirmed') then
    if b.status = 'confirmed' then perform app_private.shuttle_apply_segments(b.run_id, b.from_pos, b.to_pos, b.seats, -1); end if;
    update public.shuttle_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid() where id = b.id;
    v_outcome := 'cancelled';
  else
    v_outcome := 'already_processed';      -- boarded, no_show, expired, rejected, already cancelled: nothing to cancel
  end if;
  select * into b from public.shuttle_bookings x where x.id = p_booking;
  v_res := jsonb_build_object('outcome', v_outcome, 'booking_id', b.id, 'status', b.status, 'state', case b.status when 'requested' then 'awaiting_confirmation' else b.status end, 'replayed', false);
  insert into public.shuttle_booking_decisions (company_id, booking_id, run_id, action, outcome, prior_status, decided_by, actor_role, reason, idempotency_key, result)
  values (v_company, b.id, b.run_id, 'cancel', v_outcome, v_prior, auth.uid(), 'customer', 'cancelled by the customer', v_key, v_res);
  if v_outcome = 'cancelled' then
    insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_id, actor_role, payload)
    values (v_company, b.day_id, null, 'booking.cancelled', auth.uid(), 'customer', jsonb_build_object('booking_id', b.id, 'run_id', b.run_id, 'prior_status', v_prior, 'seats', b.seats));
    perform app_private.write_audit('customer', v_company, 'shuttle_booking.cancelled', 'shuttle_booking', b.id, jsonb_build_object('run_id', b.run_id, 'prior_status', v_prior, 'seats', b.seats));
  end if;
  return v_res;
end $$;
revoke all on function app_private.shuttle_cancel_my_booking_impl(uuid, text) from public, anon, authenticated;

create function public.shuttle_cancel_my_booking(p_booking_id uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.rate_limit_hit('shuttle.request');
  return app_private.shuttle_cancel_my_booking_impl(p_booking_id, p_key);
end $$;

-- ======================= MY BOOKINGS (read) =======================
create function public.shuttle_my_bookings(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return coalesce((
    select jsonb_agg(app_private.shuttle_booking_view(q.id) order by q.requested_at desc, q.id desc)
    from (select b.id, b.requested_at from public.shuttle_bookings b
           where b.customer_id in (select app_private.my_customer_ids())
           order by b.requested_at desc, b.id desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) q), '[]'::jsonb);
end $$;

-- ======================= AVAILABILITY (approximate, public-safe fields only) =======================
-- Seats are shown per hop (free_after = free seats on the hop that STARTS at that position). It is a hint: the real check happens at confirmation.
create function public.shuttle_run_availability(p_service_id uuid, p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_svc public.shuttle_services%rowtype; v_tz text; v_date date; d public.shuttle_operating_days%rowtype; x record; g record; v_n integer; v_runs jsonb := '[]'::jsonb; v_st jsonb; i integer; v_free integer;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_svc from public.shuttle_services s where s.id = p_service_id;
  -- unknown service, suspended company, feature off, inactive service: all the same empty answer
  if not found or not v_svc.is_active or not app_private.is_company_active(v_svc.company_id) or not app_private.shuttle_enabled(v_svc.company_id) then
    return jsonb_build_object('day', null, 'runs', '[]'::jsonb); end if;
  select coalesce(cs.timezone, 'UTC') into v_tz from public.company_settings cs where cs.company_id = v_svc.company_id;
  v_date := coalesce(p_date, (now() at time zone coalesce(v_tz, 'UTC'))::date);
  select * into d from public.shuttle_operating_days z where z.service_id = p_service_id and z.service_date = v_date and z.status = 'open';
  if not found then return jsonb_build_object('day', null, 'runs', '[]'::jsonb); end if;
  v_n := jsonb_array_length(d.stations);
  for x in select r.id as run_id, r.run_no, r.direction, s.state, s.station_idx, s.capacity
             from public.shuttle_runs r join public.shuttle_vehicle_sessions s on s.company_id = r.company_id and s.id = r.session_id and s.current_run_id = r.id
            where r.day_id = d.id and r.status in ('planned', 'active') and s.state <> 'completed' order by r.run_no loop
    select * into g from app_private.shuttle_run_gate(x.run_id);
    v_st := '[]'::jsonb;
    for i in 0 .. v_n - 1 loop
      select (sg.capacity - sg.confirmed_seats) into v_free from public.shuttle_run_segments sg where sg.run_id = x.run_id and sg.seg_idx = i;
      v_st := v_st || jsonb_build_object('pos', i, 'name', app_private.shuttle_station_name(d.stations, x.direction, i),
                                         'can_board', g.reason is null and i >= g.first_pos and i <= v_n - 2, 'free_after', case when i <= v_n - 2 then greatest(v_free, 0) end);
    end loop;
    v_runs := v_runs || jsonb_build_object('run_id', x.run_id, 'run_no', x.run_no, 'direction', x.direction, 'accepting', g.reason is null, 'reason', g.reason,
      'first_pos', g.first_pos, 'bus_state', x.state, 'current_pos', x.station_idx, 'current_name', app_private.shuttle_station_name(d.stations, x.direction, x.station_idx),
      'capacity', x.capacity, 'stations', v_st);
  end loop;
  return jsonb_build_object('day', jsonb_build_object('id', d.id, 'service_date', d.service_date, 'service_name', d.config ->> 'name',
    'max_seats_per_request', coalesce((d.config ->> 'max_seats_per_request')::integer, 4), 'request_ttl_minutes', coalesce((d.config ->> 'request_ttl_minutes')::integer, 20)), 'runs', v_runs);
end $$;

-- ======================= DEPARTURE SWEEP =======================
-- Called by shuttle_depart with the RUN row already locked. Bookings are locked in id order (run -> booking, same as decide).
create function app_private.shuttle_sweep_at_departure(p_run uuid, p_company uuid, p_day uuid, p_session uuid, p_pos integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b record; v_exp integer := 0; v_ns integer := 0; v_ids jsonb := '[]'::jsonb;
begin
  for b in select x.id, x.status, x.from_pos, x.to_pos, x.seats from public.shuttle_bookings x
            where x.run_id = p_run and x.company_id = p_company and x.from_pos <= p_pos and x.status in ('requested', 'confirmed') order by x.id for update loop
    if b.status = 'requested' then
      update public.shuttle_bookings set status = 'expired' where id = b.id;
      v_exp := v_exp + 1;
    else
      perform app_private.shuttle_apply_segments(p_run, b.from_pos, b.to_pos, b.seats, -1);   -- the seats are free again for the rest of the run
      update public.shuttle_bookings set status = 'no_show' where id = b.id;
      v_ns := v_ns + 1;
    end if;
    if jsonb_array_length(v_ids) < 30 then v_ids := v_ids || to_jsonb(b.id); end if;
  end loop;
  if v_exp + v_ns > 0 then
    insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_id, actor_role, payload)
    values (p_company, p_day, p_session, 'booking.departure_sweep', auth.uid(), app_private.shuttle_actor_role(p_company),
            jsonb_build_object('run_id', p_run, 'pos', p_pos, 'expired', v_exp, 'no_show', v_ns, 'booking_ids', v_ids));
  end if;
  return jsonb_build_object('expired', v_exp, 'no_show', v_ns);
end $$;
revoke all on function app_private.shuttle_sweep_at_departure(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;

-- ======================= EXPIRY JOB =======================
create function app_private.expire_shuttle_requests() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0; v_k integer;
begin
  for r in select distinct b.run_id, b.company_id, b.day_id
             from public.shuttle_bookings b
             join public.shuttle_runs ru on ru.company_id = b.company_id and ru.id = b.run_id
             join public.shuttle_operating_days d on d.company_id = b.company_id and d.id = b.day_id
            where b.status = 'requested'
              and (coalesce(b.expires_at, b.requested_at + make_interval(mins => coalesce((d.config ->> 'request_ttl_minutes')::integer, 20))) < now()
                   or ru.status not in ('planned', 'active') or d.status <> 'open')
            order by b.run_id limit 200 loop
    perform 1 from public.shuttle_runs x where x.id = r.run_id for update;                       -- run first, like every writer
    update public.shuttle_bookings b set status = 'expired'
     from public.shuttle_runs ru, public.shuttle_operating_days d
     where b.run_id = r.run_id and b.status = 'requested' and ru.id = b.run_id and d.id = b.day_id
       and (coalesce(b.expires_at, b.requested_at + make_interval(mins => coalesce((d.config ->> 'request_ttl_minutes')::integer, 20))) < now()
            or ru.status not in ('planned', 'active') or d.status <> 'open');
    get diagnostics v_k = row_count;
    if v_k > 0 then
      insert into public.shuttle_events (company_id, day_id, session_id, kind, actor_id, actor_role, payload)
      values (r.company_id, r.day_id, null, 'booking.expired', null, 'system', jsonb_build_object('run_id', r.run_id, 'count', v_k));
      v_n := v_n + v_k;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function app_private.expire_shuttle_requests() from public, anon, authenticated;
insert into app_private.jobs (name, fn, every_seconds, stale_after_seconds) values ('expire-shuttle-requests', 'expire_shuttle_requests', 60, 300);

-- ======================= GRANTS =======================
revoke all on function public.shuttle_request_booking(uuid, integer, integer, integer, text, text, text), public.shuttle_cancel_my_booking(uuid, text),
  public.shuttle_my_bookings(integer), public.shuttle_run_availability(uuid, date) from public, anon;
grant execute on function public.shuttle_request_booking(uuid, integer, integer, integer, text, text, text), public.shuttle_cancel_my_booking(uuid, text),
  public.shuttle_my_bookings(integer), public.shuttle_run_availability(uuid, date) to authenticated;

-- ======================= shuttle_depart: 0076 body + the sweep =======================
create or replace function public.shuttle_depart(p_session uuid, p_expected_state text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.shuttle_vehicle_sessions; v_run public.shuttle_runs; v_day public.shuttle_operating_days; v_visit public.shuttle_station_visits;
  v_res jsonb; v_n integer; v_seq integer; v_leg uuid; v_sweep jsonb; v_onboard integer;
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

  -- S4b: the bus leaves this station. Requests and unboarded confirmed bookings that board here (or earlier) are settled NOW, under the run lock.
  v_sweep := app_private.shuttle_sweep_at_departure(v_run.id, v_s.company_id, v_s.day_id, v_s.id, v_s.station_idx);
  select coalesce(sum(b.seats), 0) into v_onboard from public.shuttle_bookings b
   where b.run_id = v_run.id and b.company_id = v_s.company_id and b.status = 'boarded' and b.from_pos <= v_s.station_idx and b.to_pos > v_s.station_idx;
  update public.shuttle_station_visits set loading_closed_at = coalesce(loading_closed_at, now()), departed_at = now() where id = v_visit.id;
  select coalesce(max(l.seq), 0) + 1 into v_seq from public.shuttle_legs l where l.session_id = v_s.id;
  insert into public.shuttle_legs (company_id, run_id, session_id, seq, from_station_idx, to_station_idx, vehicle_id, driver_id, onboard_at_departure)
  values (v_s.company_id, v_run.id, v_s.id, v_seq, v_s.station_idx, v_s.station_idx + 1, v_s.vehicle_id, v_s.current_driver_id, v_onboard) returning id into v_leg;
  update public.shuttle_runs set status = 'active' where id = v_run.id and status = 'planned';
  update public.shuttle_vehicle_sessions set state = 'in_transit' where id = v_s.id;

  v_res := jsonb_build_object('session_id', v_s.id, 'state', 'in_transit', 'leg_id', v_leg, 'seq', v_seq, 'run_id', v_run.id,
    'from_pos', v_s.station_idx, 'to_pos', v_s.station_idx + 1,
    'from_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_s.station_idx),
    'to_name', app_private.shuttle_station_name(v_day.stations, v_run.direction, v_s.station_idx + 1),
    'expired_requests', (v_sweep ->> 'expired')::integer, 'no_shows', (v_sweep ->> 'no_show')::integer, 'onboard', v_onboard, 'replayed', false);
  perform app_private.shuttle_log(v_s.company_id, v_s.day_id, v_s.id, 'leg.departed', jsonb_build_object('result', v_res), null, btrim(p_key));
  return v_res;
end $$;
