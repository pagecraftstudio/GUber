-- 73: Continuous Shuttle S4b (migration 0078): request intake, customer cancel, availability, departure sweep, expiry job. Harness style.
-- Users: u(1) platform super_admin, u(3) managerA, u(5) booking staff (shuttle.confirm), u(7) ownerB. Customers are fresh auth users u(7701..7703) (no customer row yet).
-- Own fixtures (ids 76xx): route 7601 (3 stops), service 7611, buses 7621/7622 (capacity 3), drivers 7631/7632.
-- Runs: run 1 = bus 7621, run 2 = bus 7622, both forward from the first station. Stations are travel positions 0,1,2; hops 0 and 1.
-- Every public RPC call hits a rate-limit bucket, so counters are cleared between sections.
select t.as_admin();
delete from t.results where name like 's4b: %';
create temp table s4b_saved as select
  (select bool_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'feature_shuttle_ops') as feat,
  (select int_value from plan_entitlements where plan_id = (select id from plans where code = 'professional') and key = 'max_shuttle_vehicles') as vmax;
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = 10 where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');

create or replace function t.cnt73(p_sql text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p_sql into n; return n; end $$;
create or replace function t.call73(p_sql text) returns jsonb language plpgsql as $$ declare r jsonb; begin execute p_sql into r; return r; end $$;
create or replace function t.rl73() returns void language sql security definer as $$ delete from app_private.rate_limit_counters $$;
create or replace function t.day73() returns uuid language sql security definer as $$ select id from public.shuttle_operating_days where service_id = t.u(7611) order by created_at desc limit 1 $$;
create or replace function t.run73(n int) returns uuid language sql security definer as $$ select id from public.shuttle_runs where day_id = t.day73() and run_no = n $$;
create or replace function t.sess73(b int) returns uuid language sql security definer as $$ select id from public.shuttle_vehicle_sessions where vehicle_id = t.u(b) order by created_at desc limit 1 $$;
create or replace function t.seg73(n int) returns text language sql security definer as $$ select string_agg(confirmed_seats::text, ',' order by seg_idx) from public.shuttle_run_segments where run_id = t.run73(n) $$;
create or replace function t.bk73(k text) returns uuid language sql security definer as $$ select id from public.shuttle_bookings where request_key = k $$;
create or replace function t.st73(k text) returns text language sql security definer as $$ select status from public.shuttle_bookings where request_key = k $$;
create or replace function t.drift73() returns bigint language sql security definer as $$ select count(*) from app_private.shuttle_segment_drift() d where d.run_id in (select id from public.shuttle_runs where day_id = t.day73()) $$;
create or replace function t.req73(p_run int, p_from int, p_to int, p_seats int, p_key text, p_who int default 1) returns text language sql as $$
  select 'select public.shuttle_request_booking(' || quote_literal(t.run73(p_run)) || ', ' || p_from || ', ' || p_to || ', ' || p_seats || ', ' || quote_literal('S4b Customer ' || p_who) || ', '
    || quote_literal('+20100007730' || p_who) || ', ' || quote_literal(p_key) || ')' $$;
grant execute on function t.cnt73(text), t.call73(text), t.rl73(), t.day73(), t.run73(int), t.sess73(int), t.seg73(int), t.bk73(text), t.st73(text), t.drift73(), t.req73(int, int, int, int, text, int) to authenticated, anon;

insert into auth.users (id, email) values (t.u(7701), 's4b1@test.dev'), (t.u(7702), 's4b2@test.dev'), (t.u(7703), 's4b3@test.dev') on conflict do nothing;
insert into routes (id, company_id, name, origin_name, destination_name) values (t.u(7601), t.u(101), 'S4b route', 'Campus', 'Port');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(7603), t.u(101), t.u(7601), 'S4b Campus', 1, 'both'), (t.u(7604), t.u(101), t.u(7601), 'S4b Mid', 2, 'both'), (t.u(7605), t.u(101), t.u(7601), 'S4b Port', 3, 'both');
insert into shuttle_services (id, company_id, route_id, name, outbound_direction, allow_reverse, hub_stop_id) values (t.u(7611), t.u(101), t.u(7601), 'S4b Shuttle', 'forward', true, t.u(7603));
insert into buses (id, company_id, plate_number, capacity, status) values (t.u(7621), t.u(101), 'S4B-1', 3, 'active'), (t.u(7622), t.u(101), 'S4B-2', 3, 'active');
insert into drivers (id, company_id, full_name, phone, status) values (t.u(7631), t.u(101), 'S4b Secret Driver 1', '+201000076031', 'active'), (t.u(7632), t.u(101), 'S4b Secret Driver 2', '+201000076032', 'active');

