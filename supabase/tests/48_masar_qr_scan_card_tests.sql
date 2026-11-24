-- 48: Item 1 (migration 0052): signed MASAR QR + the driver scan card + confirm_boarding.
-- Requires 01, 10 (drivers 92 = company A not assigned here, 93 = company B, company B trip 974), 30 (routes Sub-Go + its return; members
-- 3001 / 3002 / 3003 with profiles), 33 style fixtures are re-created here under their own names.
-- Cast: 3001 subscriber of company A (plan 'Card Range'), 3002 a student with no tie to A, 3003 subscribed to company B only,
--       4891 driver of company A assigned to the trips below, 92 driver of A NOT assigned, 93 driver of B, 5 bookingA (staff, bookings.write).
select t.as_admin();
create or replace function t.mid48(p int) returns text language sql security definer as $$ select masar_id from public.profiles where id = t.u(p) $$;
create or replace function t.route48(p text) returns uuid language sql security definer as $$ select id from public.routes where name = p order by created_at desc limit 1 $$;
create or replace function t.plan48() returns uuid language sql security definer as $$ select id from public.route_plans where name = 'Card Range' $$;
create or replace function t.sub48() returns uuid language sql security definer as $$ select s.id from public.route_subscriptions s where s.plan_id = t.plan48() and s.user_id = t.u(3001) $$;
create or replace function t.bk48(p_trip uuid) returns uuid language sql security definer as $$ select id from public.bookings where subscription_id = t.sub48() and trip_id = p_trip and status <> 'cancelled' $$;
create or replace function t.tk48(p_trip uuid) returns text language sql security definer as $$ select tk.status from public.tickets tk join public.bookings b on b.id = tk.booking_id where b.subscription_id = t.sub48() and b.trip_id = p_trip $$;
create or replace function t.tid48(p_trip uuid) returns uuid language sql security definer as $$ select tk.id from public.tickets tk join public.bookings b on b.id = tk.booking_id where b.subscription_id = t.sub48() and b.trip_id = p_trip order by tk.ticket_index limit 1 $$;
create or replace function t.cnt48(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.forge48(p_masar text, p_exp bigint, p_kid int default 1) returns text language plpgsql security definer as $$
declare v_body text; v_key bytea;
begin
  select secret into v_key from app_private.masar_qr_keys where kid = 1;
  v_body := 'MQ1.' || p_kid || '.' || p_masar || '.' || p_exp;
  return v_body || '.' || app_private.b64url(app_private.hmac_sha256(v_key, convert_to(v_body, 'UTF8')));
end $$;
create or replace function t.sc48(p_user int, p_code text, p_trip uuid) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform t.as_user(t.u(p_user));
  begin r := public.scan_identity(p_code, p_trip);
  exception when others then r := jsonb_build_object('err', sqlstate || '|' || sqlerrm); end;
  return r;
end $$;
create or replace function t.cb48(p_user int, p_trip uuid, p_ticket uuid) returns text language plpgsql as $$
declare r text;
begin
  perform t.as_user(t.u(p_user));
  begin r := (public.confirm_boarding(p_trip, p_ticket))->>'result';
  exception when others then r := sqlstate || '|' || sqlerrm; end;
  return r;
end $$;
create temp table tq48 (label text primary key, payload text);
grant select, insert on tq48 to public;
create or replace function t.tok48(p_label text) returns text language sql as $$ select payload from tq48 where label = p_label $$;

-- fixtures ---------------------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values (t.u(4891), 'drv48@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id) select t.u(101), t.u(4891), r.id from roles r where r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values (t.u(4831), t.u(101), 'S48-1', 30);
insert into drivers (id, company_id, user_id, full_name, phone) values (t.u(4841), t.u(101), t.u(4891), 'S48 driver', '+201300000048');
select t.as_user(t.u(2));
select public.create_route_plan(t.route48('Sub-Go'), 'Card Range', 600, 'range', null, current_date - 1, current_date + 120);
select t.as_user(t.u(3001));
select public.request_route_subscription(t.plan48());
select t.as_user(t.u(5));
select public.decide_route_subscription(t.sub48(), true);
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(4851), t.u(101), t.route48('Sub-Go'),          t.u(4831), t.u(4841), date_trunc('day', now()) + interval '90 day 6 hours',  date_trunc('day', now()) + interval '90 day 7 hours',  50, 5, 'scheduled'),
  (t.u(4852), t.u(101), t.route48('Sub-Go (return)'), t.u(4831), t.u(4841), date_trunc('day', now()) + interval '90 day 12 hours', date_trunc('day', now()) + interval '90 day 13 hours', 50, 5, 'scheduled'),
  (t.u(4853), t.u(101), t.route48('Sub-Go'),          t.u(4831), t.u(4841), date_trunc('day', now()) + interval '91 day 6 hours',  date_trunc('day', now()) + interval '91 day 7 hours',  50, 5, 'scheduled');
select t.as_user(t.u(3001));
select public.create_my_subscriber_booking(t.sub48(), t.u(4851), t.u(4852));
select public.create_my_subscriber_booking(t.sub48(), t.u(4853));
select t.as_admin();
update trips set departure_at = now() + interval '10 minutes',  arrival_at = now() + interval '40 minutes'  where id = t.u(4851);
update trips set departure_at = now() + interval '90 minutes',  arrival_at = now() + interval '150 minutes' where id = t.u(4852);
update trips set departure_at = now() + interval '1 day 10 minutes', arrival_at = now() + interval '1 day 40 minutes', status = 'boarding' where id = t.u(4853);
select t.eq('setup: three subscriber tickets are valid', t.cnt48($$select count(*) from tickets tk join bookings b on b.id = tk.booking_id where b.subscription_id = t.sub48() and tk.status = 'valid'$$), 3::bigint);
-- cumulative runs: earlier suites left other subscriptions for 3001/3002 in company A, which would make 3002 a non-stranger and hide lapses of Card Range
update route_subscriptions set status = 'cancelled' where company_id = t.u(101) and user_id in (t.u(3001), t.u(3002)) and plan_id is distinct from t.plan48() and status in ('active', 'expired');

-- 1. the student's QR -----------------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.eq('qr: anon cannot ask for a QR', t.err_of($$select public.my_masar_qr()$$) like '42501%', true);
select t.as_user(t.u(3001));
insert into tq48 select 'qr', (public.my_masar_qr())->>'token';
select t.eq('qr: token has the MQ1 shape and carries the student''s own MASAR ID', t.tok48('qr') ~ ('^MQ1\.1\.' || t.mid48(3001) || '\.[0-9]{10}\.[A-Za-z0-9_-]{43}$'), true);
select t.eq('qr: lifetime is 90 seconds', (public.my_masar_qr())->>'ttl_seconds', '90');
select t.eq('qr: the signing keys are not readable by a signed-in user', t.err_of($$select secret from app_private.masar_qr_keys$$) like '42501%', true);
select t.eq('qr: the HMAC helper is not callable by a signed-in user', t.err_of($$select app_private.hmac_sha256('\x00'::bytea, '\x00'::bytea)$$) like '42501%', true);

-- 2. who may scan ---------------------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.eq('auth: anon refused', t.err_of(format($$select public.scan_identity(%L, %L)$$, t.tok48('qr'), t.u(4851)::text)) like '42501%', true);
select t.eq('auth: a driver of A who is NOT assigned to the trip gets nothing', t.sc48(92, t.tok48('qr'), t.u(4851))->>'err', 'P0002|trip not found');
select t.eq('auth: a driver of another company gets nothing', t.sc48(93, t.tok48('qr'), t.u(4851))->>'err', 'P0002|trip not found');
select t.eq('auth: a student cannot use the scan card', t.sc48(3002, t.tok48('qr'), t.u(4851))->>'err', 'P0002|trip not found');

-- 3. the card for a subscriber with a booking on this trip ---------------------------------------------------------------------------
select t.eq('card(qr): verdict ok, boarding allowed', t.sc48(4891, t.tok48('qr'), t.u(4851))->>'verdict', 'ok_not_yet_boarded');
select t.eq('card(qr): can_board', (t.sc48(4891, t.tok48('qr'), t.u(4851))->>'can_board')::boolean, true);
select t.eq('card(qr): verified', (t.sc48(4891, t.tok48('qr'), t.u(4851))->>'verified')::boolean, true);
select t.eq('card(qr): name and MASAR ID for a related student', t.sc48(4891, t.tok48('qr'), t.u(4851))->'student'->>'masar_id', t.mid48(3001));
select t.eq('card(qr): subscription here is valid, with the plan name', t.sc48(4891, t.tok48('qr'), t.u(4851))->'subscription'->>'plan_name', 'Card Range');
select t.eq('card(qr): subscription state valid', t.sc48(4891, t.tok48('qr'), t.u(4851))->'subscription'->>'state', 'valid');
select t.eq('card(qr): direction go, nothing used yet', t.sc48(4891, t.tok48('qr'), t.u(4851))->'subscription'->>'direction' || '/' || (t.sc48(4891, t.tok48('qr'), t.u(4851))->'subscription'->>'go_used'), 'go/false');
select t.eq('card(qr): booking reference present, not boarded', (t.sc48(4891, t.tok48('qr'), t.u(4851))->'booking'->>'boarded')::boolean, false);
select t.eq('card(qr): a staff member with bookings.write may scan too', t.sc48(5, t.tok48('qr'), t.u(4851))->>'verdict', 'ok_not_yet_boarded');
select t.eq('card(typed id): same verdict, but flagged UNVERIFIED', (t.sc48(4891, t.mid48(3001), t.u(4851))->>'verified')::boolean, false);
select t.eq('card(typed id): lower case is accepted', t.sc48(4891, lower(t.mid48(3001)), t.u(4851))->>'verdict', 'ok_not_yet_boarded');
select t.as_admin();
select t.eq('card: scanning never boards anyone (ticket still valid)', t.tk48(t.u(4851)), 'valid');
select t.eq('card: scanning wrote no daily scan row', t.cnt48($$select count(*) from route_subscription_scans where subscription_id = t.sub48()$$), 0::bigint);
select t.eq('card: scanning wrote no boarding event', t.cnt48($$select count(*) from boarding_events where trip_id = t.u(4851)$$), 0::bigint);

-- 4. bad codes ------------------------------------------------------------------------------------------------------------------------
select t.eq('bad: garbage is "invalid code"', t.sc48(4891, 'hello', t.u(4851))->>'err', 'P0002|invalid code');
select t.eq('bad: a tampered signature is "invalid code"', t.sc48(4891, left(t.tok48('qr'), length(t.tok48('qr')) - 1) || case when right(t.tok48('qr'), 1) = 'A' then 'B' else 'A' end, t.u(4851))->>'err', 'P0002|invalid code');
select t.eq('bad: swapping the MASAR ID inside a signed token is "invalid code"', t.sc48(4891, replace(t.tok48('qr'), t.mid48(3001), t.mid48(3002)), t.u(4851))->>'err', 'P0002|invalid code');
select t.eq('bad: an unknown key id is "invalid code"', t.sc48(4891, t.forge48(t.mid48(3001), extract(epoch from now())::bigint + 60, 7), t.u(4851))->>'err', 'P0002|invalid code');
select t.eq('bad: a token that is not ours, signed far in the future, is "invalid code"', t.sc48(4891, t.forge48(t.mid48(3001), extract(epoch from now())::bigint + 100000), t.u(4851))->>'err', 'P0002|invalid code');
select t.eq('expired: a correctly signed but old token says so (and shows no person)', t.sc48(4891, t.forge48(t.mid48(3001), extract(epoch from now())::bigint - 5), t.u(4851))->>'verdict', 'qr_expired');
select t.eq('expired: ...with no student details', (t.sc48(4891, t.forge48(t.mid48(3001), extract(epoch from now())::bigint - 5), t.u(4851)))->'student', 'null'::jsonb);
select t.eq('ticket: an unknown ticket QR is "invalid ticket"', t.sc48(4891, 'MALAKY:TICKET:' || repeat('a', 40), t.u(4851))->>'err', 'P0002|invalid ticket');

-- 5. people with no tie to this company ------------------------------------------------------------------------------------------------
select t.eq('stranger: verdict no_subscription', t.sc48(4891, t.mid48(3002), t.u(4851))->>'verdict', 'no_subscription');
select t.eq('stranger: NO name is shown, only the MASAR ID', (t.sc48(4891, t.mid48(3002), t.u(4851))->'student'->'name'), 'null'::jsonb);
select t.eq('stranger: not another company''s subscriber either (yet)', (t.sc48(4891, t.mid48(3002), t.u(4851))->>'has_other_company_subscription')::boolean, false);
select t.eq('unknown id looks exactly like a stranger (no enumeration)', t.sc48(4891, 'MSR-ZZZZ-ZZZZ', t.u(4851)) - 'student', t.sc48(4891, t.mid48(3002), t.u(4851)) - 'student');
-- 3003 holds an ACTIVE subscription with company B only
select t.as_admin();
insert into route_plans (company_id, route_id, name, price, validity_type, starts_on, ends_on)
  values (t.u(102), (select route_id from trips where id = t.u(974)), 'B Card Plan', 0, 'range', current_date - 1, current_date + 100);
insert into route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, status, price, currency, valid_from, valid_to, paid_at)
  values (t.u(102), (select id from route_plans where name = 'B Card Plan'), t.u(3003), t.mid48(3003), 'Three', '+201000030003', 'active', 0, 'EGP', current_date - 1, current_date + 100, now());
