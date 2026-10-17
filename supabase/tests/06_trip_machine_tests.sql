-- 06: trip status machine, draft deletion, monthly trip limit (migration 0011). Requires 01 fixtures. Run alone or after 02-05.
create table if not exists t.marks (name text primary key, id int);
alter table t.marks disable row level security;   -- Supabase enables RLS on new tables by default
grant all on t.marks to anon, authenticated;
delete from t.marks where name = '06';
insert into t.marks select '06', coalesce(max(id), 0) from t.results;
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.seats(p_trip uuid) returns int language sql security definer as $$ select seats_booked::int from public.trips where id = p_trip $$;
create or replace function t.tstatus(p_trip uuid) returns text language sql security definer as $$ select status from public.trips where id = p_trip $$;

select t.as_admin();
-- Fixture trips from 01 are dated relative to the day 01 was RUN. Re-date them so this file works days later too.
update trips set departure_at = date_trunc('day', now()) + interval '1 day 8 hours',
                 arrival_at   = date_trunc('day', now()) + interval '1 day 10 hours'
 where id in (t.u(241), t.u(242), t.u(243));
-- all on far-future dates so they never collide with fixture trips. A: bus 225 / driver 234 are the free pair.
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(601), t.u(101), t.u(201), t.u(225), t.u(234), date_trunc('day', now()) + interval '40 day 8 hours', date_trunc('day', now()) + interval '40 day 10 hours', 30, 10, 'draft'),
  (t.u(602), t.u(101), t.u(201), t.u(225), t.u(231), date_trunc('day', now()) + interval '40 day 9 hours', date_trunc('day', now()) + interval '40 day 11 hours', 30, 10, 'draft'),
  (t.u(603), t.u(101), t.u(201), t.u(222), t.u(234), date_trunc('day', now()) + interval '40 day 9 hours', date_trunc('day', now()) + interval '40 day 11 hours', 30, 10, 'draft'),
  (t.u(605), t.u(101), t.u(201), t.u(222), t.u(232), now() - interval '5 hours', now() - interval '3 hours', 30, 10, 'draft'),
  (t.u(606), t.u(101), t.u(201), t.u(221), t.u(231), date_trunc('day', now()) + interval '45 day 8 hours', date_trunc('day', now()) + interval '45 day 10 hours', 30, 10, 'draft');
insert into trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(604), t.u(101), t.u(201), date_trunc('day', now()) + interval '41 day 8 hours', date_trunc('day', now()) + interval '41 day 10 hours', 30, 10, 'draft');

-- ===== transition graph, straight at the table (owner SQL) =====
select t.eq('draft -> boarding refused', t.err_of($$update trips set status = 'boarding' where id = t.u(604)$$), '23514|invalid trip status transition: draft -> boarding');
select t.eq('draft -> completed refused', left(t.err_of($$update trips set status = 'completed' where id = t.u(604)$$), 5), '23514');
select t.eq('draft -> in_progress refused', left(t.err_of($$update trips set status = 'in_progress' where id = t.u(604)$$), 5), '23514');

-- ===== RPC authorization =====
select t.as_user(t.u(5));   -- booking staff: no trips.write
select t.eq('booking staff cannot transition trips', t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), 'P0002|trip not found');
select t.as_user(t.u(6));
select t.eq('driver cannot transition trips', t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), 'P0002|trip not found');
select t.as_user(t.u(7));
select t.eq('other tenant: same answer as a ghost trip', t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), t.err_of($$select public.transition_trip(gen_random_uuid(), 'scheduled')$$));
select t.eq('other tenant cannot delete A draft (not found)', t.err_of($$select public.delete_draft_trip(t.u(601))$$), 'P0002|trip not found');
select t.as_user(t.u(8));
select t.eq('suspended company cannot transition', left(t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), 5), 'P0002');
select t.as_anon();
select t.eq('anon cannot call transition_trip', left(t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), 5), '42501');
select t.eq('anon cannot call delete_draft_trip', left(t.err_of($$select public.delete_draft_trip(t.u(601))$$), 5), '42501');
select t.as_user(t.u(4));   -- operations: trips.write
select t.eq('invalid status name is invalid input', left(t.err_of($$select public.transition_trip(t.u(601), 'flying')$$), 5), '22023');