select t.as_user(t.u(3));
select t.passes('s4b: manager starts the day (2 buses of 3 seats)', $$select public.shuttle_start_day(t.u(7611),
  (select (now() at time zone coalesce((select timezone from public.company_settings where company_id = t.u(101)), 'UTC'))::date),
  jsonb_build_array(jsonb_build_object('bus_id', t.u(7621), 'driver_id', t.u(7631), 'start_station_idx', 0, 'direction', 'forward'),
                    jsonb_build_object('bus_id', t.u(7622), 'driver_id', t.u(7632), 'start_station_idx', 0, 'direction', 'forward')), 's4b-start-1')$$);
select t.as_admin();

-- 0. catalog -----------------------------------------------------------------------------------------------------------------------------------
select t.eq('s4b: expires_at column exists', (select count(*) from information_schema.columns where table_name = 'shuttle_bookings' and column_name = 'expires_at'), 1::bigint);
select t.eq('s4b: the four customer RPCs are granted to authenticated, not anon', (select count(*) filter (where grantee = 'authenticated') || '/' || count(*) filter (where grantee in ('anon', 'PUBLIC'))
  from information_schema.routine_privileges where routine_schema = 'public' and routine_name in ('shuttle_request_booking', 'shuttle_cancel_my_booking', 'shuttle_my_bookings', 'shuttle_run_availability')), '4/0');
select t.eq('s4b: the gate and the sweep are not callable by clients', (select count(*) from information_schema.routine_privileges where routine_schema = 'app_private'
  and routine_name in ('shuttle_run_gate', 'shuttle_sweep_at_departure', 'expire_shuttle_requests') and grantee in ('anon', 'authenticated', 'PUBLIC')), 0::bigint);
select t.eq('s4b: the expiry job is registered', (select count(*) from app_private.jobs where name = 'expire-shuttle-requests' and every_seconds = 60), 1::bigint);

-- 1. availability ----------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(7701));
select t.eq('s4b: availability lists both runs, accepting, with 3 free seats on hop 0', (select jsonb_array_length(a -> 'runs') || '/' || (a -> 'runs' -> 0 ->> 'accepting') || '/' || (a -> 'runs' -> 0 -> 'stations' -> 0 ->> 'free_after')
  from (select public.shuttle_run_availability(t.u(7611)) a) q), '2/true/3');
select t.eq('s4b: availability never shows a plate or a driver name', (select position('S4B-' in a::text) + position('Secret Driver' in a::text) from (select public.shuttle_run_availability(t.u(7611)) a) q), 0);
select t.eq('s4b: the last station cannot be boarded (no hop after it)', (select (a -> 'runs' -> 0 -> 'stations' -> 2 ->> 'can_board') from (select public.shuttle_run_availability(t.u(7611)) a) q), 'false');
select t.eq('s4b: an unknown service gives the same empty answer', (select (public.shuttle_run_availability(gen_random_uuid())) ->> 'day'), null);
select t.as_anon();
select t.raises('s4b: anon cannot read availability', $$select public.shuttle_run_availability(t.u(7611))$$, '42501');

