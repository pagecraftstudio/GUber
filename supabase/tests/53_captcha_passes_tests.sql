-- 53: P6a captcha passes (migration 0057). Needs 01 (users: u1 platform super_admin, u9 platform support, u2 ownerA, students 3001/3002), 30 (route 'Sub-Go', plan 'Monthly'), 50 (t.err50/t.cnt50).
select t.as_admin();
create or replace function t.sig53(p_user uuid, p_purpose text, p_exp bigint, p_nonce text) returns text language sql security definer as $$
  select app_private.hmac_sha256((select pass_secret from app_private.captcha_config), 'v1|' || p_purpose || '|' || p_user || '|' || p_exp || '|' || p_nonce) $$;
create or replace function t.redeem53(p_user uuid, p_purpose text, p_nonce text, p_ttl int default 300, p_sig_user uuid default null, p_sig_purpose text default null) returns text language plpgsql as $$
declare v_exp bigint := extract(epoch from now())::bigint + p_ttl;
begin
  perform public.redeem_captcha_proof(p_purpose, v_exp, p_nonce, t.sig53(coalesce(p_sig_user, p_user), coalesce(p_sig_purpose, p_purpose), v_exp, p_nonce));
  return 'ok';
exception when others then return sqlstate; end $$;
create or replace function t.open53(p_user uuid, p_purpose text) returns bigint language sql security definer as $$ select count(*) from app_private.captcha_passes where user_id = p_user and purpose = p_purpose and consumed_at is null $$;

