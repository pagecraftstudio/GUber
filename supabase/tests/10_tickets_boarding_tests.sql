-- 10: tickets, hashed QR tokens, driver boarding (0014). Requires 01 fixtures, 05 (t.err_of, t.seats), 08/09 (users 84/85, customers).
-- Company A u(101): driver users u(91) (driver 961, assigned to trips 971/972/975), u(92) (driver 962, trip 973). Company B u(102): driver user u(93) (driver 963, trip 974).
-- Trips: 971 +30h (boarding not open) | 972 +1h cap 10 (boarding window open) | 973 +1h other driver | 974 company B +1h | 975 +96d (far, customer flows)
create or replace function t.bk(ref text) returns uuid language sql security definer as $$ select id from public.bookings where reference = ref $$;
grant execute on function t.bk(text) to authenticated, anon;
create table if not exists t.tok (label text, idx int, tok text);
grant all on t.tok to authenticated, anon;
create or replace function t.tk(label text, i int) returns text language sql security definer as $$ select tok from t.tok where label = $1 and idx = $2 $$;
grant execute on function t.tk(text, int) to authenticated, anon;
create or replace function t.nt(ref text) returns bigint language sql security definer as $$ select count(*) from public.tickets where booking_id = t.bk(ref) $$;
grant execute on function t.nt(text) to authenticated, anon;
create or replace function t.board(u int, trip uuid, tok text) returns text language plpgsql as $$
begin perform t.as_user(t.u(u)); return t.err_of(format($q$select (public.board_ticket(%L, %L))->>'result'$q$, trip, tok)); end $$;
create or replace function t.board_ok(u int, trip uuid, tok text) returns text language plpgsql as $$
declare r text; begin perform t.as_user(t.u(u)); r := (public.board_ticket(trip, tok))->>'result'; return r; exception when others then return sqlstate || '|' || sqlerrm; end $$;

select t.as_admin();
-- company B is on the starter plan whose user/bus/driver limits earlier suites already used up: give it the professional plan for this suite
update subscriptions set plan_id = (select id from plans where code = 'professional') where company_id = t.u(102);
insert into auth.users (id, email) values (t.u(91), 'drvA1@test.dev'), (t.u(92), 'drvA2@test.dev'), (t.u(93), 'drvB1@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id)
select v.c, t.u(v.u), r.id from (values (t.u(101), 91), (t.u(101), 92), (t.u(102), 93)) v(c, u) join roles r on r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values
  (t.u(951), t.u(101), 'T10-A1', 20), (t.u(952), t.u(101), 'T10-A2', 20), (t.u(953), t.u(101), 'T10-A3', 20), (t.u(954), t.u(102), 'T10-B1', 20);
insert into drivers (id, company_id, user_id, full_name, phone) values
  (t.u(961), t.u(101), t.u(91), 'T10 driver A1', '+201000010001'), (t.u(962), t.u(101), t.u(92), 'T10 driver A2', '+201000010002'),
  (t.u(963), t.u(102), t.u(93), 'T10 driver B1', '+201000010003');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(971), t.u(101), t.u(201), t.u(952), t.u(961), now() + interval '30 hours', now() + interval '32 hours', 40, 10, 'scheduled'),
  (t.u(972), t.u(101), t.u(201), t.u(951), t.u(961), now() + interval '1 hour',   now() + interval '3 hours',  40, 10, 'scheduled'),
  (t.u(973), t.u(101), t.u(201), t.u(953), t.u(962), now() + interval '1 hour',   now() + interval '3 hours',  40, 10, 'scheduled'),
  (t.u(974), t.u(102), t.u(203), t.u(954), t.u(963), now() + interval '1 hour',   now() + interval '3 hours',  40, 10, 'scheduled'),
  (t.u(975), t.u(101), t.u(201), t.u(951), t.u(961), now() + interval '96 days',  now() + interval '96 days 2 hours', 40, 5, 'scheduled');
insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source)
select t.u(101), v.ref, v.trip, c.id, v.n, 40, 40 * v.n, 'EGP', v.st, 'staff'
  from (values ('MB-T14003', t.u(972), 84, 3, 'confirmed'), ('MB-T14001', t.u(972), 85, 1, 'confirmed'), ('MB-T14002', t.u(972), 85, 2, 'pending'),
               ('MB-T14004', t.u(971), 84, 1, 'confirmed'), ('MB-T14005', t.u(973), 84, 1, 'confirmed'), ('MB-T14007', t.u(972), 84, 1, 'confirmed')) v(ref, trip, u, n, st)
  join customers c on c.company_id = t.u(101) and c.user_id = t.u(v.u);
insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source)
values (t.u(102), 'MB-T14006', t.u(974), t.u(252), 1, 40, 40, 'EGP', 'confirmed', 'staff');

-- ===== issuance: one ticket per seat, same transaction as the confirmation =====
select t.eq('issue: 3 seats -> 3 tickets', t.nt('MB-T14003'), 3::bigint);
select t.eq('issue: 1 seat -> 1 ticket', t.nt('MB-T14001'), 1::bigint);
select t.eq('issue: pending booking has no tickets yet', t.nt('MB-T14002'), 0::bigint);
select t.eq('issue: indexes are 1..n', (select array_agg(ticket_index order by ticket_index) from tickets where booking_id = t.bk('MB-T14003')), array[1,2,3]::smallint[]);
select t.eq('issue: every ticket carries booking, trip and company', (select count(*) from tickets k join bookings b on b.id = k.booking_id and b.company_id = k.company_id and b.trip_id = k.trip_id where k.booking_id = t.bk('MB-T14003')), 3::bigint);
select t.eq('issue: tokens (hashes) are all distinct', (select count(distinct token_hash) from tickets), (select count(*) from tickets));
update bookings set status = 'confirmed' where reference = 'MB-T14002';
select t.eq('issue: pending -> confirmed issues its 2 tickets', t.nt('MB-T14002'), 2::bigint);
select t.eq('issue: tickets are only valid ones at start', (select count(*) from tickets where trip_id in (t.u(971), t.u(972), t.u(973), t.u(974)) and status <> 'valid'), 0::bigint);
select t.eq('issue: no raw token column exists', (select count(*) from information_schema.columns where table_name = 'tickets' and column_name in ('token', 'qr', 'raw_token')), 0::bigint);
select t.eq('issue: hash is 32 bytes (sha-256)', (select bool_and(octet_length(token_hash) = 32) from tickets), true);
select t.eq('guard: new tables pass the tenant-guard audit', (select count(*) from app_private.tenant_guard_problems()), 0::bigint);

-- ===== retries never duplicate tickets; cancelling voids them (customer flow on the far trip) =====
select t.as_user(t.u(85));
select t.eq('replay: first call', (select (public.create_my_booking(t.u(975), 2, 'Web 85', '+201000008585', p_idempotency_key => 'tk-1'))->>'idempotent_replay'), 'false');
select t.eq('replay: second call', (select (public.create_my_booking(t.u(975), 2, 'Web 85', '+201000008585', p_idempotency_key => 'tk-1'))->>'idempotent_replay'), 'true');
select t.eq('replay: still exactly 2 tickets for 2 seats', (select count(*) from public.my_tickets() k where k.trip_id = t.u(975)), 2::bigint);
select t.as_admin();
select t.eq('replay: total tickets for the key', (select count(*) from tickets where trip_id = t.u(975)), 2::bigint);
select t.as_user(t.u(85));
select t.eq('cancel: owner cancels (window ok, 96 days out)', (select (public.cancel_my_booking(t.bid('tk-1')))->>'status'), 'cancelled');
select t.as_admin();
select t.eq('cancel: tickets void with a timestamp', (select count(*) from tickets where trip_id = t.u(975) and status = 'void' and voided_at is not null), 2::bigint);
select t.as_user(t.u(85));
select public.cancel_my_booking(t.bid('tk-1'));
select t.as_admin();
select t.eq('cancel: repeat does not duplicate or revive tickets', (select count(*) from tickets where trip_id = t.u(975)), 2::bigint);
select t.as_user(t.u(85));
select t.eq('cancel: no QR for a cancelled booking', left(t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.bid('tk-1'))), 5), '23514');

-- ===== customer visibility =====
select t.as_user(t.u(84));
select t.eq('my_tickets: owner sees own 3+1+1+1', (select count(*) from public.my_tickets() where trip_id in (t.u(971), t.u(972), t.u(973))), 6::bigint);
select t.eq('my_tickets: output has no hash column', (select pg_get_function_result('public.my_tickets(uuid)'::regprocedure) !~* 'hash|token'), true);
select t.eq('my_tickets: customer cannot read the table directly', left(t.err_of('select * from public.tickets'), 5), '42501');
select t.eq('my_tickets: nor the hash', left(t.err_of('select token_hash from public.tickets'), 5), '42501');
select t.eq('my_tickets: nor write', left(t.err_of($$update public.tickets set status = 'boarded'$$), 5), '42501');
select t.as_user(t.u(85));
select t.eq('my_tickets: other customer sees none of 84''s', (select count(*) from public.my_tickets(t.bk('MB-T14003'))), 0::bigint);
select t.eq('qr: other customer cannot get 84''s QR', t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.bk('MB-T14003'))), 'P0002|booking not found');
select t.as_anon();
select t.eq('my_tickets: anon refused', left(t.err_of('select * from public.my_tickets()'), 5), '42501');
select t.eq('qr: anon refused', left(t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.bk('MB-T14003'))), 5), '42501');

