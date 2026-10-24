-- 16: rate limiting (0020). Requires 01 fixtures, 05 (t.err_of, t.seats), 08/09 (users 84/85 with customers, t.bid, published site), 10 (helpers t.bk, t.tok, t.tk, t.board_ok; driver user 91).
-- Policies are LOWERED for the duration of the suite (so a few calls reach the ceiling) and restored at the end.
-- Note: a call that raises rolls back its own counter increment, so every "counted" call below is one that SUCCEEDS.
create or replace function t.hint_of(stmt text) returns text language plpgsql as
  $$ declare h text; begin execute stmt; return 'NO ERROR';
     exception when others then get stacked diagnostics h = pg_exception_hint; return coalesce(h, ''); end $$;
create or replace function t.hits(p_bucket text, p_user int, p_window int) returns bigint language sql security definer as
  $$ select coalesce(sum(hits), 0) from app_private.rate_limit_counters where bucket = p_bucket and subject = t.u(p_user)::text and window_seconds = p_window $$;
grant execute on function t.hits(text, int, int) to authenticated, anon;

select t.as_admin();
create temp table if not exists rl_saved_policies as select * from app_private.rate_limit_policies;
delete from app_private.rate_limit_counters;
-- own fixtures (suite 10 leaves its tickets boarded, so reusing them would make this suite depend on 10's end state)
update subscriptions set plan_id = (select id from plans where code = 'professional') where company_id = t.u(101);
insert into auth.users (id, email) values (t.u(1692), 'rl-driver@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id) select t.u(101), t.u(1692), r.id from roles r where r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values (t.u(1951), t.u(101), 'T16-A1', 20), (t.u(1952), t.u(101), 'T16-A2', 20);
insert into drivers (id, company_id, user_id, full_name, phone) values (t.u(1961), t.u(101), t.u(1692), 'T16 driver', '+201000016001');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(1601), t.u(101), t.u(201), t.u(1952), t.u(1961), now() + interval '101 days', now() + interval '101 days 2 hours', 40, 10, 'scheduled'),
  (t.u(1602), t.u(101), t.u(201), t.u(1951), t.u(1961), now() + interval '1 hour', now() + interval '3 hours', 40, 10, 'scheduled');
insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source)
select t.u(101), 'MB-T16001', t.u(1602), c.id, 3, 40, 120, 'EGP', 'confirmed', 'staff'
  from customers c where c.company_id = t.u(101) and c.user_id = t.u(84);
insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source)
select t.u(101), 'MB-T16002', t.u(1602), c.id, 1, 40, 40, 'EGP', 'confirmed', 'staff'
  from customers c where c.company_id = t.u(101) and c.user_id = t.u(85);

-- ===== policies are data, seeded, and well-formed =====
select t.eq('policies: booking.create has two tiers', (select count(*) from rl_saved_policies where bucket = 'booking.create'), 2::bigint);
select t.eq('policies: all four buckets exist', (select count(distinct bucket) from rl_saved_policies where bucket in ('booking.create','booking.cancel','ticket.qr','ticket.board')), 4::bigint);
select t.raises('policies: max_hits must be positive', $$insert into app_private.rate_limit_policies values ('x.bad', 60, 0)$$, '23514');
select t.raises('policies: bucket name is constrained', $$insert into app_private.rate_limit_policies values ('Bad Name!', 60, 5)$$, '23514');

