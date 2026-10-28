-- 17: company lifecycle policy (Phase 8E). Requires 01..16 on the same throw-away DB.
-- What a SUSPENDED company and an EXPIRED subscription may and may not do, per role. State is restored at the end.
-- Fixtures reused: company A u(101); trip 972 (boarding window open, driver user u(91)); trip 975 (+96d, cap 5);
-- booking MB-T14002 (customer user u(85), 2 valid tickets on 972); customer user u(83) books on 975 here.
select t.as_admin();
update subscriptions set current_period_start = now() - interval '5 days', current_period_end = now() + interval '30 days' where company_id = t.u(101);
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(101);
insert into auth.users (id, email) values (t.u(83), 'web83@test.dev') on conflict do nothing;

-- a booking made while everything is healthy, and a driver-scannable token
select t.as_user(t.u(83));
select t.eq('17 setup: healthy company accepts a web booking', (select (public.create_my_booking(t.u(975), 1, 'Web 83', '+201000017083', p_idempotency_key => 'l17-a'))->>'status'), 'confirmed');
select t.as_admin();
create temp table l17_b as select id from bookings where idempotency_key = 'l17-a';
grant all on l17_b to authenticated;
select t.as_user(t.u(85));
create temp table l17_tok as select ticket_index, qr_payload from public.my_ticket_qr(t.bk('MB-T14002'));
grant all on l17_tok to authenticated;
select t.eq('17 setup: customer got 2 QR payloads', (select count(*) from l17_tok), 2::bigint);
select t.as_user(t.u(91));
select t.eq('17 setup: assigned driver sees trip 972', (select count(*) from public.driver_my_trips() where trip_id = t.u(972)), 1::bigint);

select t.as_anon();
create temp table l17_stops_live as select count(*)::bigint as n from public.public_trip_stops(t.u(975));
grant all on l17_stops_live to anon, authenticated;
select t.eq('17 setup: trip 975 has public stops while the subscription is live (so the hidden-stops check is not vacuous)', ((select n from l17_stops_live) > 0)::int, 1);