-- ===== draft -> scheduled: preconditions and conflicts =====
select t.eq('draft -> scheduled works with bus+driver', (select (public.transition_trip(t.u(601), 'scheduled'))->>'status'), 'scheduled');
select t.eq('repeat is a no-op', (select (public.transition_trip(t.u(601), 'scheduled'))->>'changed'), 'false');
select t.eq('bus conflict (overlap, same bus) refused by the exclusion constraint', left(t.err_of($$select public.transition_trip(t.u(602), 'scheduled')$$), 5), '23P01');
select t.eq('...and names the bus constraint', t.err_of($$select public.transition_trip(t.u(602), 'scheduled')$$) like '%trips_bus_no_overlap%', true);
select t.eq('driver conflict (overlap, same driver) refused', t.err_of($$select public.transition_trip(t.u(603), 'scheduled')$$) like '23P01|%trips_driver_no_overlap%', true);
select t.eq('losers stay drafts', t.tstatus(t.u(602)) || '/' || t.tstatus(t.u(603)), 'draft/draft');
select t.eq('no bus/driver: refused', t.err_of($$select public.transition_trip(t.u(604), 'scheduled')$$) like '23514|%trips_assigned_when_live%', true);
select t.eq('departure in the past: refused', t.err_of($$select public.transition_trip(t.u(605), 'scheduled')$$), '23514|trip already departed');
select t.as_admin();
update buses set status = 'inactive' where id = t.u(221);
select t.as_user(t.u(4));
select t.eq('bus deactivated after the draft was saved: refused', t.err_of($$select public.transition_trip(t.u(606), 'scheduled')$$), '23514|bus is not active');
select t.as_admin();
update buses set status = 'active' where id = t.u(221);
select t.as_user(t.u(4));
select t.eq('buffer respected: a trip starting inside the 30 min buffer conflicts', (select count(*) from trips where id = t.u(601) and blocked_until = arrival_at + interval '30 minutes'), 1::bigint);

-- ===== scheduled -> draft only without bookings; cancel releases everything =====
select t.as_user(t.u(5));
select t.eq('book 2 seats', (select (public.create_booking(t.u(601), 'Tripper', '+201000020001', 2))->>'seats_count'), '2');
select t.eq('book 1 more (pending)', (select (public.create_booking(t.u(601), 'Tripper2', '+201000020002', 1, p_status => 'pending'))->>'status'), 'pending');
select t.eq('book 1 more', (select (public.create_booking(t.u(601), 'Tripper3', '+201000020003', 1))->>'status'), 'confirmed');
select t.eq('counter = 4', t.seats(t.u(601)), 4);
select t.as_user(t.u(4));
select t.eq('scheduled -> draft refused while bookings exist', t.err_of($$select public.transition_trip(t.u(601), 'draft')$$), '23514|trip has bookings');
select t.eq('cancel trip: reports 3 bookings cancelled', (select (public.transition_trip(t.u(601), 'cancelled', 'bus broke'))->>'bookings_cancelled'), '3');
select t.eq('counter released to 0', t.seats(t.u(601)), 0);
select t.eq('every booking cancelled with the trip reason', (select count(*) from bookings where trip_id = t.u(601) and status = 'cancelled' and cancellation_reason = 'trip cancelled'), 3::bigint);
select t.eq('cancel again is a no-op', (select (public.transition_trip(t.u(601), 'cancelled'))->>'changed'), 'false');
select t.eq('counter still 0 after repeat', t.seats(t.u(601)), 0);
select t.eq('cancelled is terminal', left(t.err_of($$select public.transition_trip(t.u(601), 'scheduled')$$), 5), '23514');
select t.as_user(t.u(5));
select t.eq('no booking on a cancelled trip', t.err_of($$select public.create_booking(t.u(601), 'Late', '+201000020009', 1)$$), '23514|trip is not open for booking');
select t.eq('cancelled bookings cannot be cancelled again (idempotent)', (select (public.cancel_booking((select id from bookings where trip_id = t.u(601) limit 1)))->>'already_cancelled'), 'true');
select t.as_user(t.u(4));
select t.eq('the cancelled trip freed bus+driver: 602 can now be scheduled', (select (public.transition_trip(t.u(602), 'scheduled'))->>'status'), 'scheduled');
select t.eq('...and 603 (driver 234 free again) too', (select (public.transition_trip(t.u(603), 'scheduled'))->>'status'), 'scheduled');

