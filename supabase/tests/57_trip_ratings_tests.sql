-- 57: P7c ratings (migration 0061). Needs 01 fixtures (companies A=101 / B=102, users 2 ownerA, 5 bookingA, 7 ownerB, 1 platform super_admin), 56 style helpers are re-declared here.
select t.as_admin();
create or replace function t.err57(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.cnt57(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;
create or replace function t.rate57(p_user uuid, p_booking uuid, p_t int, p_d int) returns text language plpgsql as $$
begin perform t.as_user(p_user); perform public.submit_trip_rating(p_booking, p_t, p_d); return 'ok'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.bk57(p_trip uuid, p_user uuid) returns uuid language sql security definer as $$
  select b.id from public.bookings b join public.customers c on c.company_id = b.company_id and c.id = b.customer_id where b.trip_id = p_trip and c.user_id = p_user limit 1 $$;
-- recount straight from the ratings, to compare with the aggregates the functions keep
create or replace function t.recount57() returns boolean language sql security definer as $$
  select coalesce((select bool_and(s.ratings = x.n and s.trip_stars_sum = x.ts and s.driver_stars_sum = x.ds)
                     from public.company_rating_stats s join (select company_id, count(*) n, sum(trip_stars) ts, sum(driver_stars) ds from public.trip_ratings where hidden_at is null group by company_id) x using (company_id)), true)
     and coalesce((select bool_and(s.ratings = x.n and s.stars_sum = x.ds and s.distribution = x.dist)
                     from public.driver_rating_stats s join (select driver_id, count(*) n, sum(driver_stars) ds,
                       array[count(*) filter (where driver_stars = 1), count(*) filter (where driver_stars = 2), count(*) filter (where driver_stars = 3), count(*) filter (where driver_stars = 4), count(*) filter (where driver_stars = 5)]::int[] dist
                       from public.trip_ratings where hidden_at is null group by driver_id) x using (driver_id)), true) $$;

-- fixtures -------------------------------------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) select t.u(5700 + g), 'r57_' || g || '@test.dev' from generate_series(1, 7) g on conflict do nothing;
insert into customers (id, company_id, full_name, phone, user_id) select t.u(5710 + g), t.u(101), 'Rater ' || g, '+2010005700' || g, t.u(5700 + g) from generate_series(1, 7) g;
insert into customers (id, company_id, full_name, phone) values (t.u(5720), t.u(101), 'Walk In', '+201000057200');              -- no login: can never rate
insert into buses (id, company_id, plate_number, capacity) select t.u(5730 + g), t.u(101), 'R57-' || g, 20 from generate_series(1, 7) g;
insert into drivers (id, company_id, full_name, phone) values (t.u(5741), t.u(101), 'Rate driver one', '+201300005701'), (t.u(5742), t.u(101), 'Rate driver two', '+201300005702');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select t.u(5750 + g), t.u(101), r.id, t.u(5730 + g), t.u(5741), date_trunc('day', now()) + (300 + g * 2) * interval '1 day' + interval '8 hours', date_trunc('day', now()) + (300 + g * 2) * interval '1 day' + interval '10 hours', 40, 12, 'scheduled'
  from generate_series(1, 7) g, routes r where r.company_id = t.u(101) and r.name = 'Sub-Go' limit 7;
-- T1 (5751): six raters, all boarded.  T2 (5752): ended 30 minutes ago.  T3 (5753): ended 20 days ago.  T4 (5754): cancelled.  T5 (5755): ended 2 h ago, rater 1 never boarded.
-- T6 (5756): boarded by driver one, then reassigned to driver two.  T7 (5757): walk-in only.
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source)
select t.u(5760 + g), t.u(101), 'R57-T1-' || g, t.u(5751), t.u(5710 + g), 1, 40, 40, 'EGP', 'confirmed', 'staff' from generate_series(1, 6) g;
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values
  (t.u(5771), t.u(101), 'R57-T2', t.u(5752), t.u(5711), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5772), t.u(101), 'R57-T3', t.u(5753), t.u(5711), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5773), t.u(101), 'R57-T4', t.u(5754), t.u(5711), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5774), t.u(101), 'R57-T5', t.u(5755), t.u(5711), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5775), t.u(101), 'R57-T6', t.u(5756), t.u(5711), 1, 40, 40, 'EGP', 'confirmed', 'staff'),
  (t.u(5776), t.u(101), 'R57-T7', t.u(5757), t.u(5720), 1, 40, 40, 'EGP', 'confirmed', 'staff');