-- ===== QR issuing =====
select t.as_user(t.u(84));
insert into t.tok select 'b3', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14003'));
insert into t.tok select 'bx', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14004'));
insert into t.tok select 'bo', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14005'));
insert into t.tok select 'bc', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14007'));
select t.eq('qr: one payload per seat', (select count(*) from t.tok where label = 'b3'), 3::bigint);
select t.eq('qr: payload format MALAKY:TICKET:<64 base64url chars>', (select bool_and(tok ~ '^MALAKY:TICKET:[A-Za-z0-9_-]{64}$') from t.tok), true);
select t.eq('qr: tokens are distinct', (select count(distinct tok) from t.tok), (select count(*) from t.tok));
select t.eq('qr: payload carries no personal data or ids', (select bool_and(tok !~ '[ @+]' and length(tok) = 78) from t.tok where label = 'b3'), true);
select t.as_admin();
select t.eq('qr: DB stores only the hash of each token', (select count(*) from tickets k join t.tok x on x.label = 'b3' and x.idx = k.ticket_index
  where k.booking_id = t.bk('MB-T14003') and k.token_hash = sha256(convert_to(substr(x.tok, 15), 'UTF8'))), 3::bigint);
select t.eq('qr: raw token is nowhere in the table', (select count(*) from tickets k where encode(k.token_hash, 'hex') in (select substr(tok, 15) from t.tok)), 0::bigint);
-- re-issuing invalidates the previous token of the same ticket
select t.as_user(t.u(84));
insert into t.tok select 'b3new', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14003'));
select t.eq('qr: re-issue gives different tokens', (select count(*) from t.tok a join t.tok b on a.label = 'b3' and b.label = 'b3new' and a.idx = b.idx and a.tok = b.tok), 0::bigint);

-- ===== staff / tenant isolation of the table =====
select t.as_user(t.u(3));
select t.eq('staff: manager A reads ticket metadata of A', (select count(*) from public.tickets where company_id = t.u(101)) > 0, true);
select t.eq('staff: manager A sees nothing of B', (select count(*) from public.tickets where company_id = t.u(102)), 0::bigint);
select t.eq('staff: hash column is not readable even by staff', left(t.err_of('select token_hash from public.tickets'), 5), '42501');
select t.eq('staff: cannot insert tickets', left(t.err_of(format($$insert into public.tickets (company_id, booking_id, trip_id, ticket_index, token_hash) values (%L, %L, %L, 9, '\x00')$$, t.u(101), t.bk('MB-T14003'), t.u(972))), 5), '42501');
select t.as_user(t.u(7));
select t.eq('isolation: owner B sees only B tickets', (select count(distinct company_id) from public.tickets), 1::bigint);
select t.eq('isolation: owner B cannot read boarding events of A', (select count(*) from public.boarding_events), 0::bigint);
select t.as_user(t.u(6));
select t.eq('driver cannot read tickets table (RPC only)', (select count(*) from public.tickets), 0::bigint);

-- ===== driver: assigned trips only =====
select t.as_user(t.u(91));
select t.eq('driver_my_trips: A1 sees exactly its 3 live trips', (select array_agg(trip_id order by departure_at) from public.driver_my_trips() where trip_id in (t.u(971), t.u(972), t.u(973), t.u(974), t.u(975))), array[t.u(972), t.u(971)]);
select t.eq('driver_my_trips: stats for 972 (expected 7: 3+1+2+1)', (select expected from public.driver_my_trips() where trip_id = t.u(972)), 7::bigint);
select t.eq('driver_my_trips: nothing boarded yet', (select boarded from public.driver_my_trips() where trip_id = t.u(972)), 0::bigint);
select t.eq('driver_trip_boarding: other driver''s trip not found', t.err_of(format($$select public.driver_trip_boarding(%L)$$, t.u(973))), 'P0002|trip not found');
select t.eq('driver_trip_boarding: other company''s trip not found', t.err_of(format($$select public.driver_trip_boarding(%L)$$, t.u(974))), 'P0002|trip not found');
select t.as_user(t.u(93));
select t.eq('driver_my_trips: B1 sees only B', (select array_agg(trip_id) from public.driver_my_trips()), array[t.u(974)]);