-- ===== scheduled -> draft allowed with zero active bookings; delete rules =====
select t.eq('scheduled -> draft with no bookings works', (select (public.transition_trip(t.u(602), 'draft'))->>'status'), 'draft');
select t.eq('draft with no history can be deleted', (select (public.delete_draft_trip(t.u(602)))->>'deleted'), 'true');
select t.eq('...and is gone', (select count(*) from trips where id = t.u(602)), 0::bigint);
select t.eq('delete again: not found', t.err_of($$select public.delete_draft_trip(t.u(602))$$), 'P0002|trip not found');
select t.eq('scheduled trip cannot be deleted', t.err_of($$select public.delete_draft_trip(t.u(603))$$), '23514|trip is not a draft');
select t.eq('cancelled trip cannot be deleted', t.err_of($$select public.delete_draft_trip(t.u(601))$$), '23514|trip is not a draft');
select t.as_user(t.u(5));
select t.eq('(setup) book then cancel on 603', (select (public.cancel_booking(((public.create_booking(t.u(603), 'Hist', '+201000020010', 1))->>'id')::uuid))->>'seats_released'), '1');
select t.as_user(t.u(4));
select t.passes('603 back to draft (only a cancelled booking left)', $$select public.transition_trip(t.u(603), 'draft')$$);
select t.eq('a draft that HAD a booking keeps its history: not deletable', t.err_of($$select public.delete_draft_trip(t.u(603))$$), '23514|trip has booking history');

-- ===== completion rules =====
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(610), t.u(101), t.u(201), t.u(225), t.u(234), now() - interval '3 hours', now() - interval '1 hour', 30, 10, 'scheduled');
insert into bookings (company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values
  (t.u(101), 'MB-COMP01', t.u(610), t.u(251), 2, 30, 60, 'EGP', 'confirmed', 'staff'),
  (t.u(101), 'MB-COMP02', t.u(610), t.u(251), 1, 30, 30, 'EGP', 'pending', 'staff');
select t.eq('(setup) counter 3', t.seats(t.u(610)), 3);
select t.as_user(t.u(4));
select t.eq('scheduled -> in_progress allowed (boarding may be skipped)', (select (public.transition_trip(t.u(610), 'in_progress'))->>'status'), 'in_progress');
select t.eq('in_progress -> cancelled refused', left(t.err_of($$select public.transition_trip(t.u(610), 'cancelled')$$), 5), '23514');
select t.eq('complete after departure: ok', (select (public.transition_trip(t.u(610), 'completed'))->>'status'), 'completed');
select t.eq('confirmed booking became completed', (select status from bookings where reference = 'MB-COMP01'), 'completed');
select t.eq('unconfirmed booking became no_show', (select status from bookings where reference = 'MB-COMP02'), 'no_show');
select t.eq('seats stay used after completion (history)', t.seats(t.u(610)), 3);
select t.eq('completed is terminal', left(t.err_of($$select public.transition_trip(t.u(610), 'scheduled')$$), 5), '23514');
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(611), t.u(101), t.u(201), t.u(222), t.u(232), date_trunc('day', now()) + interval '50 day 8 hours', date_trunc('day', now()) + interval '50 day 10 hours', 30, 10, 'scheduled');
select t.as_user(t.u(4));
select t.passes('boarding allowed from scheduled', $$select public.transition_trip(t.u(611), 'boarding')$$);
select t.passes('boarding -> scheduled allowed (revert)', $$select public.transition_trip(t.u(611), 'scheduled')$$);
select t.passes('...scheduled -> boarding -> in_progress', $$select public.transition_trip(t.u(611), 'boarding'); select public.transition_trip(t.u(611), 'in_progress')$$);
select t.eq('completing a trip that has not departed is refused', t.err_of($$select public.transition_trip(t.u(611), 'completed')$$), '23514|trip has not started');