-- 2. request validation: every refusal leaves no customer row behind and burns nothing ------------------------------------------------------------
select t.rl73();
select t.as_user(t.u(7701));
select t.raises('s4b: zero seats is invalid_seats', t.req73(1, 0, 2, 0, 'k73-bad1'), '23514');
select t.raises('s4b: more seats than the day allows is invalid_seats', t.req73(1, 0, 2, 5, 'k73-bad2'), '23514');
select t.raises('s4b: from = to is invalid_stations', t.req73(1, 1, 1, 1, 'k73-bad3'), '23514');
select t.raises('s4b: a destination beyond the last station is invalid_stations', t.req73(1, 0, 3, 1, 'k73-bad4'), '23514');
select t.raises('s4b: a blank key is invalid input', t.req73(1, 0, 2, 1, '  '), '22023');
select t.raises('s4b: a one-letter name is invalid input', format($f$select public.shuttle_request_booking(%L, 0, 2, 1, 'A', '+201000077301', 'k73-bad5')$f$, t.run73(1)), '22023');
select t.raises('s4b: an invalid phone is refused', format($f$select public.shuttle_request_booking(%L, 0, 2, 1, 'S4b One', '12', 'k73-bad6')$f$, t.run73(1)), '22023');
select t.raises('s4b: an unknown run is not found', $$select public.shuttle_request_booking(gen_random_uuid(), 0, 2, 1, 'S4b One', '+201000077301', 'k73-bad7')$$, 'P0002');
select t.raises('s4b: four seats exceed the 3 free seats: full', t.req73(1, 0, 2, 4, 'k73-full'), '23514');
select t.eq('s4b: refused requests created no customer and no booking', t.cnt73(format('select count(*) from public.customers where user_id = %L', t.u(7701))) || '/' || t.cnt73($$select count(*) from public.shuttle_bookings where request_key like 'k73-%'$$), '0/0');
select t.as_anon();
select t.raises('s4b: anon cannot request', t.req73(1, 0, 2, 1, 'k73-anon'), '42501');

-- 3. the request itself: holds no seat ---------------------------------------------------------------------------------------------------------
select t.rl73();
select t.as_user(t.u(7701));
select t.eq('s4b: a request is awaiting confirmation, not replayed', (t.call73(t.req73(1, 0, 2, 2, 'k73-r1')) ->> 'state') || '/' || (select (t.call73(t.req73(1, 0, 2, 2, 'k73-r1')) ->> 'replayed')), 'awaiting_confirmation/true');
select t.as_admin();
select t.eq('s4b: the request holds NO seat (counters still 0,0)', t.seg73(1) || '/' || t.drift73()::text, '0,0/0');
select t.eq('s4b: one booking, status requested, source request, customer linked to the user', (select count(*) || '/' || min(status) || '/' || min(source) || '/' || (min(customer_id::text) = (select id::text from customers where user_id = t.u(7701)))::text
  from shuttle_bookings where request_key = 'k73-r1'), '1/requested/request/true');
select t.eq('s4b: expires_at is about 20 minutes ahead', (select (expires_at > now() + interval '19 minutes' and expires_at < now() + interval '21 minutes') from shuttle_bookings where request_key = 'k73-r1'), true);
select t.eq('s4b: one booking.requested event, no decision row', t.cnt73($$select count(*) from public.shuttle_events where kind = 'booking.requested' and day_id = t.day73()$$) || '/' || t.cnt73($$select count(*) from public.shuttle_booking_decisions where run_id in (select id from public.shuttle_runs where day_id = t.day73())$$), '1/0');
select t.as_user(t.u(7701));
select t.raises('s4b: the same key for different seats is a client bug', t.req73(1, 0, 2, 1, 'k73-r1'), '22023');
select t.as_user(t.u(7702));
select t.raises('s4b: the same key from another user is refused', t.req73(1, 0, 2, 2, 'k73-r1', 2), '22023');
select t.as_admin();
select t.eq('s4b: the replay and the refusals added nothing', t.cnt73($$select count(*) from public.shuttle_bookings where request_key = 'k73-r1'$$) || '/' || t.cnt73($$select count(*) from public.shuttle_events where kind = 'booking.requested' and day_id = t.day73()$$), '1/1');

