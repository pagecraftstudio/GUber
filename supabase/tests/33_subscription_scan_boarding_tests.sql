-- 33: route subscriptions PHASE D (migration 0037). A subscription scan IS boarding.
-- Requires 01, 10 (driver users 91/92 of company A, 93 of company B, company B trip 974), 30 (route Sub-Go + return), 32.
-- Users: 2 ownerA, 5 bookingA, 7 ownerB, 91 driver A1 (not assigned here), 92 driver A2 (not assigned here), 93 driver B1, member 3001.
select t.as_admin();
create or replace function t.sroute33(p text) returns uuid language sql security definer as $$ select id from public.routes where name = p order by created_at desc limit 1 $$;
create or replace function t.sub33() returns uuid language sql security definer as $$ select s.id from public.route_subscriptions s join public.route_plans pl on pl.id = s.plan_id where pl.name = 'Board Range' and s.user_id = t.u(3001) $$;
create or replace function t.bk33(p_trip uuid) returns uuid language sql security definer as $$ select id from public.bookings where subscription_id = t.sub33() and trip_id = p_trip and status <> 'cancelled' $$;
create or replace function t.tstat33(p_trip uuid) returns text language sql security definer as $$ select tk.status from public.tickets tk join public.bookings b on b.id = tk.booking_id where b.subscription_id = t.sub33() and b.trip_id = p_trip $$;
create or replace function t.scans33() returns bigint language sql security definer as $$ select count(*) from public.route_subscription_scans where subscription_id = t.sub33() $$;
create or replace function t.plan33() returns uuid language sql security definer as $$ select id from public.route_plans where name = 'Board Range' $$;
create temp table tq33 (label text primary key, payload text);
grant select, insert on tq33 to public;
create or replace function t.tok33(p_label text) returns text language sql as $$ select payload from tq33 where label = p_label $$;
create or replace function t.board33(p_user int, p_trip uuid, p_label text) returns text language plpgsql as $$
declare r text;
begin
  perform t.as_user(t.u(p_user));
  begin r := (public.board_ticket(p_trip, t.tok33(p_label)))->>'result';
  exception when others then r := sqlstate || '|' || sqlerrm; end;
  return r;
end $$;

