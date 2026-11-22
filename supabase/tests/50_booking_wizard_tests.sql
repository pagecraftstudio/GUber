-- 50: P2 pay-first booking (migration 0054). Fixtures (01/30/49): A = company 101, B = 102; users 2 ownerA, 4 operationsA, 7 ownerB; students 3001, 3002.
select t.as_admin();
create or replace function t.err50(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate; end $$;
create or replace function t.cnt50(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.job50(p_fn text) returns integer language plpgsql security definer as $$ declare n integer; begin execute format('select app_private.%I()', p_fn) into n; return n; end $$;

delete from public.notifications where event_key like 'booking.%';
insert into public.website_settings (company_id, is_published) values (t.u(101), true) on conflict (company_id) do update set is_published = true;
insert into public.trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(5001), t.u(101), t.u(201), t.u(221), t.u(231), now() + interval '60 days', now() + interval '60 days 2 hours', 40, 6, 'scheduled'),
  (t.u(5002), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '61 days', now() + interval '61 days 2 hours', 0, 6, 'scheduled');
insert into public.trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(5003), t.u(101), t.u(201), now() + interval '62 days', now() + interval '62 days 2 hours', 40, 6, 'draft');
create or replace function t.seats50(p uuid) returns integer language sql security definer as $$ select seats_booked::integer from public.trips where id = p $$;
update public.profiles set locale = 'en' where id in (t.u(3001), t.u(3002));

-- 1. settings: written only through the RPC, only by settings.write of the caller's own company ----------------------------------------------
select t.as_user(t.u(4));
select t.eq('settings: operations (no settings.write) refused', t.err50($$select public.save_company_payment_settings(true,'+201000000001','Vodafone Holder',null,null,'+201000000002',2,null,null)$$), '42501');
select t.as_user(t.u(2));
select t.eq('settings: require without any payment method refused', t.err50($$select public.save_company_payment_settings(true,null,null,null,null,'+201000000002',2,null,null)$$), '22023');
select t.eq('settings: require without a WhatsApp number refused', t.err50($$select public.save_company_payment_settings(true,'+201000000001',null,null,null,null,2,null,null)$$), '22023');
select t.eq('settings: deadline 0 refused', t.err50($$select public.save_company_payment_settings(false,null,null,null,null,null,0,null,null)$$), '22023');
select t.eq('settings: deadline 49 refused', t.err50($$select public.save_company_payment_settings(false,null,null,null,null,null,49,null,null)$$), '22023');
select t.eq('settings: bad phone refused', t.err50($$select public.save_company_payment_settings(false,'12',null,null,null,null,2,null,null)$$), '22023');
select t.eq('settings: bad instapay address refused', t.err50($$select public.save_company_payment_settings(false,null,null,'bad address!',null,null,2,null,null)$$), '22023');
select t.eq('settings: control characters refused', t.err50($$select public.save_company_payment_settings(false,null,E'a\x01b',null,null,null,2,null,null)$$), '22023');
select t.eq('settings: direct table write refused', t.err50($$insert into public.company_payment_settings (company_id) values (gen_random_uuid())$$), '42501');
select t.passes('settings: owner saves (prepayment off at first)', $$select public.save_company_payment_settings(false,'+201000000001','Vodafone Holder','pay@instapay','Insta Holder','+20 100 000 0002',2,'Note','ملاحظة')$$);
select t.eq('settings: numbers are normalised to E.164', (select vodafone_cash_number || ' ' || payment_whatsapp from public.company_payment_settings where company_id = t.u(101)), '+201000000001 +201000000002');
select t.eq('settings: owner A reads its row', t.rows($$select 1 from public.company_payment_settings where company_id = t.u(101)$$), 1::bigint);
select t.as_user(t.u(7));
select t.eq('settings: owner B cannot read A''s payment numbers', t.rows($$select 1 from public.company_payment_settings where company_id = t.u(101)$$), 0::bigint);
select t.passes('settings: owner B saves its own', $$select public.save_company_payment_settings(false,null,null,null,null,null,5,null,null)$$);
select t.as_admin();
select t.eq('settings: B''s save did not touch A', (select payment_deadline_hours from public.company_payment_settings where company_id = t.u(101)), 2::smallint);
select t.eq('settings: audit never contains the numbers', t.cnt50($$select count(*) from public.audit_logs where action = 'payment_settings.saved' and metadata::text like '%0100%'$$), 0::bigint);
select t.as_anon();
select t.eq('settings: anon cannot read the table', t.err50($$select * from public.company_payment_settings$$), '42501');