-- board everything except T5 and T7 (tickets were issued by the trigger), as driver one
update tickets set status = 'boarded', boarded_at = now(), boarded_driver_id = t.u(5741) where trip_id in (t.u(5751), t.u(5752), t.u(5753), t.u(5754), t.u(5756));
update trips set driver_id = t.u(5742) where id in (t.u(5752), t.u(5753));   -- own driver: the turnaround rule forbids one driver on two close trips
-- re-date and move the trips to their states
create or replace function t.finish57(p_trip uuid, p_dep interval, p_ended interval) returns void language plpgsql security definer as $$
begin
  update public.trips set departure_at = now() - p_dep - interval '2 hours', arrival_at = now() - p_dep where id = p_trip;
  update public.trips set status = 'in_progress' where id = p_trip;
  update public.trips set status = 'completed' where id = p_trip;
  update public.trips set ended_at = now() - p_ended where id = p_trip;
end $$;
select t.finish57(t.u(5751), interval '3 hours', interval '2 hours');
select t.finish57(t.u(5752), interval '1 hour', interval '30 minutes');
select t.finish57(t.u(5753), interval '21 days', interval '20 days');
select t.finish57(t.u(5755), interval '7 hours', interval '6 hours');
select t.finish57(t.u(5756), interval '4 days', interval '3 days 23 hours');
select t.finish57(t.u(5757), interval '1 day', interval '23 hours');
update trips set status = 'cancelled' where id = t.u(5754);
select t.eq('setup: six trips are completed with an ended_at', t.cnt57($$select count(*) from trips where id in (select t.u(5750 + g) from generate_series(1, 7) g) and status = 'completed' and ended_at is not null$$), 6::bigint);

-- 1. the rules ----------------------------------------------------------------------------------------------------------------------------------------
select t.eq('invalid stars (0) refused', t.rate57(t.u(5701), t.bk57(t.u(5751), t.u(5701)), 0, 3), '22023|invalid stars');
select t.eq('invalid stars (6) refused', t.rate57(t.u(5701), t.bk57(t.u(5751), t.u(5701)), 3, 6), '22023|invalid stars');
select t.eq('invalid stars (null) refused', t.rate57(t.u(5701), t.bk57(t.u(5751), t.u(5701)), null, 3), '22023|invalid stars');
select t.eq('not boarded cannot rate', t.rate57(t.u(5701), t.bk57(t.u(5755), t.u(5701)), 5, 5), '23514|not boarded');
select t.eq('before one hour after the trip ended: refused', t.rate57(t.u(5701), t.bk57(t.u(5752), t.u(5701)), 5, 5), '23514|rating not open yet');
select t.eq('after the 14-day window: refused', t.rate57(t.u(5701), t.bk57(t.u(5753), t.u(5701)), 5, 5), '23514|rating window closed');
select t.eq('a cancelled trip cannot be rated', t.rate57(t.u(5701), t.bk57(t.u(5754), t.u(5701)), 5, 5), '23514|trip not rateable');
select t.eq('someone else''s booking: not found', t.rate57(t.u(5702), t.bk57(t.u(5751), t.u(5701)), 5, 5), 'P0002|booking not found');
select t.eq('a walk-in booking (no login) cannot be rated by anyone', t.rate57(t.u(5701), t.bk57(t.u(5757), t.u(5701)), 5, 5), 'P0002|booking not found');
select t.as_anon();
select t.eq('anon refused', t.err57($$select public.submit_trip_rating(gen_random_uuid(), 5, 5)$$) like '42501%', true);
select t.as_user(t.u(2));
select t.eq('a company owner cannot rate (not the rider)', t.rate57(t.u(2), t.bk57(t.u(5751), t.u(5701)), 5, 5), 'P0002|booking not found');
select t.eq('nothing stored by all the refusals', t.cnt57('select count(*) from public.trip_ratings'), 0::bigint);