-- ===== privileges: no API role can reach the limiter, the counters, the policies or the raw implementations =====
select t.eq('priv: authenticated cannot execute rate_limit_hit', has_function_privilege('authenticated', 'app_private.rate_limit_hit(text)', 'execute'), false);
select t.eq('priv: anon cannot execute rate_limit_hit', has_function_privilege('anon', 'app_private.rate_limit_hit(text)', 'execute'), false);
select t.eq('priv: authenticated cannot execute rate_limit_purge', has_function_privilege('authenticated', 'app_private.rate_limit_purge()', 'execute'), false);
select t.eq('priv: authenticated cannot execute create_my_booking_impl', has_function_privilege('authenticated', 'app_private.create_my_booking_impl(uuid,integer,text,text,text,text,text,uuid,uuid,text,text)', 'execute'), false);
select t.eq('priv: authenticated cannot execute cancel_my_booking_impl', has_function_privilege('authenticated', 'app_private.cancel_my_booking_impl(uuid,text)', 'execute'), false);
select t.eq('priv: authenticated cannot execute my_ticket_qr_impl', has_function_privilege('authenticated', 'app_private.my_ticket_qr_impl(uuid)', 'execute'), false);
select t.eq('priv: authenticated cannot execute board_ticket_impl', has_function_privilege('authenticated', 'app_private.board_ticket_impl(uuid,text)', 'execute'), false);
select t.eq('priv: anon cannot execute any *_impl', has_function_privilege('anon', 'app_private.board_ticket_impl(uuid,text)', 'execute') or has_function_privilege('anon', 'app_private.my_ticket_qr_impl(uuid)', 'execute'), false);
select t.eq('priv: authenticated can still execute the public wrappers', has_function_privilege('authenticated', 'public.board_ticket(uuid,text)', 'execute') and has_function_privilege('authenticated', 'public.create_my_booking(uuid,integer,text,text,text,text,text,uuid,uuid,text,text)', 'execute'), true);
select t.eq('priv: anon cannot execute the public wrappers', has_function_privilege('anon', 'public.board_ticket(uuid,text)', 'execute') or has_function_privilege('anon', 'public.cancel_my_booking(uuid,text)', 'execute') or has_function_privilege('anon', 'public.my_ticket_qr(uuid)', 'execute'), false);
select t.eq('priv: no API role touches the counters table', has_table_privilege('authenticated', 'app_private.rate_limit_counters', 'select,insert,update,delete') or has_table_privilege('anon', 'app_private.rate_limit_counters', 'select'), false);
select t.eq('priv: no API role touches the policies table', has_table_privilege('authenticated', 'app_private.rate_limit_policies', 'select,insert,update,delete') or has_table_privilege('anon', 'app_private.rate_limit_policies', 'select'), false);

-- ===== bypass attempts as a real authenticated user (the implementations and tables must be unreachable) =====
select t.as_user(t.u(84));
select t.eq('bypass: direct call of the booking implementation is denied', left(t.err_of(format($$select app_private.create_my_booking_impl(%L, 1, 'x', '+201000008484')$$, t.u(1601))), 5), '42501');
select t.eq('bypass: direct call of the cancel implementation is denied', left(t.err_of(format($$select app_private.cancel_my_booking_impl(%L)$$, t.u(1601))), 5), '42501');
select t.eq('bypass: direct call of the QR implementation is denied', left(t.err_of(format($$select * from app_private.my_ticket_qr_impl(%L)$$, t.u(1601))), 5), '42501');
select t.eq('bypass: direct call of the boarding implementation is denied', left(t.err_of(format($$select app_private.board_ticket_impl(%L, 'x')$$, t.u(972))), 5), '42501');
select t.eq('bypass: cannot call the limiter to burn someone else''s budget', left(t.err_of($$select app_private.rate_limit_hit('ticket.qr')$$), 5), '42501');
select t.eq('bypass: cannot read counters', left(t.err_of($$select * from app_private.rate_limit_counters$$), 5), '42501');
select t.eq('bypass: cannot reset own counters', left(t.err_of($$delete from app_private.rate_limit_counters$$), 5), '42501');
select t.eq('bypass: cannot raise own limit', left(t.err_of($$update app_private.rate_limit_policies set max_hits = 100000$$), 5), '42501');
select t.as_anon();
select t.eq('bypass: anon cannot call create_my_booking', left(t.err_of(format($$select public.create_my_booking(%L, 1, 'x', '+201000008484')$$, t.u(1601))), 5), '42501');
select t.eq('bypass: anon cannot call board_ticket', left(t.err_of(format($$select public.board_ticket(%L, 'x')$$, t.u(972))), 5), '42501');
select t.eq('bypass: anon cannot call my_ticket_qr', left(t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.u(1601))), 5), '42501');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
select t.eq('limiter: authenticated role without a subject is rejected (28000)', left(t.err_of($$select public.cancel_my_booking('00000000-0000-4000-8000-000000000001')$$), 5), '28000');
select t.as_admin();

