-- 54: P6a captcha gate on the round-trip booking RPC (migration 0058). Needs 01 (users) and 53 (t.redeem53, t.sig53; 53 ends with enforcement OFF).
-- The gate runs BEFORE the booking logic, so refused-without-pass is testable with throwaway ids; with a pass the call must fail for a BUSINESS reason, never 42501.
select t.as_user(t.u(1));
select t.passes('on: super_admin turns enforcement on', $$select public.set_captcha_enforcement(true, 'unit-test-captcha-secret-0123456789abcdef')$$);

select t.as_user(t.u(3001));
select t.eq('round trip: refused without a pass', t.err50($$select public.create_my_round_trip_booking(t.u(5401), t.u(5402), 1, 'Student One', '+201000003001', p_idempotency_key => 'c54-a')$$), '42501');
select t.eq('round trip: a pass is accepted (the fake trips are then refused for a business reason, not 42501)', t.redeem53(t.u(3001), 'booking', 'eeeeeeeeeeeeeeee'), 'ok');
select t.eq('round trip: with a pass the call gets past the gate', t.err50($$select public.create_my_round_trip_booking(t.u(5401), t.u(5402), 1, 'Student One', '+201000003001', p_idempotency_key => 'c54-b')$$) <> '42501', true);
select t.as_anon();
select t.eq('round trip: anon refused', t.err50($$select public.create_my_round_trip_booking(t.u(5401), t.u(5402), 1, 'x', '+201000003001')$$), '42501');

select t.as_user(t.u(1));
select t.passes('off: super_admin turns enforcement off again', $$select public.set_captcha_enforcement(false)$$);
select t.as_admin();