-- 2. submit, double submit, recount ------------------------------------------------------------------------------------------------------------
select t.eq('rater 1 rates (trip 5, driver 4)', t.rate57(t.u(5701), t.bk57(t.u(5751), t.u(5701)), 5, 4), 'ok');
select t.eq('a second submit is refused', t.rate57(t.u(5701), t.bk57(t.u(5751), t.u(5701)), 1, 1), '23505|already rated');
select t.eq('ratings 2..4', t.rate57(t.u(5702), t.bk57(t.u(5751), t.u(5702)), 4, 5) || t.rate57(t.u(5703), t.bk57(t.u(5751), t.u(5703)), 3, 3) || t.rate57(t.u(5704), t.bk57(t.u(5751), t.u(5704)), 2, 2), 'okokok');
select t.as_admin();
select t.eq('company: not public below 5 ratings, 4 stored', (select ratings::text || ':' || coalesce(average::text, 'null') from public.company_public_ratings(array[t.u(101)])), '4:null');
select t.eq('aggregates equal a recount (4 ratings)', t.recount57(), true);
select t.eq('the driver is the one who boarded the rider', t.cnt57($$select count(*) from public.trip_ratings where driver_id = t.u(5741)$$), 4::bigint);
select t.eq('rater 5 and 6 rate (5/5 and 1/1)', t.rate57(t.u(5705), t.bk57(t.u(5751), t.u(5705)), 5, 5) || t.rate57(t.u(5706), t.bk57(t.u(5751), t.u(5706)), 1, 1), 'okok');
select t.as_admin();
select t.eq('aggregates equal a recount (6 ratings)', t.recount57(), true);
select t.eq('company average = (trip + driver stars) / (2 x ratings), out of 5: (5+4+3+2+5+1 + 4+5+3+2+5+1) / 12 = 3.3', (select average from public.company_public_ratings(array[t.u(101)])), 3.3::numeric);
select t.as_anon();
select t.eq('anon can read the public company rating', (select ratings from public.company_public_ratings(array[t.u(101)])), 6);
select t.eq('a list over 100 companies returns nothing (no scraping)', (select count(*) from public.company_public_ratings(array(select gen_random_uuid() from generate_series(1, 101)))), 0::bigint);

-- 3. reassignment: the boarded driver keeps the rating -----------------------------------------------------------------------------------
select t.as_admin();
update trips set driver_id = t.u(5742) where id = t.u(5756);
select t.eq('rater 1 rates T6 after the trip was reassigned', t.rate57(t.u(5701), t.bk57(t.u(5756), t.u(5701)), 4, 2), 'ok');
select t.as_admin();
select t.eq('...the rating sits on the driver who boarded him (one), not the new assignee (two)', t.cnt57($$select count(*) from public.trip_ratings where trip_id = t.u(5756) and driver_id = t.u(5741)$$), 1::bigint);
select t.eq('aggregates still equal a recount', t.recount57(), true);

