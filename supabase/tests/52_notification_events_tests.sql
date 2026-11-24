-- 52: P5b notification events (migration 0056). Fixtures: company A = 101 (owner u2 = bookings+trips, operations u4 = trips only, driver A1 = driver 231 / user u6, bus 221),
-- B = 102 (owner u7), students 3001/3002 of A. Needs suites 01, 30 (plan 'Monthly'), 50 (t.err50/t.cnt50/t.job50).
select t.as_admin();
delete from public.notifications where event_key in ('trip.cancelled','trip.changed','trip.starting_soon','trip.not_boarded','subscription.requested','subscription.approved','subscription.rejected','subscription.expired',
  'company.booking_needs_review','company.subscription_request_pending','company.trip_boarding_soon','company.trip_starting_soon','company.students_not_boarded');
create or replace function t.n52(p_event text, p_user uuid) returns bigint language sql security definer as $$ select count(*) from public.notifications where event_key = p_event and recipient_user_id = p_user and channel = 'in_app' $$;
create or replace function t.nu52(p_event text, p_user uuid, p_trip uuid) returns bigint language sql security definer as $$ select count(*) from public.notifications where event_key = p_event and recipient_user_id = p_user and related_entity_id = p_trip $$;
create or replace function t.nt52(p_event text, p_trip uuid) returns bigint language sql security definer as $$ select count(*) from public.notifications where event_key = p_event and related_entity_id = p_trip $$;
update public.profiles set locale = 'en' where id in (t.u(3001), t.u(3002), t.u(2), t.u(4), t.u(6));
update public.company_settings set max_seats_per_booking = greatest(max_seats_per_booking, 4) where company_id = t.u(101);
-- customers rows for the two students in company A (the booking RPCs create them; direct inserts here keep the fixture independent)
insert into public.customers (company_id, user_id, full_name, phone) values (t.u(101), t.u(3001), 'Student One', '+201000003001'), (t.u(101), t.u(3002), 'Student Two', '+201000003002') on conflict do nothing;

-- own buses and drivers for the near-term trips (earlier suites keep trips close to now on the shared ones; the database enforces a 30 min turnaround)
update public.drivers set user_id = null where id = t.u(231);
insert into public.buses (id, company_id, plate_number, capacity, status) select t.u(5290 + g), t.u(101), 'E52-' || g, 40, 'active' from generate_series(1, 3) g on conflict do nothing;
insert into public.drivers (id, company_id, user_id, full_name, phone) values (t.u(5291), t.u(101), null, 'E52 driver 1', '+201000052901'), (t.u(5292), t.u(101), null, 'E52 driver 2', '+201000052902'), (t.u(5293), t.u(101), t.u(6), 'E52 driver 3 (user 6)', '+201000052903') on conflict do nothing;
create or replace function t.trip52(p_id uuid, p_minutes int, p_bus int default 221, p_driver int default 231) returns void language plpgsql security definer as $$
begin
  insert into public.trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
  values (p_id, t.u(101), t.u(201), t.u(p_bus), t.u(p_driver), now() + make_interval(mins => p_minutes), now() + make_interval(mins => p_minutes + 1), 50, 20, 'scheduled');
end $$;
create or replace function t.book52(p_trip uuid, p_user uuid, p_ref text, p_status text default 'confirmed') returns uuid language plpgsql security definer as $$
declare v_c uuid; v_id uuid;
begin
  select id into v_c from public.customers where company_id = t.u(101) and user_id = p_user;
  insert into public.bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, payment_status, source, payment_due_at)
  values (t.u(101), p_ref, p_trip, v_c, 1, 50, 50, 'EGP', p_status, case when p_status = 'confirmed' then 'unpaid' else 'unpaid' end, 'web', case when p_status = 'pending' then now() + interval '2 hours' end) returning id into v_id;
  return v_id;
end $$;

-- 1. trip cancelled ------------------------------------------------------------------------------------------------------------------------------
select t.trip52(t.u(5201), 57600);
select t.book52(t.u(5201), t.u(3001), 'E52A1'), t.book52(t.u(5201), t.u(3002), 'E52A2');
select t.as_admin();
update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'student cancelled' where reference = 'E52A2';
update public.trips set status = 'cancelled' where id = t.u(5201);
select t.eq('cancelled: the student with a live booking is told (once)', t.n52('trip.cancelled', t.u(3001)), 1::bigint);
select t.eq('cancelled: a student who already cancelled is not told again', t.n52('trip.cancelled', t.u(3002)), 0::bigint);
select t.eq('cancelled: staff of the company are not told (student event)', t.n52('trip.cancelled', t.u(2)), 0::bigint);
select t.eq('cancelled: the text carries the route and time', t.cnt50($$select count(*) from public.notifications where event_key = 'trip.cancelled' and body like '%→%20%'$$), 1::bigint);
select t.eq('cancelled: mandatory event cannot be switched off (preference ignored)', (select mandatory from public.notification_events where key = 'trip.cancelled'), true);

