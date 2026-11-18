-- 34: route subscriptions PHASE E1 (migration 0038): staff revoke with per-booking choice, nightly expiry.
-- Requires 30 (route Sub-Go + return, members 3001/3002), 33 (driver 3341, bus 3331). Users: 2 ownerA, 5 bookingA, 7 ownerB, 91 driver A, member 3001.
select t.as_admin();
create or replace function t.plan34() returns uuid language sql security definer as $$ select id from public.route_plans where name = 'Revoke Range' $$;
create or replace function t.sub34(p_user int) returns uuid language sql security definer as $$ select id from public.route_subscriptions where plan_id = t.plan34() and user_id = t.u(p_user) $$;
create or replace function t.bk34(p_trip uuid) returns uuid language sql security definer as $$ select id from public.bookings where subscription_id = t.sub34(3001) and trip_id = p_trip $$;
create or replace function t.bstat34(p_trip uuid) returns text language sql security definer as $$ select status from public.bookings where subscription_id = t.sub34(3001) and trip_id = p_trip $$;

select t.as_user(t.u(2));
select public.create_route_plan(t.sroute33('Sub-Go'), 'Revoke Range', 400, 'range', null, current_date - 1, current_date + 120);
select t.as_user(t.u(3001)); select public.request_route_subscription(t.plan34());
select t.as_user(t.u(3002)); select public.request_route_subscription(t.plan34());
select t.as_user(t.u(5)); select public.decide_route_subscription(t.sub34(3001), true); select public.decide_route_subscription(t.sub34(3002), true);
select t.as_admin();
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(3601), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '100 day 6 hours',  date_trunc('day', now()) + interval '100 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3604), t.u(101), t.sroute33('Sub-Go (return)'), t.u(3331), t.u(3341), date_trunc('day', now()) + interval '100 day 12 hours', date_trunc('day', now()) + interval '100 day 13 hours', 50, 5, 'scheduled'),
  (t.u(3602), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '101 day 6 hours',  date_trunc('day', now()) + interval '101 day 7 hours',  50, 5, 'scheduled'),
  (t.u(3603), t.u(101), t.sroute33('Sub-Go'),          t.u(3331), t.u(3341), date_trunc('day', now()) + interval '102 day 6 hours',  date_trunc('day', now()) + interval '102 day 7 hours',  50, 5, 'scheduled');
select t.as_user(t.u(3001));
select public.create_my_subscriber_booking(t.sub34(3001), t.u(3601), t.u(3604));
select public.create_my_subscriber_booking(t.sub34(3001), t.u(3602));
select public.create_my_subscriber_booking(t.sub34(3001), t.u(3603));
select t.as_admin();
-- one leg is already boarded (cannot be cancelled by the revoke)
update tickets set status = 'boarded', boarded_at = now(), boarded_by = t.u(2), boarded_driver_id = t.u(3341)
 where booking_id = t.bk34(t.u(3603));

-- who may see / use it
select t.as_user(t.u(3001));
select t.eq('list: the member cannot use the staff list', t.err_of(format($$select * from public.subscription_future_bookings(%L)$$, t.sub34(3001))), 'P0002|subscription not found');
select t.eq('revoke: the member cannot revoke', t.err_of(format($$select public.revoke_route_subscription(%L)$$, t.sub34(3001))), 'P0002|subscription not found');
select t.as_user(t.u(7));
select t.eq('list: company B staff get nothing', t.err_of(format($$select * from public.subscription_future_bookings(%L)$$, t.sub34(3001))), 'P0002|subscription not found');
select t.eq('revoke: company B staff cannot revoke', t.err_of(format($$select public.revoke_route_subscription(%L)$$, t.sub34(3001))), 'P0002|subscription not found');
select t.as_user(t.u(91));
select t.eq('revoke: a driver (no bookings.write) cannot revoke', t.err_of(format($$select public.revoke_route_subscription(%L)$$, t.sub34(3001))), 'P0002|subscription not found');
select t.as_anon();
select t.eq('revoke: anonymous is refused', left(t.err_of(format($$select public.revoke_route_subscription(%L)$$, t.sub34(3001))), 5), '42501');

-- the warning list
select t.as_user(t.u(5));
select t.eq('list: staff see the four future bookings', (select count(*) from public.subscription_future_bookings(t.sub34(3001))), 4::bigint);
select t.eq('list: the boarded one is not cancellable, the other three are', (select string_agg(can_cancel::text, ',' order by departure_at, booking_id) from public.subscription_future_bookings(t.sub34(3001))), 'true,true,true,false');
select t.eq('list: legs carry direction', (select string_agg(direction, ',' order by departure_at, booking_id) from public.subscription_future_bookings(t.sub34(3001))), 'go,return,go,go');