-- 4. who can read what -------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(2));
select t.eq('company owner cannot read the ratings table (no rater identity)', t.err57('select * from public.trip_ratings') like '42501%', true);
select t.eq('company owner cannot read the stats tables directly either', t.err57('select * from public.driver_rating_stats') like '42501%', true);
select t.eq('owner A sees only A''s drivers with their ratings', (select string_agg(full_name || ':' || ratings || ':' || coalesce(average::text, '-'), ',' order by full_name) from public.company_driver_ratings() where full_name like 'Rate driver%'), 'Rate driver one:7:3.1,Rate driver two:0:-');
select t.eq('...driver one: stars 4+5+3+2+5+1+2 = 22 / 7 = 3.1', (select average from public.company_driver_ratings() where full_name = 'Rate driver one'), 3.1::numeric);
select t.as_user(t.u(7));
select t.eq('owner B sees none of company A''s drivers', (select count(*) from public.company_driver_ratings() where full_name like 'Rate driver%'), 0::bigint);
select t.as_user(t.u(3001));
select t.eq('a student cannot read driver ratings', t.err57('select * from public.company_driver_ratings()') like '42501%', true);
select t.as_user(t.u(6));
select t.eq('a driver cannot read the company-wide driver list', t.err57('select * from public.company_driver_ratings()') like '42501%', true);

-- 5. the rider''s own list -------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(5701));
select t.eq('my_rateable_bookings states for rater 1', (select string_agg(state, ',' order by state) from public.my_rateable_bookings()), 'closed,not_open_yet,rated,rated');
select t.eq('...never lists the booking that was not boarded or the cancelled trip', (select count(*) from public.my_rateable_bookings()), 4::bigint);
select t.as_user(t.u(5702));
select t.eq('another rider sees only their own', (select count(*) from public.my_rateable_bookings()), 1::bigint);
select t.as_anon();
select t.eq('anon refused', t.err57('select * from public.my_rateable_bookings()') like '42501%', true);