-- ===== QR: ceiling, exact count, constant message, retry hint =====
update app_private.rate_limit_policies set max_hits = 2 where bucket = 'ticket.qr';
select t.as_user(t.u(84));
select t.eq('qr: call 1 allowed', (select count(*) from public.my_ticket_qr(t.bk('MB-T16001'))), 3::bigint);
select t.eq('qr: call 2 allowed', (select count(*) from public.my_ticket_qr(t.bk('MB-T16001'))), 3::bigint);
select t.eq('qr: call 3 rejected with PT429', t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.bk('MB-T16001'))), 'PT429|rate limit exceeded');
select t.eq('qr: retry hint is a positive number of seconds <= window', (select h::int between 1 and 600 from (select t.hint_of(format($$select * from public.my_ticket_qr(%L)$$, t.bk('MB-T16001'))) h) x), true);
select t.eq('qr: the rejected calls did not push the counter past the ceiling', t.hits('ticket.qr', 84, 600), 2::bigint);
select t.as_admin();
select t.eq('qr: counter row is keyed by auth.uid(), not by anything the client sent', (select count(*) from app_private.rate_limit_counters where bucket = 'ticket.qr' and subject = t.u(84)::text), 1::bigint);

-- another user is unaffected by user 84's exhaustion (per-subject isolation)
select t.as_user(t.u(85));
select t.eq('qr: other user is not throttled by 84''s budget (own booking, own budget)', (select count(*) from public.my_ticket_qr(t.bk('MB-T16002'))), 1::bigint);
select t.as_admin();

-- window rollover: an expired window no longer counts
update app_private.rate_limit_counters set window_start = window_start - interval '1 day' where bucket = 'ticket.qr' and subject = t.u(84)::text;
select t.as_user(t.u(84));
select t.eq('qr: new window after the old one expired', (select count(*) from public.my_ticket_qr(t.bk('MB-T16001'))), 3::bigint);
select t.as_admin();
select t.eq('qr: old window row kept separately, new row started at 1', (select array_agg(hits order by window_start) from app_private.rate_limit_counters where bucket = 'ticket.qr' and subject = t.u(84)::text), array[2, 1]);

-- ===== fail closed: a bucket without a policy never runs un-throttled =====
delete from app_private.rate_limit_policies where bucket = 'ticket.qr';
select t.as_user(t.u(84));
select t.eq('fail-closed: missing policy -> XX000, request refused', left(t.err_of(format($$select * from public.my_ticket_qr(%L)$$, t.bk('MB-T16001'))), 5), 'XX000');
select t.as_admin();
insert into app_private.rate_limit_policies select * from rl_saved_policies where bucket = 'ticket.qr';