-- ===== clients cannot bypass the machine =====
select t.as_user(t.u(2));
select t.eq('client cannot UPDATE status', left(t.err_of($$update trips set status = 'cancelled' where id = t.u(606)$$), 5), '42501');
select t.eq('client cannot INSERT a non-draft trip', left(t.err_of($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, status) values (t.u(101), t.u(201), now() + interval '90 day', now() + interval '90 day 1 hour', 1, 5, 'scheduled')$$), 5), '42501');
select t.eq('client cannot DELETE trips', left(t.err_of($$delete from trips where id = t.u(606)$$), 5), '42501');
select t.as_user(t.u(1));
select t.eq('platform admin cannot UPDATE status directly either', left(t.err_of($$update trips set status = 'cancelled' where id = t.u(606)$$), 5), '42501');

-- ===== monthly trip limit (Company B = starter) =====
select t.as_admin();
update plan_entitlements set int_value = 2 where key = 'max_trips_per_month' and plan_id = (select id from plans where code = 'starter');
delete from trips where company_id = t.u(102) and date_trunc('month', departure_at at time zone 'Africa/Cairo') = date_trunc('month', (now() + interval '120 days') at time zone 'Africa/Cairo');
select t.as_user(t.u(7));
select t.eq('B trip 1 in month M', t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, notes) values (t.u(102), t.u(203), %L, %L, 10, 5, 't701')$$, date_trunc('month', now() + interval '120 days') + interval '5 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '5 days 10 hours')), 'NO ERROR');
select t.eq('B trip 2 in month M', t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, notes) values (t.u(102), t.u(203), %L, %L, 10, 5, 't702')$$, date_trunc('month', now() + interval '120 days') + interval '6 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '6 days 10 hours')), 'NO ERROR');
select t.eq('B trip 3 in month M blocked by plan', left(t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (t.u(102), t.u(203), %L, %L, 10, 5)$$, date_trunc('month', now() + interval '120 days') + interval '7 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '7 days 10 hours')), 5), '53400');
select t.eq('...message names the limit', t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (t.u(102), t.u(203), %L, %L, 10, 5)$$, date_trunc('month', now() + interval '120 days') + interval '7 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '7 days 10 hours')), '53400|plan limit reached: max_trips_per_month (2)');
select t.eq('a trip in ANOTHER month is fine', t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity, notes) values (t.u(102), t.u(203), %L, %L, 10, 5, 't703')$$, date_trunc('month', now() + interval '150 days') + interval '5 days 8 hours', date_trunc('month', now() + interval '150 days') + interval '5 days 10 hours')), 'NO ERROR');
select t.eq('moving a trip INTO the full month is blocked', left(t.err_of(format($$update trips set departure_at = %L, arrival_at = %L where notes = 't703'$$, date_trunc('month', now() + interval '120 days') + interval '8 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '8 days 10 hours')), 5), '53400');
select t.eq('editing a trip inside its own month is fine (not counted twice)', t.err_of(format($$update trips set departure_at = %L, arrival_at = %L where notes = 't701'$$, date_trunc('month', now() + interval '120 days') + interval '9 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '9 days 10 hours')), 'NO ERROR');
select t.eq('cancelling one frees a slot', (select (public.transition_trip((select id from trips where notes = 't702'), 'cancelled'))->>'status'), 'cancelled');
select t.eq('...and then a new trip in month M fits', t.err_of(format($$insert into trips (company_id, route_id, departure_at, arrival_at, price, capacity) values (t.u(102), t.u(203), %L, %L, 10, 5)$$, date_trunc('month', now() + interval '120 days') + interval '7 days 8 hours', date_trunc('month', now() + interval '120 days') + interval '7 days 10 hours')), 'NO ERROR');
select t.as_admin();
update plan_entitlements set int_value = 200 where key = 'max_trips_per_month' and plan_id = (select id from plans where code = 'starter');

-- ===== audit + final consistency =====
select t.eq('trip transitions are audited', (select count(distinct action) >= 3 from audit_logs where action in ('trip.scheduled', 'trip.cancelled', 'trip.completed', 'trip.deleted', 'trip.draft')), true);
select t.eq('no seat drift anywhere', (select count(*) from app_private.seat_drift()), 0::bigint);

select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results where id > (select id from t.marks where name = '06');
select id, name, detail from t.results where not ok and id > (select id from t.marks where name = '06') order by id;