-- ===== SUSPENDED company =====
select t.as_admin();
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 'l17 test' where id = t.u(101);
select t.as_anon();
select t.eq('suspended: marketplace hides every trip of the company', (select count(*) from public.public_search_trips() where company_id = t.u(101)), 0::bigint);
select t.as_user(t.u(83));
select t.eq('suspended: new web booking refused as "trip not found"', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 83', '+201000017083', p_idempotency_key => 'l17-b')$$, t.u(975))), 'P0002|trip not found');
select t.eq('suspended: customer cannot see own bookings of that company', (select count(*) from public.my_booking_details()), 0::bigint);
select t.as_user(t.u(91));
select t.eq('suspended: driver sees no trips', (select count(*) from public.driver_my_trips()), 0::bigint);
select t.eq('suspended: driver cannot board (neutral "trip not found")', t.err_of(format($$select (public.board_ticket(%L, %L))->>'result'$$, t.u(972), (select qr_payload from l17_tok where ticket_index = 1))), 'P0002|trip not found');
select t.as_admin();
select t.eq('suspended: refused scan boarded nothing', (select count(*) from tickets k join bookings b on b.id = k.booking_id where b.reference = 'MB-T14002' and k.status = 'boarded'), 0::bigint);
select t.as_user(t.u(91));
select t.eq('suspended: staff context says suspended and carries no permissions', (public.my_context()->'membership'->>'company_status') || '|' || jsonb_array_length(public.my_context()->'membership'->'permissions'), 'suspended|0');
select t.as_admin();
select t.eq('suspended: the other tenant is unaffected (company B still active)', (select status from companies where id = t.u(102)), 'active');

-- reactivation restores service
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(101);
select t.as_user(t.u(91));
select t.eq('reactivated: the same scan now boards', t.board_ok(91, t.u(972), (select qr_payload from l17_tok where ticket_index = 1)), 'boarded');
select t.as_user(t.u(83));
select t.eq('reactivated: customer sees own booking again', (select count(*) from public.my_booking_details() where reference is not null), 1::bigint);

-- ===== EXPIRED subscription (reads and day-of-travel keep working, NEW business is refused) =====
select t.as_admin();
update subscriptions set current_period_start = now() - interval '40 days', current_period_end = now() - interval '1 day' where company_id = t.u(101);
select t.as_user(t.u(84));
select t.eq('expired: new web booking refused with 42501 "no active subscription"', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 84', '+201000008484', p_idempotency_key => 'l17-c')$$, t.u(975))), '42501|no active subscription');
select t.as_user(t.u(83));
select t.eq('expired: customer still reads own booking', (select count(*) from public.my_booking_details()), 1::bigint);
select t.eq('expired: customer still retrieves the QR', (select count(*) from public.my_ticket_qr((select id from l17_b))), 1::bigint);
select t.as_user(t.u(91));
select t.eq('expired: driver still boards the next ticket on the day of travel', t.board_ok(91, t.u(972), (select qr_payload from l17_tok where ticket_index = 2)), 'boarded');
select t.eq('expired: driver still sees the trip', (select count(*) from public.driver_my_trips() where trip_id = t.u(972)), 1::bigint);
select t.as_user(t.u(83));
select t.eq('expired: customer can still cancel (seats are released)', (select (public.cancel_my_booking((select id from l17_b)))->>'status'), 'cancelled');
select t.as_anon();
-- 0021: the marketplace no longer lists trips that cannot be booked (was a known gap in 8E)
select t.eq('expired: marketplace hides the trip (0021)', (select count(*) from public.public_search_trips() where trip_id = t.u(975)), 0::bigint);
select t.eq('expired: marketplace hides every trip of the company', (select count(*) from public.public_search_trips() where company_id = t.u(101)), 0::bigint);
select t.eq('expired: pickup/drop-off stops of the trip are hidden too', (select count(*) from public.public_trip_stops(t.u(975))), 0::bigint);
select t.eq('expired: a hidden trip is searched by company filter as empty, not as an error', (select count(*) from public.public_search_trips(p_company_id => t.u(101))), 0::bigint);
select t.as_admin();
select t.eq('expired: platform/staff context still sees the trip row (nothing deleted, only unlisted)', (select count(*) from trips where id = t.u(975)), 1::bigint);

-- restore
select t.as_admin();
update subscriptions set current_period_start = now() - interval '5 days', current_period_end = now() + interval '30 days' where company_id = t.u(101);
select t.as_user(t.u(84));
select t.eq('restored: booking works again after the subscription is live', (select (public.create_my_booking(t.u(975), 1, 'Web 84', '+201000008484', p_idempotency_key => 'l17-d'))->>'status'), 'confirmed');
select t.as_admin();

-- ===== 0021: every subscription state, one at a time, on the same live row =====
-- listed  = trialing, active, past_due with an unexpired period (exactly app_private.live_subscription)
-- hidden  = cancelled, expired, or any status with an ended period
select t.as_admin();
create temp table l17_states (label text, status text, period_end interval, want bigint);
insert into l17_states values
  ('trialing, period open', 'trialing', interval '10 days', 1), ('active, period open', 'active', interval '10 days', 1),
  ('past_due, period open (grace, booking allowed)', 'past_due', interval '3 days', 1),
  ('active but period ended', 'active', interval '-1 minute', 0), ('trialing but period ended', 'trialing', interval '-1 day', 0),
  ('past_due but period ended', 'past_due', interval '-1 day', 0),
  ('cancelled', 'cancelled', interval '10 days', 0), ('expired status', 'expired', interval '10 days', 0);
do $$ declare r record; v bigint; v_stops bigint; v_err text;
begin
  for r in select * from l17_states loop
    update public.subscriptions set status = r.status, current_period_start = now() - interval '40 days', current_period_end = now() + r.period_end
      where company_id = t.u(101);
    perform t.as_anon();
    select count(*) into v from public.public_search_trips() where trip_id = t.u(975);
    select count(*) into v_stops from public.public_trip_stops(t.u(975));
    perform t.eq('state ' || r.label || ': listed=' || r.want, v, r.want);
    perform t.eq('state ' || r.label || ': stops follow the listing', (v_stops > 0)::int, r.want::int);
    perform t.as_admin();
  end loop;
end $$;

-- booking is independently refused whenever the listing is hidden (the two layers agree, but neither depends on the other)
select t.as_admin();
update subscriptions set status = 'cancelled', current_period_end = now() + interval '10 days' where company_id = t.u(101);
select t.as_user(t.u(84));
select t.eq('cancelled: direct booking call is still refused server-side', t.err_of(format($$select public.create_my_booking(%L, 1, 'Web 84', '+201000008484', p_idempotency_key => 'l17-e')$$, t.u(975))), '42501|no active subscription');
select t.as_admin();
update subscriptions set status = 'active', current_period_start = now() - interval '5 days', current_period_end = now() + interval '30 days' where company_id = t.u(101);
select t.as_anon();
select t.eq('restored: trip is listed again', (select count(*) from public.public_search_trips() where trip_id = t.u(975)), 1::bigint);
select t.eq('restored: stops are back', (select count(*) from public.public_trip_stops(t.u(975))), (select n from l17_stops_live));
select t.eq('listing helper is not callable by anon/authenticated', t.err_of($$select app_private.has_live_subscription(gen_random_uuid())$$), '42501|permission denied for function has_live_subscription');
select t.as_admin();