-- ===== boarding: the driver's own budget; already_boarded replays are successful calls and count =====
delete from app_private.rate_limit_counters;
update app_private.rate_limit_policies set max_hits = 100 where bucket = 'ticket.qr';
select t.as_user(t.u(84));
delete from t.tok where label = 'rl';
insert into t.tok select 'rl', ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T16001'));
select t.as_admin();
update app_private.rate_limit_policies set max_hits = 2 where bucket = 'ticket.board';
select t.eq('board: scan 1 boards the ticket', t.board_ok(1692, t.u(1602), t.tk('rl', 1)), 'boarded');
select t.eq('board: scan 2 (duplicate) is a counted, successful call', t.board_ok(1692, t.u(1602), t.tk('rl', 1)), 'already_boarded');
select t.eq('board: scan 3 is throttled (PT429)', t.board_ok(1692, t.u(1602), t.tk('rl', 2)), 'PT429|rate limit exceeded');
select t.as_admin();
select t.eq('board: the throttled scan did not board anything', (select count(*) from tickets where booking_id = t.bk('MB-T16001') and status = 'boarded'), 1::bigint);
select t.as_user(t.u(91));
select t.eq('board: throttling is per driver (driver 91 is not blocked by driver 1692; fails on authz, not on the limiter)', left(t.err_of(format($$select public.board_ticket(%L, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, t.u(972))), 5), 'P0002');
select t.as_admin();

-- ===== cancel: successful no-op cancels count; a cancelled booking cannot be used to bypass the ceiling =====
delete from app_private.rate_limit_counters;
update app_private.rate_limit_policies set max_hits = 3 where bucket = 'booking.cancel';
select t.as_user(t.u(85));
select t.eq('cancel: setup booking', (select (public.create_my_booking(t.u(1601), 1, 'Web 85', '+201000008585', p_idempotency_key => 'rl-c1'))->>'status'), 'confirmed');
select t.eq('cancel: first cancel', (select (public.cancel_my_booking(t.bid('rl-c1')))->>'status'), 'cancelled');
select t.eq('cancel: repeat cancel (already_cancelled) is allowed but counted', (select (public.cancel_my_booking(t.bid('rl-c1')))->>'already_cancelled'), 'true');
select t.eq('cancel: third allowed', (select (public.cancel_my_booking(t.bid('rl-c1')))->>'already_cancelled'), 'true');
select t.eq('cancel: fourth is PT429', left(t.err_of(format($$select public.cancel_my_booking(%L)$$, t.bid('rl-c1'))), 5), 'PT429');
select t.eq('cancel: seats were released exactly once', t.seats(t.u(1601)), 0);
select t.as_admin();

-- ===== booking: two tiers (short + daily); an idempotent replay is a successful call and counts =====
delete from app_private.rate_limit_counters;
update app_private.rate_limit_policies set max_hits = 100 where bucket = 'booking.create' and window_seconds = 600;
update app_private.rate_limit_policies set max_hits = 2   where bucket = 'booking.create' and window_seconds = 86400;
select t.as_user(t.u(84));
select t.eq('booking: first create', (select (public.create_my_booking(t.u(1601), 2, 'Web 84', '+201000008484', p_idempotency_key => 'rl-b1'))->>'idempotent_replay'), 'false');
select t.eq('booking: replay counts as a call', (select (public.create_my_booking(t.u(1601), 2, 'Web 84', '+201000008484', p_idempotency_key => 'rl-b1'))->>'idempotent_replay'), 'true');
select t.eq('booking: daily ceiling reached -> PT429', left(t.err_of(format($$select public.create_my_booking(%L, 2, 'Web 84', '+201000008484', p_idempotency_key => 'rl-b2')$$, t.u(1601))), 5), 'PT429');
select t.eq('booking: daily counter = 2', t.hits('booking.create', 84, 86400), 2::bigint);
select t.eq('booking: short-tier counter also 2 (the rejected call rolled back BOTH tiers)', t.hits('booking.create', 84, 600), 2::bigint);
select t.as_admin();
select t.eq('booking: the throttled request created no booking and held no seats', (select count(*) from bookings where idempotency_key = 'rl-b2'), 0::bigint);
select t.eq('booking: exactly one booking exists for the replayed key', (select count(*) from bookings where idempotency_key = 'rl-b1'), 1::bigint);

-- ===== housekeeping =====
update app_private.rate_limit_counters set window_start = window_start - interval '30 days';
select t.eq('purge: removes only windows that ended more than an hour ago', app_private.rate_limit_purge() > 0, true);
select t.eq('purge: nothing left to remove', app_private.rate_limit_purge(), 0::bigint);

-- restore the real policies so later suites / manual inspection see production values
delete from app_private.rate_limit_policies;
insert into app_private.rate_limit_policies select * from rl_saved_policies;
delete from app_private.rate_limit_counters;
select t.eq('restore: policies back to the migration values', (select count(*) from app_private.rate_limit_policies), 5::bigint);