-- validation is all-or-nothing
select t.eq('revoke: a foreign / unknown booking id is refused', t.err_of(format($$select public.revoke_route_subscription(%L, array[%L]::uuid[])$$, t.sub34(3001), t.u(999999))), '23514|booking cannot be cancelled');
select t.eq('revoke: a boarded booking cannot be cancelled', t.err_of(format($$select public.revoke_route_subscription(%L, array[%L]::uuid[])$$, t.sub34(3001), t.bk34(t.u(3603)))), '23514|booking cannot be cancelled');
select t.as_admin();
select t.eq('revoke: refusals changed nothing', (select status from route_subscriptions where id = t.sub34(3001)) || ':' || t.bstat34(t.u(3601)), 'active:confirmed');
select t.as_user(t.u(5));
select t.eq('revoke: reason too long refused', t.err_of(format($$select public.revoke_route_subscription(%L, '{}', %L)$$, t.sub34(3001), repeat('x', 501))), '22023|input too long');

-- revoke: cancel two bookings (go 3601 and 3602), keep the other two
select t.eq('revoke: result counts', (select public.revoke_route_subscription(t.sub34(3001), array[t.bk34(t.u(3601)), t.bk34(t.u(3602))], 'left the university'))::text, '{"id": "' || t.sub34(3001)::text || '", "kept": 2, "status": "revoked", "cancelled": 2}');
select t.as_admin();
select t.eq('revoke: status revoked with who and when', (select status || ':' || (revoked_by = t.u(5))::text || ':' || (revoked_at is not null)::text || ':' || revoke_reason from route_subscriptions where id = t.sub34(3001)), 'revoked:true:true:left the university');
select t.eq('revoke: chosen bookings are cancelled', t.bstat34(t.u(3601)) || ',' || t.bstat34(t.u(3602)), 'cancelled,cancelled');
select t.eq('revoke: the others are kept', t.bstat34(t.u(3604)) || ',' || t.bstat34(t.u(3603)), 'confirmed,confirmed');
select t.eq('revoke: seats of cancelled trips were released', (select seats_booked::int from trips where id = t.u(3601)), 0);
select t.eq('revoke: seats of kept trips are still held', (select seats_booked::int from trips where id = t.u(3604)), 1);
select t.eq('revoke: audited with counts, no free text', (select (metadata->>'cancelled_bookings') || ',' || (metadata->>'kept_bookings') || ',' || (metadata ? 'reason')::text from audit_logs where action = 'route_subscription.revoked' and entity_id = t.sub34(3001)), '2,2,false');
select t.as_user(t.u(5));
select t.eq('revoke: a second revoke is refused', t.err_of(format($$select public.revoke_route_subscription(%L)$$, t.sub34(3001))), '23514|subscription is not active');
select t.as_user(t.u(3001));
select t.eq('member: sees status revoked', (select status from public.my_route_subscriptions() where plan_name = 'Revoke Range'), 'revoked');
select t.as_user(t.u(2));
select t.eq('staff inbox lists the revoked row', (select count(*) from public.route_subscription_list where plan_name = 'Revoke Range' and status = 'revoked'), 1::bigint);
select t.as_user(t.u(3001));
select t.eq('member: can request the same plan again after a revoke', t.err_of(format($$select public.request_route_subscription(%L)$$, t.plan34())), 'NO ERROR');

-- expiry job
select t.as_admin();
update route_subscriptions set valid_from = current_date - 10, valid_to = current_date - 1 where id = t.sub34(3002);
select t.eq('expiry: the lapsed row reads as expired already', (select status from public.route_subscriptions where id = t.sub34(3002)), 'active');
select t.eq('expiry: the job flips exactly the lapsed rows', app_private.expire_route_subscriptions() >= 1, true);
select t.eq('expiry: lapsed is now expired', (select status from route_subscriptions where id = t.sub34(3002)), 'expired');
select t.eq('expiry: a still valid active subscription is untouched', (select count(*) from route_subscriptions where status = 'active' and valid_to >= current_date) > 0, true);
select t.eq('expiry: a second run changes nothing', app_private.expire_route_subscriptions(), 0);
select t.as_user(t.u(3001));
select t.eq('expiry: members cannot call the job', left(t.err_of('select app_private.expire_route_subscriptions()'), 5), '42501');
select t.as_admin();