-- 2. one bookable trip (public) -----------------------------------------------------------------------------------------------------------
select t.eq('trip detail: anon sees an open trip', t.cnt50($$select count(*) from public.public_trip_detail(t.u(5001))$$), 1::bigint);
select t.eq('trip detail: a draft trip answers empty', t.cnt50($$select count(*) from public.public_trip_detail(t.u(5003))$$), 0::bigint);
select t.eq('trip detail: an unknown id answers empty', t.cnt50($$select count(*) from public.public_trip_detail(gen_random_uuid())$$), 0::bigint);

-- 3. companies that do not require prepayment book exactly as before ----------------------------------------------------------------------
select t.as_user(t.u(3001));
select t.eq('quote: no prepayment -> not required', (public.quote_my_booking(t.u(5001), 2))->>'requires_payment', 'false');
select t.eq('booking without prepayment is confirmed at once', (public.create_my_booking(t.u(5001), 1, 'Student One', '+201000003001', p_idempotency_key => 'p2-a'))->>'status', 'confirmed');
select t.as_admin();
select t.eq('...with no deadline', (select payment_due_at is null from public.bookings where idempotency_key = 'p2-a'), true);
select t.eq('...and its ticket exists', t.cnt50($$select count(*) from public.tickets k join public.bookings b on b.id = k.booking_id where b.idempotency_key = 'p2-a'$$), 1::bigint);

-- 4. prepayment on -----------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.passes('owner turns prepayment on', $$select public.save_company_payment_settings(true,'+201000000001','Vodafone Holder','pay@instapay','Insta Holder','+20 100 000 0002',2,'Note','ملاحظة')$$);
select t.as_user(t.u(3002));
select t.eq('quote: requires payment, deadline 2 h, total 80', (public.quote_my_booking(t.u(5001), 2))->>'requires_payment' || ' ' || ((public.quote_my_booking(t.u(5001), 2))->>'deadline_hours') || ' ' || ((public.quote_my_booking(t.u(5001), 2))->>'total'), 'true 2 80.00');
select t.eq('quote: a free trip never requires payment', (public.quote_my_booking(t.u(5002), 1))->>'requires_payment', 'false');
select t.eq('quote: a hidden trip is not found', t.err50(format($$select public.quote_my_booking(%L, 1)$$, t.u(5003))), 'P0002');
select t.eq('booking is pending with a deadline', (public.create_my_booking(t.u(5001), 2, 'Student Two', '+201000003002', p_idempotency_key => 'p2-b'))->>'status', 'pending');
select t.eq('replay returns the same pending booking', (public.create_my_booking(t.u(5001), 2, 'Student Two', '+201000003002', p_idempotency_key => 'p2-b'))->>'idempotent_replay', 'true');
select t.as_admin();
select t.eq('deadline is about 2 hours ahead', (select payment_due_at between now() + interval '119 minutes' and now() + interval '121 minutes' from public.bookings where idempotency_key = 'p2-b'), true);
select t.eq('pending booking holds its seats', t.seats50(t.u(5001)), 3);
select t.eq('pending booking has no ticket yet', t.cnt50($$select count(*) from public.tickets k join public.bookings b on b.id = k.booking_id where b.idempotency_key = 'p2-b'$$), 0::bigint);
select t.as_user(t.u(3002));
select t.eq('a free trip is confirmed even when prepayment is on', (public.create_my_booking(t.u(5002), 1, 'Student Two', '+201000003002', p_idempotency_key => 'p2-free'))->>'status', 'confirmed');

-- 5. the student's own payment instructions ----------------------------------------------------------------------------------------------
select t.eq('instructions: the owner sees the Vodafone number', (public.my_booking_payment((select id from public.bookings where idempotency_key = 'p2-b')))->'instructions'->>'vodafone_cash_number', '+201000000001');
select t.as_user(t.u(3001));
select t.eq('instructions: another student cannot see them', t.err50(format($$select public.my_booking_payment(%L)$$, (select id from public.bookings where idempotency_key = 'p2-b'))), 'P0002');
select t.as_user(t.u(2));
select t.eq('instructions: staff are not customers of the booking', t.err50(format($$select public.my_booking_payment(%L)$$, (select id from public.bookings where idempotency_key = 'p2-b'))), 'P0002');
select t.as_anon();
select t.eq('instructions: anon has no execute', t.err50($$select public.my_booking_payment(gen_random_uuid())$$), '42501');