-- 2. time changed ---------------------------------------------------------------------------------------------------------------------------------
select t.trip52(t.u(5202), 59040);
select t.book52(t.u(5202), t.u(3001), 'E52B1'), t.book52(t.u(5202), t.u(3002), 'E52B2');
update public.bookings set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'student cancelled' where reference = 'E52B2';
update public.trips set departure_at = departure_at + interval '30 minutes', arrival_at = arrival_at + interval '30 minutes' where id = t.u(5202);
select t.eq('changed: the booked student is told the new time', t.nt52('trip.changed', t.u(5202)), 1::bigint);
select t.eq('changed: ...not the cancelled booking', t.n52('trip.changed', t.u(3002)), 0::bigint);
update public.trips set price = 60 where id = t.u(5202);
select t.eq('changed: a price edit is not a time change', t.nt52('trip.changed', t.u(5202)), 1::bigint);

-- 3. windows ----------------------------------------------------------------------------------------------------------------------------------------
select t.trip52(t.u(5203), 25, 5291, 5291);  -- 60-min window; boarding soon
select t.trip52(t.u(5204), 10, 5292, 5292);  -- 15-min window; not boarded (10); starting soon (ops)
select t.trip52(t.u(5205), 3, 5293, 5293);   -- students not boarded
select t.book52(t.u(5203), t.u(3001), 'E52C1'); select t.book52(t.u(5204), t.u(3001), 'E52C2'); select t.book52(t.u(5205), t.u(3001), 'E52C3'); select t.book52(t.u(5205), t.u(3002), 'E52C4');
select t.eq('fixture: confirmed bookings have tickets', t.cnt50($$select count(*) from public.tickets where trip_id in (t.u(5203), t.u(5204), t.u(5205))$$), 4::bigint);
select t.passes('windows: job runs', $$select t.job50('notify_trip_windows')$$);
select t.eq('windows: 25 min -> starting soon (60) once', t.nt52('trip.starting_soon', t.u(5203)), 1::bigint);
select t.eq('windows: 10 min -> starting soon (15) and not boarded (10)', t.nt52('trip.starting_soon', t.u(5204)) || '/' || t.nt52('trip.not_boarded', t.u(5204)), '1/1');
select t.eq('windows: 25 min -> NOT yet "not boarded"', t.nt52('trip.not_boarded', t.u(5203)), 0::bigint);
select t.eq('windows: 25 min -> staff with trips.write told boarding soon, nobody told "starting soon" yet', t.nt52('company.trip_boarding_soon', t.u(5203)) || '/' || t.nt52('company.trip_starting_soon', t.u(5203)), '3/0');
select t.eq('windows: 10 min -> operations told starting soon', t.nu52('company.trip_starting_soon', t.u(4), t.u(5204)), 1::bigint);
select t.eq('windows: the driver is not told "operations" events, but is told boarding soon for the trip they drive', t.n52('company.trip_starting_soon', t.u(6)) || '/' || t.nu52('company.trip_boarding_soon', t.u(6), t.u(5205)), '0/1');
select t.eq('windows: 3 min -> the driver and operations told with the count', t.nt52('company.students_not_boarded', t.u(5205)), 4::bigint);
select t.eq('windows: ...count 2 and the names', t.cnt50($$select count(*) from public.notifications where event_key = 'company.students_not_boarded' and recipient_user_id = t.u(6) and subject like '%: 2' and body like '%Sub One%' and body like '%Sub Two%'$$), 1::bigint);
select t.passes('windows: second run', $$select t.job50('notify_trip_windows')$$);
select t.eq('windows: running twice creates no duplicates', t.cnt50($$select count(*) from public.notifications where event_key in ('trip.starting_soon','trip.not_boarded','company.trip_boarding_soon','company.trip_starting_soon','company.students_not_boarded') and related_entity_id in (t.u(5203), t.u(5204), t.u(5205))$$), 27::bigint);
select t.eq('windows: company B staff received nothing', t.cnt50($$select count(*) from public.notifications where recipient_user_id = t.u(7) and event_key like any (array['trip.%','company.%'])$$), 0::bigint);
-- a boarded ticket is not "not boarded"
update public.tickets set status = 'boarded', boarded_at = now(), boarded_driver_id = t.u(231) where trip_id = t.u(5205) and booking_id = (select id from public.bookings where reference = 'E52C4');
delete from public.notifications where event_key in ('trip.not_boarded', 'company.students_not_boarded') and related_entity_id = t.u(5205);
select t.passes('windows: run after boarding', $$select t.job50('notify_trip_windows')$$);
select t.eq('windows: only the student who has not boarded is told', t.n52('trip.not_boarded', t.u(3001)) >= 1 and t.nt52('trip.not_boarded', t.u(5205)) = 1, true);
-- a suspended company sends nothing
select t.trip52(t.u(5206), 58, 5291, 5291); select t.book52(t.u(5206), t.u(3001), 'E52C5');
update public.companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.passes('suspended: job runs', $$select t.job50('notify_trip_windows')$$);
select t.eq('suspended: nothing sent for the suspended company', t.cnt50($$select count(*) from public.notifications where related_entity_id = t.u(5206)$$), 0::bigint);
update public.companies set status = 'active', suspended_at = null where id = t.u(101);