-- ===== boarding: authorization =====
select t.eq('board: customer cannot board', t.board(84, t.u(972), t.tk('b3new', 1)), 'P0002|trip not found');
select t.eq('board: staff (manager) is not a driver', t.board(3, t.u(972), t.tk('b3new', 1)), 'P0002|trip not found');
select t.eq('board: other driver of the same company', t.board(92, t.u(972), t.tk('b3new', 1)), 'P0002|trip not found');
select t.eq('board: driver of another company', t.board(93, t.u(972), t.tk('b3new', 1)), 'P0002|trip not found');
select t.as_anon();
select t.eq('board: anon refused', left(t.err_of(format($$select public.board_ticket(%L, 'x')$$, t.u(972))), 5), '42501');
select t.as_admin();
select t.eq('board: nothing changed so far', (select count(*) from tickets where status = 'boarded'), 0::bigint);
-- boarding window
select t.eq('board: trip 30h out has not opened', t.board(91, t.u(971), t.tk('bx', 1)), '23514|boarding has not opened yet');

-- ===== boarding: validation =====
select t.eq('board: garbage token', t.board(91, t.u(972), 'garbage'), 'P0002|invalid ticket');
select t.eq('board: right shape, unknown token', t.board(91, t.u(972), 'MALAKY:TICKET:' || repeat('A', 64)), 'P0002|invalid ticket');
select t.eq('board: null token', t.board(91, t.u(972), null), 'P0002|invalid ticket');
select t.eq('board: SQL-ish token', t.board(91, t.u(972), $$' or 1=1 --$$), 'P0002|invalid ticket');
select t.eq('board: stale token (re-issued since) is rejected', t.board(91, t.u(972), t.tk('b3', 1)), 'P0002|invalid ticket');
select t.eq('board: ticket of another trip (same company, same driver)', t.board(91, t.u(972), t.tk('bx', 1)), '23514|ticket is for another trip');
select t.eq('board: ticket of another company looks unknown', t.board(91, t.u(972), (select 'MALAKY:TICKET:' || 'B' || repeat('b', 63))), 'P0002|invalid ticket');
select t.as_user(t.u(93));
select t.as_admin();
-- a real ticket of company B, scanned by an A driver, is indistinguishable from an unknown one
create temp table x_b as select 'MALAKY:TICKET:' || app_private.new_ticket_token() as tok;
update tickets set token_hash = sha256(convert_to(substr((select tok from x_b), 15), 'UTF8')) where booking_id = t.bk('MB-T14006');
select t.eq('board: real ticket of company B scanned by A driver = invalid ticket', t.board(91, t.u(972), (select tok from x_b)), 'P0002|invalid ticket');
select t.as_admin();
select t.eq('board: ... and nothing of B moved', (select status from tickets where booking_id = t.bk('MB-T14006')), 'valid');
select t.eq('board: other driver, own trip, but ticket of trip 972', t.board(92, t.u(973), t.tk('bc', 1)), '23514|ticket is for another trip');

-- ===== boarding: success, duplicates, stats, history =====
select t.as_user(t.u(84));
insert into t.tok select 'b3', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14003'));   -- fresh tokens again (the 'b3new' ones are now stale)
select t.as_admin();
delete from t.tok where label = 'b3' and tok in (select tok from t.tok where label = 'b3' group by tok having count(*) > 1);
select t.eq('board: valid ticket boards', t.board_ok(91, t.u(972), (select tok from t.tok where label = 'b3' order by ctid desc limit 1 offset 2)), 'boarded');
select t.as_admin();
select t.eq('board: ticket now boarded with time, user and driver', (select count(*) from tickets where status = 'boarded' and boarded_at is not null and boarded_by = t.u(91) and boarded_driver_id = t.u(961)), 1::bigint);
select t.eq('board: first scan moved trip scheduled -> boarding', (select status from trips where id = t.u(972)), 'boarding');
select t.eq('board: one history row with trip, driver, user', (select count(*) from boarding_events where trip_id = t.u(972) and driver_id = t.u(961) and user_id = t.u(91)), 1::bigint);
select t.eq('board: duplicate scan -> already_boarded', t.board_ok(91, t.u(972), (select tok from t.tok where label = 'b3' order by ctid desc limit 1 offset 2)), 'already_boarded');
select t.as_admin();
select t.eq('board: duplicate scan wrote no second event', (select count(*) from boarding_events where trip_id = t.u(972)), 1::bigint);
select t.eq('board: duplicate scan kept the original time', (select count(*) from tickets where status = 'boarded' and boarded_at = (select created_at from boarding_events where trip_id = t.u(972))), 1::bigint);
select t.as_user(t.u(91));
select t.eq('stats: expected 7, boarded 1, remaining 6', (select format('%s/%s/%s', expected, boarded, remaining) from public.driver_my_trips() where trip_id = t.u(972)), '7/1/6');
select t.eq('stats: via driver_trip_boarding', (select public.driver_trip_boarding(t.u(972))->>'boarded'), '1');
select t.eq('board: a ticket of the same booking is separate (index 1 still valid)', (select count(*) from t.tok where label = 'b3') >= 3, true);
select t.eq('board: second seat of the same booking boards', t.board_ok(91, t.u(972), (select tok from t.tok where label = 'b3' order by ctid desc limit 1 offset 1)), 'boarded');

-- ===== cancellation voids a ticket; boarded tickets are not touched =====
select t.as_admin();
select t.eq('void: ticket before cancel is valid', (select status from tickets where booking_id = t.bk('MB-T14007')), 'valid');
update bookings set status = 'cancelled', cancelled_at = now() where reference = 'MB-T14007';
select t.eq('void: booking cancel voids the ticket in the same transaction', (select status from tickets where booking_id = t.bk('MB-T14007')), 'void');
select t.eq('board: cancelled ticket is rejected', t.board(91, t.u(972), t.tk('bc', 1)), '23514|ticket is cancelled');
select t.as_admin();
select t.eq('board: rejected scan did not board it', (select status from tickets where booking_id = t.bk('MB-T14007')), 'void');
select t.eq('void: cancelling again keeps boarded tickets boarded', (select count(*) from tickets where booking_id = t.bk('MB-T14003') and status = 'boarded'), 2::bigint);
select t.as_user(t.u(91));
select t.eq('stats: expected 6 after the cancel, boarded 2', (select format('%s/%s/%s', expected, boarded, remaining) from public.driver_my_trips() where trip_id = t.u(972)), '6/2/4');

-- ===== history is append-only =====
select t.as_admin();
select t.eq('history: cannot be updated', left(t.err_of($$update boarding_events set driver_id = driver_id$$), 5), '42501');
select t.eq('history: cannot be deleted', left(t.err_of('delete from boarding_events'), 5), '42501');
select t.as_user(t.u(91));
select t.eq('history: driver cannot write it', left(t.err_of(format($$insert into public.boarding_events (company_id, ticket_id, trip_id, driver_id) values (%L, %L, %L, %L)$$, t.u(101), (select id from public.tickets limit 1), t.u(972), t.u(961))), 5), '42501');

-- ===== access is re-checked on every call (existing session, revoked access) =====
select t.as_admin();
select t.as_user(t.u(85));
insert into t.tok select 'b1', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14001'));
select t.as_admin();
update drivers set status = 'inactive' where id = t.u(961);
select t.eq('revoke: inactive driver record', t.board(91, t.u(972), t.tk('b1', 1)), 'P0002|trip not found');
select t.as_admin();
update drivers set status = 'active' where id = t.u(961);
select t.as_admin();
update profiles set is_active = false where id = t.u(91);
select t.eq('revoke: disabled account', t.board(91, t.u(972), t.tk('b1', 1)), 'P0002|trip not found');
select t.as_admin();
update profiles set is_active = true where id = t.u(91);
update company_users set status = 'suspended' where user_id = t.u(91);
select t.eq('revoke: membership disabled', t.board(91, t.u(972), t.tk('b1', 1)), 'P0002|trip not found');
select t.as_admin();
update company_users set status = 'active' where user_id = t.u(91);
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 't10' where id = t.u(101);
select t.eq('revoke: suspended company', t.board(91, t.u(972), t.tk('b1', 1)), 'P0002|trip not found');
select t.as_admin();
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(101);
select t.eq('revoke: everything restored, same call now boards', t.board_ok(91, t.u(972), t.tk('b1', 1)), 'boarded');
select t.as_admin();
select t.eq('revoke: boarded total = 2 (before) + 1 (restored call); none during revocation', (select count(*) from tickets where status = 'boarded'), 3::bigint);

-- ===== trip state =====
select t.as_admin();
select t.as_admin();
update trips set status = 'cancelled' where id = t.u(973);
select t.eq('closed: cancelled trip voids its tickets', (select count(*) from tickets where trip_id = t.u(973) and status = 'void'), 1::bigint);
select t.eq('closed: driver gets "closed" for a cancelled trip', t.board(92, t.u(973), t.tk('bo', 1)), '23514|trip is closed for boarding');
select t.as_admin();
select t.eq('seats: counters still match actual bookings', (select count(*) from app_private.seat_drift()), 0::bigint);