-- 6. the driver''s profile --------------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
insert into auth.users (id, email) values (t.u(5791), 'drv57@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id) select t.u(101), t.u(5791), r.id from roles r where r.key = 'driver';
update drivers set user_id = t.u(5791) where id = t.u(5741);
select t.as_user(t.u(5791));
select t.eq('profile: rating count equals the stored aggregate', ((public.driver_my_profile())->>'rating_count')::int, 7);
select t.eq('profile: average', ((public.driver_my_profile())->>'rating_average')::numeric, 3.1::numeric);
select t.eq('profile: distribution (1:1 2:2 3:1 4:1 5:2)', (public.driver_my_profile())->'rating_distribution', '[1,2,1,1,2]'::jsonb);

-- 7. platform moderation --------------------------------------------------------------------------------------------------------------------------------
select t.as_admin();
create or replace function t.anyrid57() returns uuid language sql security definer as $$ select id from public.trip_ratings order by created_at limit 1 $$;
select t.as_user(t.u(2));
select t.eq('owner cannot hide a rating', t.err57(format($q$select public.set_trip_rating_hidden(%L, true)$q$, t.anyrid57())) like '42501%', true);
select t.as_user(t.u(9));
select t.eq('platform support cannot hide a rating (super_admin only)', t.err57(format($q$select public.set_trip_rating_hidden(%L, true)$q$, t.anyrid57())) like '42501%', true);
select t.as_admin();
create or replace function t.rid57(p_user uuid) returns uuid language sql security definer as $$ select id from public.trip_ratings where rater_user_id = p_user and trip_id = t.u(5751) $$;
select t.as_user(t.u(1));
select t.passes('super_admin hides rater 6''s 1/1 rating', format($q$select public.set_trip_rating_hidden(%L, true)$q$, t.rid57(t.u(5706))));
select t.as_admin();
select t.eq('hiding reversed its part: aggregates equal a recount', t.recount57(), true);
select t.eq('...company count is now 6 (T1 five + T6 one)', (select ratings from public.company_rating_stats where company_id = t.u(101)), 6);
select t.as_user(t.u(1));
select t.passes('hiding twice changes nothing', format($q$select public.set_trip_rating_hidden(%L, true)$q$, t.rid57(t.u(5706))));
select t.as_admin();
select t.eq('...still equals a recount', t.recount57(), true);
select t.eq('audited hide (once)', t.cnt57($$select count(*) from audit_logs where action = 'rating.hidden'$$), 1::bigint);
select t.as_user(t.u(1));
select t.passes('super_admin restores it', format($q$select public.set_trip_rating_hidden(%L, false)$q$, t.rid57(t.u(5706))));
select t.as_admin();
select t.eq('restored: equals a recount and back to 7', t.recount57() and (select ratings from public.company_rating_stats where company_id = t.u(101)) = 7, true);
select t.eq('the audit rows carry no stars and no rater', t.cnt57($$select count(*) from audit_logs where action like 'rating.%' and (metadata::text ~ 'stars' or metadata::text ~ 'rater')$$), 0::bigint);

-- 8. public display rule and suspension -------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.eq('company with 7 ratings is public now (same formula)', (select average from public.company_public_ratings(array[t.u(101)])) is not null, true);
select t.eq('company B has no ratings: count 0, "New"', (select ratings::text || coalesce(average::text, ':new') from public.company_public_ratings(array[t.u(102)])), '0:new');
select t.as_admin();
update companies set status = 'suspended', suspended_at = now() where id = t.u(101);
select t.as_anon();
select t.eq('a suspended company is not listed at all', (select count(*) from public.company_public_ratings(array[t.u(101)])), 0::bigint);
select t.as_admin();
update companies set status = 'active', suspended_at = null where id = t.u(101);

-- 9. the notification job ---------------------------------------------------------------------------------------------------------------------------
delete from notifications where event_key = 'rating.request';
select t.eq('job: only boarded riders who have not rated and are inside the window are asked', app_private.notify_rating_requests(), 0);   -- rater 2..6 rated; rater 1 rated T1/T6; T5 not boarded; T2 too early
select t.as_admin();
update tickets set status = 'boarded', boarded_at = now(), boarded_driver_id = t.u(5741) where trip_id = t.u(5755);
select t.eq('job: the T5 rider (boarded now, window open) is asked once', app_private.notify_rating_requests(), 1);
select t.eq('job: a second run adds nothing (dedupe)', app_private.notify_rating_requests(), 0);
select t.eq('job: the notice lands in the rider''s inbox in both languages', t.cnt57($$select count(*) from notifications where event_key = 'rating.request' and recipient_user_id = t.u(5701)$$), 1::bigint);
select t.eq('job: scheduled', t.cnt57($$select count(*) from app_private.jobs where name = 'notify-rating-requests'$$), 1::bigint);

-- 10. captcha pass (0062) ---------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.passes('captcha: enforcement on', $$select public.set_captcha_enforcement(true, 'unit-test-captcha-secret-0123456789abcdef')$$);
select t.as_admin();
select t.eq('captcha: a rating without a pass is refused', t.rate57(t.u(5701), t.bk57(t.u(5755), t.u(5701)), 4, 4), '42501|captcha required');
select t.as_user(t.u(5701));
select t.eq('captcha: a rating pass can be redeemed', t.redeem53(t.u(5701), 'rating', 'rrrrrrrrrrrrrrrr'), 'ok');
select t.as_admin();
select t.eq('captcha: a refused rating (window closed) does not burn the pass', t.rate57(t.u(5701), t.bk57(t.u(5753), t.u(5701)), 4, 4) || '/' || t.open53(t.u(5701), 'rating'), '23514|rating window closed/1');
select t.eq('captcha: with the pass the rating is accepted', t.rate57(t.u(5701), t.bk57(t.u(5755), t.u(5701)), 4, 4), 'ok');
select t.eq('captcha: ...and the pass is spent', t.open53(t.u(5701), 'rating'), 0::bigint);
select t.as_user(t.u(1));
select t.passes('captcha: enforcement off again', $$select public.set_captcha_enforcement(false)$$);
select t.as_admin();
select t.eq('aggregates still equal a recount', t.recount57(), true);