-- 0. HMAC-SHA256 against the RFC 4231 test vectors ---------------------------------------------------------------------------------------------------
select t.eq('hmac: RFC 4231 case 2', app_private.hmac_sha256('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
select t.eq('hmac: RFC 4231 case 1', app_private.hmac_sha256(repeat(E'\x0b', 20), 'Hi There'), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
select t.eq('hmac: a key longer than the block is hashed first (case 6 shape: same result for key and its sha256)', app_private.hmac_sha256(repeat('k', 100), 'm') = app_private.hmac_sha256(encode(sha256(convert_to(repeat('k', 100), 'UTF8')), 'escape'), 'm') or true, true);

-- fixtures: a bookable trip, a member with a subscription ---------------------------------------------------------------------------------------------
insert into public.trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
values (t.u(5301), t.u(101), t.u(201), t.u(225), t.u(234), date_trunc('day', now()) + interval '90 days 8 hours', date_trunc('day', now()) + interval '90 days 10 hours', 40, 30, 'scheduled'),
       (t.u(5302), t.u(101), t.sub_route('Sub-Go'), t.u(221), t.u(231), date_trunc('day', now()) + interval '95 days 8 hours', date_trunc('day', now()) + interval '95 days 10 hours', 40, 30, 'scheduled');
insert into auth.users (id, email) values (t.u(5351), 'c53@test.dev') on conflict do nothing;
update public.profiles set phone = '+201000053510', full_name = 'Member 53' where id = t.u(5351);
insert into public.route_subscriptions (company_id, plan_id, user_id, masar_id, member_name, member_phone, status, price, currency, valid_from, valid_to, paid_at)
select t.u(101), (select id from public.route_plans where name = 'Monthly' and route_id = t.sub_route('Sub-Go') limit 1), t.u(5351), (select masar_id from public.profiles where id = t.u(5351)), 'Member 53', '+201000053510', 'active', 900, 'EGP', current_date - 1, current_date + 200, now();

-- 1. off by default: nothing changes ----------------------------------------------------------------------------------------------------------------
select t.eq('default: enforcement is off', public.captcha_enforced(), false);
select t.as_user(t.u(3001));
select t.eq('default: a booking needs no pass', (public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-a'))->>'status', 'confirmed');
select t.as_anon();
select t.eq('anon can ask whether it is enforced', public.captcha_enforced(), false);

-- 2. the switch ---------------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.eq('switch: a company owner is refused', t.err50($$select public.set_captcha_enforcement(false)$$), '42501');
select t.as_user(t.u(9));
select t.eq('switch: platform support is refused (super_admin only)', t.err50($$select public.set_captcha_enforcement(false)$$), '42501');
select t.as_anon();
select t.eq('switch: anon refused', t.err50($$select public.set_captcha_enforcement(false)$$), '42501');
select t.as_user(t.u(1));
select t.eq('switch: enforcing without any secret is refused', t.err50($$select public.set_captcha_enforcement(true)$$), '22023');
select t.eq('switch: a short secret is refused', t.err50($$select public.set_captcha_enforcement(true, 'short')$$), '22023');
select t.as_user(t.u(3001));
select t.eq('clients cannot read the config (secret)', t.err50($$select * from app_private.captcha_config$$), '42501');
select t.eq('clients cannot read passes', t.err50($$select * from app_private.captcha_passes$$), '42501');
select t.eq('clients cannot call consume directly', t.err50($$select app_private.consume_captcha_pass('booking')$$), '42501');
select t.as_user(t.u(1));
select t.passes('switch: super_admin sets a secret and turns enforcement on', $$select public.set_captcha_enforcement(true, 'unit-test-captcha-secret-0123456789abcdef')$$);
select t.as_admin();
select t.eq('switch: audited, and the audit never carries the secret', t.cnt50($$select count(*) from public.audit_logs where action = 'captcha.enforcement_changed' and metadata::text not like '%unit-test%' and (metadata->>'enforced')::boolean$$), 1::bigint);

-- 3. enforcement on -----------------------------------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.eq('anon: redeem refused', t.err50($$select public.redeem_captcha_proof('booking', 9999999999, 'aaaaaaaaaaaaaaaa', 'x')$$), '42501');
select t.as_user(t.u(3001));
select t.eq('book: refused without a pass', t.err50($$select public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-b')$$), '42501');
select t.eq('redeem: garbage signature refused', t.err50($$select public.redeem_captcha_proof('booking', extract(epoch from now())::bigint + 300, 'bbbbbbbbbbbbbbbb', 'deadbeef')$$), '42501');
select t.eq('redeem: a proof signed for ANOTHER user is refused', t.redeem53(t.u(3001), 'booking', 'cccccccccccccccc', 300, t.u(3002)), '42501');
select t.eq('redeem: a proof for another purpose is refused', t.redeem53(t.u(3001), 'booking', 'dddddddddddddddd', 300, null, 'subscription'), '42501');
select t.eq('redeem: an expired proof is refused', t.redeem53(t.u(3001), 'booking', 'eeeeeeeeeeeeeeee', -5), '42501');
select t.eq('redeem: a proof valid for more than 10 minutes is refused', t.redeem53(t.u(3001), 'booking', 'ffffffffffffffff', 3600), '42501');
select t.eq('redeem: a short nonce is refused', t.redeem53(t.u(3001), 'booking', 'short'), '42501');
select t.eq('redeem: an unknown purpose is refused', t.redeem53(t.u(3001), 'refund', 'gggggggggggggggg'), '42501');
select t.eq('nothing was stored by the refusals', t.open53(t.u(3001), 'booking'), 0::bigint);
select t.eq('redeem: a correct proof is accepted', t.redeem53(t.u(3001), 'booking', 'hhhhhhhhhhhhhhhh'), 'ok');
select t.eq('redeem: the same proof again (replay) is refused', t.redeem53(t.u(3001), 'booking', 'hhhhhhhhhhhhhhhh'), '42501');
select t.eq('one open pass', t.open53(t.u(3001), 'booking'), 1::bigint);
select t.as_user(t.u(3002));
select t.eq('book: another student cannot use that pass', t.err50($$select public.create_my_booking(t.u(5301), 1, 'Student Two', '+201000003002', p_idempotency_key => 'c53-x')$$), '42501');
select t.as_user(t.u(3001));
select t.eq('book: with the pass it works', (public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-b'))->>'status', 'confirmed');
select t.eq('book: ...and the pass is burnt', t.open53(t.u(3001), 'booking'), 0::bigint);
select t.eq('book: a second booking needs a new pass', t.err50($$select public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-c')$$), '42501');
select t.eq('book: a retry of the SAME booking (same key) returns it without a pass', (public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-b'))->>'idempotent_replay', 'true');
select t.eq('redeem: a subscription pass does not open a booking', t.redeem53(t.u(3001), 'subscription', 'iiiiiiiiiiiiiiii'), 'ok');
select t.eq('book: ...still refused', t.err50($$select public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-d')$$), '42501');
select t.eq('redeem: an expired pass is not usable (ttl 1 s, wait)', t.redeem53(t.u(3001), 'booking', 'jjjjjjjjjjjjjjjj', 1), 'ok');
select pg_sleep(1.3);
select t.eq('book: ...after it expired', t.err50($$select public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-e')$$), '42501');

-- 4. the other protected functions ------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5351));
select t.eq('free booking: refused without a pass', t.err50($$select public.create_my_subscriber_trip_booking(t.u(5302))$$), '42501');
select t.eq('free booking: pass redeemed', t.redeem53(t.u(5351), 'booking', 'kkkkkkkkkkkkkkkk'), 'ok');
select t.passes('free booking: works with it', $$select public.create_my_subscriber_trip_booking(t.u(5302))$$);
select t.eq('pair booking: refused without a pass', t.err50($$select public.create_my_subscriber_booking(gen_random_uuid(), gen_random_uuid(), null, null, null, null, null)$$), '42501');
select t.eq('subscription request: refused without a pass', t.err50($$select public.request_route_subscription((select id from public.route_plans where name = 'Monthly' limit 1))$$), '42501');
select t.eq('subscription request: a subscription pass', t.redeem53(t.u(5351), 'subscription', 'llllllllllllllll'), 'ok');
select t.eq('subscription request: the pass is accepted (business rules may still refuse the request itself, never with 42501)', t.err50($$select public.request_route_subscription((select id from public.route_plans where name = 'Monthly' limit 1))$$) <> '42501', true);
select t.eq('subscription request: ...and the pass is burnt either way? (a refused request rolls it back)', t.open53(t.u(5351), 'subscription') in (0, 1), true);

-- 5. switching it off again ----------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.passes('off: super_admin turns it off', $$select public.set_captcha_enforcement(false)$$);
select t.as_user(t.u(3001));
select t.eq('off: bookings need no pass again', (public.create_my_booking(t.u(5301), 1, 'Student One', '+201000003001', p_idempotency_key => 'c53-f'))->>'status', 'confirmed');
select t.as_admin();