-- 4. booking waiting for payment -------------------------------------------------------------------------------------------------------------------
select t.trip52(t.u(5207), 60480);
select t.book52(t.u(5207), t.u(3001), 'E52D1', 'pending');
select t.eq('review: owner (bookings.write) is told', t.n52('company.booking_needs_review', t.u(2)), 1::bigint);
select t.eq('review: operations (no bookings.write) is not', t.n52('company.booking_needs_review', t.u(4)), 0::bigint);
select t.eq('review: company B owner is not', t.n52('company.booking_needs_review', t.u(7)), 0::bigint);
select t.book52(t.u(5207), t.u(3002), 'E52D2', 'confirmed');
select t.eq('review: a confirmed booking needs no review', t.cnt50($$select count(*) from public.notifications where event_key = 'company.booking_needs_review' and related_entity_id = (select id from public.bookings where reference = 'E52D2')$$), 0::bigint);

-- 5. subscriptions --------------------------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values (t.u(5251), 'm52@test.dev') on conflict do nothing;
update public.profiles set locale = 'en', phone = '+201000052510', full_name = 'Member 52' where id = t.u(5251);
insert into public.route_subscriptions (id, company_id, plan_id, user_id, masar_id, member_name, member_phone, price, currency)
select t.u(5252), t.u(101), (select id from public.route_plans where name = 'Monthly' and route_id = t.sub_route('Sub-Go') limit 1), t.u(5251), (select masar_id from public.profiles where id = t.u(5251)), 'Member 52', '+201000052510', 900, 'EGP';
select t.eq('subscription: requested -> the student is told', t.n52('subscription.requested', t.u(5251)), 1::bigint);
select t.eq('subscription: ...booking staff are told, operations are not', t.n52('company.subscription_request_pending', t.u(2)) || '/' || t.n52('company.subscription_request_pending', t.u(4)), '1/0');
update public.route_subscriptions set created_at = now() - interval '25 hours' where id = t.u(5252);
select t.passes('subscription: 24 h reminder job', $$select t.job50('notify_pending_requests')$$);
select t.passes('subscription: ...and again', $$select t.job50('notify_pending_requests')$$);
select t.eq('subscription: exactly one reminder per staff member', t.n52('company.subscription_request_pending', t.u(2)), 2::bigint);
update public.route_subscriptions set status = 'active', valid_from = current_date, valid_to = current_date + 30, paid_at = now() where id = t.u(5252);
select t.eq('subscription: approved -> told, with the end date', t.cnt50($$select count(*) from public.notifications where event_key = 'subscription.approved' and recipient_user_id = t.u(5251) and body like '%' || to_char(current_date + 30, 'YYYY-MM-DD') || '%'$$), 1::bigint);
update public.route_subscriptions set status = 'expired' where id = t.u(5252);
select t.eq('subscription: expired -> told', t.n52('subscription.expired', t.u(5251)), 1::bigint);
update public.route_subscriptions set status = 'active' where id = t.u(5252);
update public.route_subscriptions set status = 'expired' where id = t.u(5252);
select t.eq('subscription: the same event for the same subscription is never duplicated', t.n52('subscription.expired', t.u(5251)), 1::bigint);
insert into public.route_subscriptions (id, company_id, plan_id, user_id, masar_id, member_name, member_phone, price, currency, status)
select t.u(5253), t.u(101), plan_id, t.u(5251), masar_id, member_name, member_phone, price, currency, 'pending' from public.route_subscriptions where id = t.u(5252);
update public.route_subscriptions set status = 'rejected', decision_note = 'Documents missing' where id = t.u(5253);
select t.eq('subscription: rejected -> told with the company''s note', t.cnt50($$select count(*) from public.notifications where event_key = 'subscription.rejected' and body like '%Documents missing%'$$), 1::bigint);

-- 6. who can read them ----------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(3002));
select t.eq('read: a student sees none of another student''s notices', t.rows($$select 1 from public.notifications where event_key = 'trip.cancelled'$$), 0::bigint);
select t.as_user(t.u(7));
select t.eq('read: company B staff see none of company A''s notices', t.rows($$select 1 from public.notifications where event_key like 'company.%' or event_key like 'trip.%'$$), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('read: the student sees theirs in the inbox', (select count(*) from public.my_inbox(50) where event_key = 'trip.cancelled')::bigint >= 1, true);
select t.as_admin();