-- open-request limit: 5 per customer
select t.rl73();
select t.as_user(t.u(7701));
select t.passes('s4b: request 2', t.req73(1, 0, 1, 1, 'k73-r2'));
select t.passes('s4b: request 3', t.req73(1, 0, 1, 1, 'k73-r3'));
select t.passes('s4b: request 4', t.req73(1, 0, 1, 1, 'k73-r4'));
select t.passes('s4b: request 5', t.req73(1, 0, 1, 1, 'k73-r5'));
select t.raises('s4b: the sixth open request is refused', t.req73(1, 0, 1, 1, 'k73-r6'), '23514');
select t.as_admin();
select t.eq('s4b: five open requests, counters still empty', t.cnt73($$select count(*) from public.shuttle_bookings where request_key like 'k73-r_' and status = 'requested'$$)::text || '/' || t.seg73(1), '5/0,0');

-- 4. staff decide, customer cancel ---------------------------------------------------------------------------------------------------------------
select t.rl73();
select t.as_user(t.u(5));
select t.eq('s4b: staff confirm r1 (0>2, 2 seats): counters 2,2', (public.shuttle_decide_booking(t.bk73('k73-r1'), 'confirm', 'k73-d-r1')) ->> 'outcome', 'confirmed');
select t.as_user(t.u(7702));
select t.raises('s4b: another customer cannot cancel it (not found)', format($f$select public.shuttle_cancel_my_booking(%L, 'k73-c-x')$f$, t.bk73('k73-r1')), 'P0002');
select t.as_user(t.u(7701));
select t.eq('s4b: the customer cancels a request: nothing to release', (public.shuttle_cancel_my_booking(t.bk73('k73-r2'), 'k73-c-r2')) ->> 'outcome' || '/' || t.seg73(1), 'cancelled/2,2');
select t.eq('s4b: the customer cancels a confirmed booking: its segments are released', (public.shuttle_cancel_my_booking(t.bk73('k73-r1'), 'k73-c-r1')) ->> 'outcome' || '/' || t.seg73(1), 'cancelled/0,0');
select t.eq('s4b: the same key replays', (public.shuttle_cancel_my_booking(t.bk73('k73-r1'), 'k73-c-r1')) ->> 'replayed', 'true');
select t.eq('s4b: another key after it is already_processed (no double release)', (public.shuttle_cancel_my_booking(t.bk73('k73-r1'), 'k73-c-r1b')) ->> 'outcome' || '/' || t.seg73(1), 'already_processed/0,0');
select t.eq('s4b: my bookings lists only my five, with friendly states', (select jsonb_array_length(public.shuttle_my_bookings()) || '/' || count(*) filter (where e ->> 'state' = 'awaiting_confirmation') || '/' || count(*) filter (where e ->> 'state' = 'cancelled')
  from jsonb_array_elements(public.shuttle_my_bookings()) e), '5/3/2');
select t.as_user(t.u(7702));
select t.eq('s4b: another customer sees none of them', jsonb_array_length(public.shuttle_my_bookings()), 0);
select t.as_user(t.u(7));
select t.eq('s4b: a user of another company sees none of them', jsonb_array_length(public.shuttle_my_bookings()), 0);
select t.as_anon();
select t.raises('s4b: anon cannot list bookings', $$select public.shuttle_my_bookings()$$, '42501');
select t.as_admin();
select t.eq('s4b: decisions and audit record the customer cancels, counters equal recompute', t.cnt73($$select count(*) from public.shuttle_booking_decisions where action = 'cancel' and actor_role = 'customer' and run_id in (select id from public.shuttle_runs where day_id = t.day73())$$)::text || '/' ||
  t.cnt73($$select count(*) from public.audit_logs where action = 'shuttle_booking.cancelled' and entity_id in (select id from public.shuttle_bookings where day_id = t.day73())$$)::text || '/' || t.drift73()::text, '3/2/0');