select t.eq('other company: the card says so with a boolean only', (t.sc48(4891, t.mid48(3003), t.u(4851))->>'has_other_company_subscription')::boolean, true);
select t.eq('other company: verdict no_subscription here', t.sc48(4891, t.mid48(3003), t.u(4851))->>'verdict', 'no_subscription');
select t.eq('other company: no name, no plan, no company in the card', (t.sc48(4891, t.mid48(3003), t.u(4851)) - 'has_other_company_subscription' - 'verdict' - 'can_board' - 'kind' - 'verified' - 'student')::text, '{"subscription": null, "booking": null}'::jsonb::text);

-- 6. confirm_boarding: the driver's button ---------------------------------------------------------------------------------------------
select t.eq('confirm: an unassigned driver is refused', t.cb48(92, t.u(4851), t.tid48(t.u(4851))), 'P0002|trip not found');
select t.eq('confirm: a driver of another company is refused', t.cb48(93, t.u(4851), t.tid48(t.u(4851))), 'P0002|trip not found');
select t.eq('confirm: a ticket of ANOTHER trip is refused', t.cb48(4891, t.u(4851), t.tid48(t.u(4853))), '23514|ticket is for another trip');
select t.eq('confirm: an unknown ticket id is refused', t.cb48(4891, t.u(4851), t.u(4999)), 'P0002|invalid ticket');
select t.as_admin();
select t.eq('confirm: nothing happened after the refusals', t.tk48(t.u(4851)) || '/' || t.cnt48($$select count(*) from route_subscription_scans where subscription_id = t.sub48()$$), 'valid/0');
select t.eq('confirm: the assigned driver boards', t.cb48(4891, t.u(4851), t.tid48(t.u(4851))), 'boarded');
select t.as_admin();
select t.eq('confirm: the ticket is boarded', t.tk48(t.u(4851)), 'boarded');
select t.eq('confirm: one daily scan row (go), by the driver', t.cnt48($$select count(*) from route_subscription_scans where subscription_id = t.sub48() and direction = 'go' and scanned_by = t.u(4891)$$), 1::bigint);
select t.eq('confirm: a second press is harmless', t.cb48(4891, t.u(4851), t.tid48(t.u(4851))), 'already_boarded');
select t.as_admin();
select t.eq('confirm: ...and still exactly one scan row', t.cnt48($$select count(*) from route_subscription_scans where subscription_id = t.sub48()$$), 1::bigint);
select t.eq('card after boarding: ok_boarded, boarding no longer offered', t.sc48(4891, t.mid48(3001), t.u(4851))->>'verdict', 'ok_boarded');
select t.eq('card after boarding: can_board false', (t.sc48(4891, t.mid48(3001), t.u(4851))->>'can_board')::boolean, false);
select t.eq('card on the RETURN trip shows the go leg already used today', (t.sc48(4891, t.mid48(3001), t.u(4852))->'subscription'->>'go_used')::boolean, true);
select t.eq('card on the RETURN trip: direction is return and boarding is allowed', t.sc48(4891, t.mid48(3001), t.u(4852))->'subscription'->>'direction' || '/' || (t.sc48(4891, t.mid48(3001), t.u(4852))->>'can_board'), 'return/true');