-- fixtures: driver of company A for this suite, one bus, plan + approved subscription
insert into auth.users (id, email) values (t.u(3391), 'drv33@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id) select t.u(101), t.u(3391), r.id from roles r where r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values (t.u(3331), t.u(101), 'S33-1', 30);
insert into drivers (id, company_id, user_id, full_name, phone) values (t.u(3341), t.u(101), t.u(3391), 'S33 driver', '+201300000033');
select t.as_user(t.u(2));
select public.create_route_plan(t.sroute33('Sub-Go'), 'Board Range', 600, 'range', null, current_date - 1, current_date + 120);
select t.as_user(t.u(3001));
select public.request_route_subscription(t.plan33());
select t.as_user(t.u(5));
select public.decide_route_subscription(t.sub33(), true);
select t.as_admin();
-- booking needs trips far enough ahead; they are booked then moved next to "now" (D0 = today pair, D1 / D2 = boarding already open)
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3501), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '90 day 6 hours',  date_trunc('day', now()) + interval '90 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3502), t.u(101), t.sroute33('Sub-Go (return)'), t.u(3331), t.u(3341), date_trunc('day', now()) + interval '90 day 12 hours', date_trunc('day', now()) + interval '90 day 13 hours', 50, 5, 'scheduled'),
  (t.u(3503), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '91 day 6 hours',  date_trunc('day', now()) + interval '91 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3504), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '92 day 6 hours',  date_trunc('day', now()) + interval '92 day 7 hours',  50, 5, 'scheduled');
select t.as_user(t.u(3001));
select public.create_my_subscriber_booking(t.sub33(), t.u(3501), t.u(3502));
select public.create_my_subscriber_booking(t.sub33(), t.u(3503));
select public.create_my_subscriber_booking(t.sub33(), t.u(3504));
select t.as_admin();
-- 3501/3502 sit at +14 / +104 minutes: far from the boarding window of the other trips on the same bus
update trips set departure_at = now() + interval '10 minutes', arrival_at = now() + interval '40 minutes' where id = t.u(3501);
update trips set departure_at = now() + interval '90 minutes', arrival_at = now() + interval '150 minutes' where id = t.u(3502);
update trips set departure_at = now() + interval '1 day 10 minutes', arrival_at = now() + interval '1 day 40 minutes', status = 'boarding' where id = t.u(3503);
update trips set departure_at = now() + interval '2 days 10 minutes', arrival_at = now() + interval '2 days 40 minutes', status = 'boarding' where id = t.u(3504);
select t.eq('setup: subscriber tickets exist and are valid', (select count(*) from tickets tk join bookings b on b.id = tk.booking_id where b.subscription_id = t.sub33() and tk.status = 'valid'), 4::bigint);

-- the member opens the tickets (QR rotates on every open)
select t.as_user(t.u(3001));
insert into tq33 select 'go', q.qr_payload from public.my_ticket_qr(t.bk33(t.u(3501))) q;
insert into tq33 select 'ret', q.qr_payload from public.my_ticket_qr(t.bk33(t.u(3502))) q;
insert into tq33 select 'd2', q.qr_payload from public.my_ticket_qr(t.bk33(t.u(3504))) q;
select t.eq('qr: a subscriber gets a normal ticket QR', left(t.tok33('go'), 14), 'MALAKY:TICKET:');

-- QR boarding
select t.eq('qr: a driver of the company NOT assigned to the trip is refused', t.board33(92, t.u(3501), 'go'), 'P0002|trip not found');
select t.eq('qr: a driver of another company is refused', t.board33(93, t.u(3501), 'go'), 'P0002|trip not found');
select t.eq('qr: another company driver cannot use the token on his own trip', t.board33(93, t.u(974), 'go'), 'P0002|invalid ticket');
select t.as_admin();
select t.eq('qr: nothing was recorded by the refusals', t.scans33(), 0::bigint);
select t.eq('qr: the assigned driver boards the go leg', t.board33(3391, t.u(3501), 'go'), 'boarded');
select t.as_admin();
select t.eq('qr: the ticket is boarded', t.tstat33(t.u(3501)), 'boarded');
select t.eq('qr: exactly one scan row, direction go, tied to the booking', (select count(*) from route_subscription_scans where subscription_id = t.sub33() and direction = 'go' and booking_id = t.bk33(t.u(3501)) and scanned_by = t.u(3391)), 1::bigint);
select t.eq('qr: replay is harmless (already boarded), no second scan', t.board33(3391, t.u(3501), 'go'), 'already_boarded');
select t.as_admin();
select t.eq('qr: still one scan row after the replay', t.scans33(), 1::bigint);
select t.as_user(t.u(3391));
select t.eq('qr: return leg boards as return with subscriber details', (select public.board_ticket(t.u(3502), t.tok33('ret'))->'subscriber'->>'direction'), 'return');
select t.as_admin();
select t.eq('qr: two scans now, go + return', (select string_agg(direction, ',' order by direction) from route_subscription_scans where subscription_id = t.sub33()), 'go,return');
select t.eq('qr: the scan is audited', (select count(*) from audit_logs where action = 'route_subscription.scanned' and entity_id = t.sub33()), 2::bigint);

-- MASAR fallback
select t.as_user(t.u(5));
select t.eq('masar: a boarded leg cannot be scanned again', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3501))), '23505|already scanned for this direction today');
select t.eq('masar: boards the ticket of tomorrow', (select public.scan_route_subscription(t.masar(t.u(3001)), t.u(3503)))->>'direction', 'go');
select t.as_admin();
select t.eq('masar: the ticket is boarded too', t.tstat33(t.u(3503)), 'boarded');
select t.eq('masar: a boarding event exists for it', (select count(*) from boarding_events e join tickets tk on tk.id = e.ticket_id join bookings b on b.id = tk.booking_id where b.subscription_id = t.sub33() and b.trip_id = t.u(3503)), 1::bigint);
select t.eq('masar: three scans in total', t.scans33(), 3::bigint);

-- an inactive subscription cannot board; the whole boarding rolls back
update route_subscriptions set status = 'cancelled' where id = t.sub33();
select t.eq('inactive: QR boarding refused', t.board33(3391, t.u(3504), 'd2'), '23514|subscription is not valid');
select t.as_admin();
select t.eq('inactive: the ticket stays valid, nothing recorded', t.tstat33(t.u(3504)) || ':' || t.scans33()::text, 'valid:3');
select t.as_user(t.u(5));
select t.eq('inactive: MASAR scan refused too (another active plan of the member has no booking there)', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3504))), 'P0002|no booking for this trip');   -- the member's other active plan owns no booking on that trip

-- not an ordinary-booking regression: a normal ticket still boards and reports no subscriber part
select t.as_user(t.u(91));
select t.eq('regression: ordinary tickets are unaffected (suite 10 trip, no subscriber part)', (select public.driver_trip_boarding(t.u(972)) ? 'expected'), true);

-- non-staff / member cannot scan
select t.as_user(t.u(3001));
select t.eq('masar: a member cannot scan', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3504))), 'P0002|trip not found');
select t.as_user(t.u(7));
select t.eq('masar: company B staff cannot scan a company A trip', t.err_of(format($$select public.scan_route_subscription(%L, %L)$$, t.masar(t.u(3001)), t.u(3504))), 'P0002|trip not found');
select t.as_admin();