-- 4b. captcha: consumed only by a request that passed every rule (run 1 still accepts) ---------------------------------------------------------------
select t.as_user(t.u(1));
select t.passes('s4b: platform turns captcha enforcement on (test secret)', $$select public.set_captcha_enforcement(true, repeat('s', 32))$$);
select t.as_admin();
insert into app_private.captcha_passes (user_id, purpose, nonce, expires_at) values (t.u(7703), 'booking', 's4b-nonce-0000000001', now() + interval '5 minutes');
select t.rl73();
select t.as_user(t.u(7702));
select t.raises('s4b: enforced and no pass: captcha required', t.req73(1, 0, 1, 1, 'k73-cap0', 2), '42501');
select t.as_user(t.u(7703));
select t.raises('s4b: a refused request (bad seats) does not burn the pass', t.req73(1, 0, 1, 0, 'k73-cap1', 3), '23514');
select t.as_admin();
select t.eq('s4b: the pass is still open and the refusals made no customer', t.cnt73(format($f$select count(*) from app_private.captcha_passes where user_id = %L and consumed_at is null$f$, t.u(7703)))::text || '/' ||
  t.cnt73(format('select count(*) from public.customers where user_id in (%L, %L)', t.u(7702), t.u(7703))), '1/0');
select t.as_user(t.u(7703));
select t.eq('s4b: a valid request uses the pass', (t.call73(t.req73(1, 0, 1, 1, 'k73-cap-ok', 3)) ->> 'state'), 'awaiting_confirmation');
select t.as_admin();
select t.eq('s4b: the pass is consumed', t.cnt73(format($f$select count(*) from app_private.captcha_passes where user_id = %L and consumed_at is null$f$, t.u(7703))), 0::bigint);
select t.as_user(t.u(7703));
select t.eq('s4b: replaying the same key needs no new pass', (t.call73(t.req73(1, 0, 1, 1, 'k73-cap-ok', 3)) ->> 'replayed'), 'true');
select t.as_user(t.u(1));
select t.passes('s4b: enforcement off again', $$select public.set_captcha_enforcement(false)$$);

-- 5. the departure sweep (run 2, bus 2) --------------------------------------------------------------------------------------------------------------
select t.rl73();
select t.as_user(t.u(7702));
select t.passes('s4b: kA 0>2', t.req73(2, 0, 2, 1, 'k73-kA', 2));
select t.passes('s4b: kE 0>2', t.req73(2, 0, 2, 1, 'k73-kE', 2));
select t.passes('s4b: kB 0>1', t.req73(2, 0, 1, 1, 'k73-kB', 2));
select t.passes('s4b: kC 1>2', t.req73(2, 1, 2, 1, 'k73-kC', 2));
select t.passes('s4b: kD 1>2', t.req73(2, 1, 2, 1, 'k73-kD', 2));
select t.as_user(t.u(5));
select t.eq('s4b: staff confirm kA, kE, kD', ((public.shuttle_decide_booking(t.bk73('k73-kA'), 'confirm', 'k73-d-kA')) ->> 'outcome') || '/' || ((public.shuttle_decide_booking(t.bk73('k73-kE'), 'confirm', 'k73-d-kE')) ->> 'outcome') || '/' ||
  ((public.shuttle_decide_booking(t.bk73('k73-kD'), 'confirm', 'k73-d-kD')) ->> 'outcome'), 'confirmed/confirmed/confirmed');