-- 7. ticket QR through the same card, cancelled and expired states --------------------------------------------------------------------
select t.as_user(t.u(3001));
insert into tq48 select 'tk3', q.qr_payload from public.my_ticket_qr(t.bk48(t.u(4853))) q;
select t.eq('ticket card: ok, with the booking and not boarded', t.sc48(4891, t.tok48('tk3'), t.u(4853))->>'verdict', 'ok_not_yet_boarded');
select t.eq('ticket card: kind ticket, verified', (t.sc48(4891, t.tok48('tk3'), t.u(4853))->>'kind') || '/' || (t.sc48(4891, t.tok48('tk3'), t.u(4853))->>'verified'), 'ticket/true');
select t.eq('ticket card: the same ticket on another trip says wrong_trip', t.sc48(4891, t.tok48('tk3'), t.u(4851))->>'verdict', 'wrong_trip');
select t.as_admin();
update route_subscriptions set valid_to = current_date - 1, valid_from = current_date - 30 where id = t.sub48();
select t.eq('expired: a booking whose subscription has lapsed says expired', t.sc48(4891, t.tok48('tk3'), t.u(4853))->>'verdict', 'expired');
select t.eq('expired: ...and boarding is refused under the lock too', t.cb48(4891, t.u(4853), t.tid48(t.u(4853))), '23514|subscription is not valid');
select t.as_admin();
select t.eq('expired: the refused confirm did not board', t.tk48(t.u(4853)), 'valid');
update route_subscriptions set valid_to = current_date + 120, valid_from = current_date - 1 where id = t.sub48();
select t.as_admin();
update trips set status = 'scheduled' where id = t.u(4853);   -- a boarding trip is closed to cancellation
select t.as_user(t.u(3001));
select public.cancel_my_booking(t.bk48(t.u(4853)), 'test');
select t.as_admin();
update trips set status = 'boarding' where id = t.u(4853);   -- scanning needs the trip open again
select t.eq('cancelled: the card says cancelled', t.sc48(4891, t.tok48('tk3'), t.u(4853))->>'verdict', 'cancelled');
select t.as_admin();
select t.eq('cancelled: confirm is refused', t.cb48(4891, t.u(4853), (select id from tickets where booking_id = (select id from bookings where subscription_id = t.sub48() and trip_id = t.u(4853) limit 1) limit 1)), '23514|ticket is cancelled');

-- 8. audit: every scan is recorded, without personal data ------------------------------------------------------------------------------
select t.as_admin();
select t.eq('audit: identity scans are logged', t.cnt48($$select count(*) from audit_logs where action = 'identity.scanned' and company_id = t.u(101)$$) > 10, true);
select t.eq('audit: metadata carries verdict and kind only (no name, no MASAR ID)', t.cnt48($$select count(*) from audit_logs where action = 'identity.scanned' and (metadata::text ilike '%MSR-%' or metadata::text ilike '%Sub One%')$$), 0::bigint);