-- 6. reminders: one at half the window, one in the last 10 minutes, never twice -----------------------------------------------------------
select t.as_admin();
update public.bookings set created_at = now() - interval '90 minutes', payment_due_at = now() + interval '90 minutes' where idempotency_key = 'p2-b';
select t.eq('reminder: half-way sends one', t.job50('remind_unpaid_bookings'), 1);
select t.eq('reminder: a second run sends nothing (deduplicated)', t.job50('remind_unpaid_bookings'), 0);
update public.bookings set payment_due_at = now() + interval '5 minutes' where idempotency_key = 'p2-b';
select t.eq('reminder: the last-10-minutes one is a separate notice', t.job50('remind_unpaid_bookings'), 1);
select t.eq('reminder: the student has exactly two, in-app', t.cnt50($$select count(*) from public.notifications where event_key = 'booking.payment_reminder' and recipient_user_id = t.u(3002) and channel = 'in_app'$$), 2::bigint);

-- 7. partial payment is never auto-cancelled; a lapsed unpaid booking is, once ------------------------------------------------------------
select t.as_user(t.u(7));
select t.eq('record payment: owner of B cannot touch A''s booking', t.err50(format($$select public.set_booking_amount_paid(%L, 10)$$, (select id from public.bookings where idempotency_key = 'p2-b'))), 'P0002');
select t.as_user(t.u(2));
select t.eq('record payment: a part payment keeps it pending', (public.set_booking_amount_paid((select id from public.bookings where idempotency_key = 'p2-b'), 10))->>'status', 'pending');
select t.as_admin();
update public.bookings set payment_due_at = now() - interval '1 minute' where idempotency_key = 'p2-b';
select t.eq('auto-cancel: a part-paid booking is left to staff', t.job50('cancel_unpaid_bookings'), 0);
select t.as_user(t.u(2));
select t.eq('record payment: back to nothing recorded', (public.set_booking_amount_paid((select id from public.bookings where idempotency_key = 'p2-b'), 0))->>'status', 'pending');
select t.as_admin();
select t.eq('auto-cancel: lapsed and unpaid is cancelled', t.job50('cancel_unpaid_bookings'), 1);
select t.eq('...with reason payment_timeout', (select cancellation_reason from public.bookings where idempotency_key = 'p2-b'), 'payment_timeout');
select t.eq('...and the seats are released', t.seats50(t.u(5001)), 1);
select t.eq('...a second run changes nothing', t.job50('cancel_unpaid_bookings'), 0);
select t.eq('...seats released exactly once', t.seats50(t.u(5001)), 1);
select t.eq('...the student was told', t.cnt50($$select count(*) from public.notifications where event_key = 'booking.cancelled_unpaid' and recipient_user_id = t.u(3002)$$), 1::bigint);
select t.eq('...and a system audit row exists', t.cnt50($$select count(*) from public.audit_logs where action = 'booking.cancelled_unpaid' and actor_type = 'system'$$), 1::bigint);

-- 8. paid before the deadline: confirmed, ticketed, never cancelled ---------------------------------------------------------------------------
select t.as_user(t.u(3002));
select t.eq('second booking is pending', (public.create_my_booking(t.u(5001), 1, 'Student Two', '+201000003002', p_idempotency_key => 'p2-c'))->>'status', 'pending');
select t.as_user(t.u(2));
select t.eq('record the full amount: it is confirmed', (public.set_booking_amount_paid((select id from public.bookings where idempotency_key = 'p2-c'), 40))->>'status', 'confirmed');
select t.as_admin();
select t.eq('...the deadline is cleared', (select payment_due_at is null from public.bookings where idempotency_key = 'p2-c'), true);
select t.eq('...the ticket was issued', t.cnt50($$select count(*) from public.tickets k join public.bookings b on b.id = k.booking_id where b.idempotency_key = 'p2-c'$$), 1::bigint);
select t.eq('...the student was told', t.cnt50($$select count(*) from public.notifications where event_key = 'booking.confirmed' and recipient_user_id = t.u(3002)$$), 1::bigint);
update public.bookings set payment_due_at = now() - interval '1 hour' where idempotency_key = 'p2-c';
select t.eq('...and the job never cancels a confirmed booking', t.job50('cancel_unpaid_bookings'), 0);

-- 9. the jobs are registered on the scheduler --------------------------------------------------------------------------------------------
select t.eq('jobs: both are registered', t.cnt50($$select count(*) from app_private.jobs where name in ('cancel-unpaid-bookings','remind-unpaid-bookings') and enabled$$), 2::bigint);
select t.as_user(t.u(3001));
select t.eq('jobs: clients cannot run them', t.err50($$select app_private.cancel_unpaid_bookings()$$), '42501');

-- leave the fixtures as found for later suites
select t.as_admin();
update public.company_payment_settings set require_prepayment = false where company_id = t.u(101);