select t.as_admin();
select t.eq('s4b: run 2 counters 2,3 before the bus leaves', t.seg73(2), '2,3');
select t.rl73();
select t.as_user(t.u(3));
select t.passes('s4b: bus 2 opens loading', $$select public.shuttle_open_loading(t.sess73(7622), 'ready', 'k73-s-ol')$$);
select t.as_user(t.u(7703));
select t.passes('s4b: while loading is open a request for the current station is accepted', t.req73(2, 0, 1, 1, 'k73-kX', 3));
select t.as_user(t.u(3));
select t.passes('s4b: loading closes', $$select public.shuttle_close_loading(t.sess73(7622), 'loading', 'k73-s-cl')$$);
select t.as_user(t.u(7701));
select t.raises('s4b: once loading is closed the current station is station_passed', t.req73(2, 0, 2, 1, 'k73-kY'), '23514');
select t.as_user(t.u(3));
select t.eq('s4b: departure reports the sweep (2 requests expired, 2 confirmed no_show)', (public.shuttle_depart(t.sess73(7622), 'loading', 'k73-s-dep') ->> 'expired_requests') || '/' || (public.shuttle_depart(t.sess73(7622), 'loading', 'k73-s-dep') ->> 'no_shows'), '2/2');
select t.as_admin();
select t.eq('s4b: kA kE -> no_show, kB kX -> expired, kC requested, kD confirmed', t.st73('k73-kA') || '/' || t.st73('k73-kE') || '/' || t.st73('k73-kB') || '/' || t.st73('k73-kX') || '/' || t.st73('k73-kC') || '/' || t.st73('k73-kD'),
  'no_show/no_show/expired/expired/requested/confirmed');
select t.eq('s4b: the no-shows released their segments (only kD left on hop 1)', t.seg73(2) || '/' || t.drift73()::text, '0,1/0');
select t.eq('s4b: the leg recorded nobody on board, one sweep event with the counts', (select l.onboard_at_departure from shuttle_legs l where l.session_id = t.sess73(7622) and l.seq = 1)::text || '/' ||
  (select (payload ->> 'expired') || '-' || (payload ->> 'no_show') from shuttle_events where kind = 'booking.departure_sweep' and session_id = t.sess73(7622)), '0/2-2');
select t.eq('s4b: the sweep wrote no human decision rows (only the 3 confirms and the earlier cancels)', t.cnt73($$select count(*) from public.shuttle_booking_decisions where action = 'confirm' and run_id in (select id from public.shuttle_runs where day_id = t.day73())$$)::text, '4');
select t.rl73();
select t.as_user(t.u(7701));
select t.raises('s4b: in transit, the station just left is station_passed', t.req73(2, 0, 2, 1, 'k73-kZ'), '23514');
select t.passes('s4b: in transit, the next station still takes requests (kF 1>2)', t.req73(2, 1, 2, 1, 'k73-kF'));
select t.as_user(t.u(3));
select t.passes('s4b: bus 2 arrives at station 1', $$select public.shuttle_arrive(t.sess73(7622), 'in_transit', 'k73-s-arr')$$);
select t.passes('s4b: bus 2 opens loading again', $$select public.shuttle_open_loading(t.sess73(7622), 'arrived', 'k73-s-ol2')$$);
select t.eq('s4b: second departure: kC and kF expire, kD (unboarded) is a no_show and frees hop 1', (public.shuttle_depart(t.sess73(7622), 'loading', 'k73-s-dep2') ->> 'expired_requests') || '/' || (public.shuttle_depart(t.sess73(7622), 'loading', 'k73-s-dep2') ->> 'no_shows'), '2/1');
select t.as_admin();
select t.eq('s4b: statuses and counters after the second sweep', t.st73('k73-kC') || '/' || t.st73('k73-kF') || '/' || t.st73('k73-kD') || '/' || t.seg73(2) || '/' || t.drift73()::text, 'expired/expired/no_show/0,0/0');
select t.rl73();
select t.as_user(t.u(3));
select t.passes('s4b: bus 2 arrives at the last station', $$select public.shuttle_arrive(t.sess73(7622), 'in_transit', 'k73-s-arr2')$$);
select t.as_user(t.u(7701));
select t.raises('s4b: at the last station nothing is ahead', t.req73(2, 1, 2, 1, 'k73-kG'), '23514');
select t.as_admin();
select t.eq('s4b: ... and the gate says no_stops_ahead', (select reason from app_private.shuttle_run_gate(t.run73(2))), 'no_stops_ahead');

-- 6. other gate reasons, expiry job (run 1, bus 1) -------------------------------------------------------------------------------------------------
select t.rl73();
select t.as_admin();
update shuttle_bookings set expires_at = now() - interval '1 minute' where request_key = 'k73-r3';
select t.eq('s4b: the job expires the one request past its TTL and nothing else', (app_private.expire_shuttle_requests() >= 1)::text || '/' || t.st73('k73-r3') || '/' || t.st73('k73-r4'), 'true/expired/requested');
select t.eq('s4b: the job logged a system event and never touched counters', t.cnt73($$select count(*) from public.shuttle_events where kind = 'booking.expired' and actor_role = 'system' and day_id = t.day73()$$)::text || '/' || t.seg73(1) || '/' || t.drift73()::text, '1/0,0/0');
select t.eq('s4b: running the job again expires none of this suite''s requests', t.cnt73($$select count(*) from public.shuttle_bookings where status = 'requested' and day_id = t.day73() and request_key = 'k73-r3'$$), 0::bigint);
select t.as_user(t.u(3));
select t.passes('s4b: bus 1 goes out of service', $$select public.shuttle_set_out_of_service(t.sess73(7621), 'ready', 'k73-oos', 'inspection')$$);
select t.as_user(t.u(7703));
select t.raises('s4b: an out-of-service run takes no requests', t.req73(1, 0, 2, 1, 'k73-oos1', 3), '23514');
select t.as_admin();
select t.eq('s4b: ... the gate says out_of_service', (select reason from app_private.shuttle_run_gate(t.run73(1))), 'out_of_service');
select t.as_user(t.u(3));
select t.passes('s4b: bus 1 returns', $$select public.shuttle_return_to_service(t.sess73(7621), 'out_of_service', 'k73-ret')$$);
select t.passes('s4b: bus 1 ends its day (run aborted, nothing ran)', $$select public.shuttle_end_session(t.sess73(7621), 'ready', 'k73-end1')$$);
select t.as_user(t.u(7703));
select t.raises('s4b: a finished run takes no requests', t.req73(1, 0, 2, 1, 'k73-closed', 3), '23514');
select t.as_admin();
select t.eq('s4b: ... the gate says run_closed', (select reason from app_private.shuttle_run_gate(t.run73(1))), 'run_closed');
select t.eq('s4b: the job expires the requests left on a closed run (r4, r5 and the captcha one)', (app_private.expire_shuttle_requests() >= 3)::text || '/' || t.st73('k73-r4') || '/' || t.st73('k73-r5') || '/' || t.st73('k73-cap-ok'), 'true/expired/expired/expired');
select t.eq('s4b: the cancelled and confirmed history is untouched', t.st73('k73-r1') || '/' || t.st73('k73-r2'), 'cancelled/cancelled');
select t.eq('s4b: counters equal recompute after everything', t.drift73(), 0::bigint);

-- 8. feature switched off: customers see nothing ----------------------------------------------------------------------------------------------------
select t.as_admin();
update plan_entitlements set bool_value = false where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
select t.rl73();
select t.as_user(t.u(7701));
select t.raises('s4b: no shuttle feature: the run is not found for customers', t.req73(1, 0, 2, 1, 'k73-off'), 'P0002');
select t.eq('s4b: no shuttle feature: availability is empty', (public.shuttle_run_availability(t.u(7611))) ->> 'day', null);
select t.as_admin();
update plan_entitlements set bool_value = true where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');

-- restore ---------------------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
update plan_entitlements set bool_value = (select feat from s4b_saved) where key = 'feature_shuttle_ops' and plan_id = (select id from plans where code = 'professional');
update plan_entitlements set int_value = (select vmax from s4b_saved) where key = 'max_shuttle_vehicles' and plan_id = (select id from plans where code = 'professional');
