-- 28: set_booking_amount_paid + booking_list view (0032). Requires 01 fixtures (run after 05).
select t.as_admin();
create table if not exists t.ids (name text primary key, id uuid);
alter table t.ids disable row level security;
grant all on t.ids to anon, authenticated;
create or replace function t.err_of(stmt text) returns text language plpgsql as
  $$ begin execute stmt; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(701), t.u(101), t.u(201), t.u(225), t.u(234), now() + interval '40 day', now() + interval '40 day 2 hours', 30, 10, 'scheduled')
  on conflict do nothing;

select t.as_user(t.u(5));   -- booking staff A
delete from t.ids where name in ('b_full', 'b_part');
select t.eq('create: new booking starts with amount_paid 0', (select (public.create_booking(t.u(701), 'Amount Ann', '+201000700001', 2, p_idempotency_key => 'amt-1'))->>'total_amount'), '60.00');
select t.as_admin();
insert into t.ids select 'b_full', id from bookings where customer_id = (select id from customers where phone = '+201000700001' and company_id = t.u(101));
select t.as_user(t.u(5));
select t.eq('new booking: amount_paid 0 / unpaid', (select amount_paid::text || '/' || payment_status from bookings where id = (select id from t.ids where name = 'b_full')), '0.00/unpaid');

-- derive status from amount
select t.eq('partial amount -> partial', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 25))->>'payment_status'), 'partial');
select t.eq('...stored', (select amount_paid::text from bookings where id = (select id from t.ids where name = 'b_full')), '25.00');
select t.eq('full amount -> paid', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 60))->>'payment_status'), 'paid');
select t.eq('lowering amount -> partial again', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 10.5))->>'payment_status'), 'partial');
select t.eq('zero -> unpaid', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 0))->>'payment_status'), 'unpaid');

-- validation
select t.eq('amount above total rejected', t.err_of(format('select public.set_booking_amount_paid(%L, 60.01)', (select id from t.ids where name = 'b_full'))), '23514|amount exceeds booking total');
select t.eq('negative rejected', left(t.err_of(format('select public.set_booking_amount_paid(%L, -1)', (select id from t.ids where name = 'b_full'))), 5), '22023');
select t.eq('3 decimals rejected', left(t.err_of(format('select public.set_booking_amount_paid(%L, 10.123)', (select id from t.ids where name = 'b_full'))), 5), '22023');
select t.eq('null rejected', left(t.err_of(format('select public.set_booking_amount_paid(%L, null)', (select id from t.ids where name = 'b_full'))), 5), '22023');
select t.eq('ghost booking = not found', left(t.err_of($$select public.set_booking_amount_paid(gen_random_uuid(), 1)$$), 5), 'P0002');

-- legacy RPC stays consistent
select t.eq('legacy paid -> amount = total', (select (public.set_booking_payment_status((select id from t.ids where name = 'b_full'), 'paid'))->>'amount_paid'), '60.00');
select t.eq('legacy partial without a recorded amount is refused', left(t.err_of(format('select public.set_booking_payment_status(%L, ''partial'')', (select id from t.ids where name = 'b_full'))), 5), '23514');
select t.eq('refund -> status refunded, amount 0', (select (public.set_booking_payment_status((select id from t.ids where name = 'b_full'), 'refunded'))->>'amount_paid'), '0.00');
select t.eq('refunded + amount 0 stays refunded', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 0))->>'payment_status'), 'refunded');
select t.eq('refunded + new amount re-derives', (select (public.set_booking_amount_paid((select id from t.ids where name = 'b_full'), 60))->>'payment_status'), 'paid');

-- table-level backstops (owner SQL)
select t.as_admin();
select t.eq('CHECK: amount_paid > total refused even for owner SQL', left(t.err_of(format('update bookings set amount_paid = 999 where id = %L', (select id from t.ids where name = 'b_full'))), 5), '23514');
select t.as_user(t.u(5));
select t.eq('clients cannot write amount_paid directly', left(t.err_of(format('update bookings set amount_paid = 1 where id = %L', (select id from t.ids where name = 'b_full'))), 5), '42501');

-- cancelled booking: no new money
select t.as_user(t.u(5));
select t.as_admin();
select t.as_user(t.u(5));
select public.create_booking(t.u(701), 'Cancel Cid', '+201000700002', 1);
select t.as_admin();
insert into t.ids select 'b_cancel', id from bookings where customer_id = (select id from customers where phone = '+201000700002' and company_id = t.u(101));
select t.as_user(t.u(5));
select public.cancel_booking((select id from t.ids where name = 'b_cancel'));
select t.eq('cancelled booking cannot receive money', left(t.err_of(format('select public.set_booking_amount_paid(%L, 5)', (select id from t.ids where name = 'b_cancel'))), 5), '23514');

-- authorization
select t.as_user(t.u(4));   -- operations: read only
select t.eq('read-only role cannot set amount (same as ghost)', t.err_of(format('select public.set_booking_amount_paid(%L, 5)', (select id from t.ids where name = 'b_full'))), t.err_of($$select public.set_booking_amount_paid(gen_random_uuid(), 5)$$));
select t.as_user(t.u(7));   -- owner of B
select t.eq('other tenant cannot set amount (same as ghost)', t.err_of(format('select public.set_booking_amount_paid(%L, 5)', (select id from t.ids where name = 'b_full'))), t.err_of($$select public.set_booking_amount_paid(gen_random_uuid(), 5)$$));
select t.as_anon();
select t.eq('anon cannot call it', left(t.err_of($$select public.set_booking_amount_paid(gen_random_uuid(), 5)$$), 5), '42501');
select t.eq('anon cannot read booking_list', left(t.err_of($$select count(*) from public.booking_list$$), 5), '42501');

-- booking_list: isolation, columns, boarding
select t.as_user(t.u(7));
select t.eq('company B sees none of A bookings in booking_list', (select count(*) from public.booking_list where company_id = t.u(101)), 0::bigint);
select t.as_user(t.u(5));
select t.eq('A staff sees the booking with customer + route + trip time', (select customer_name || '|' || (route_name is not null)::text || '|' || (trip_departure_at is not null)::text from public.booking_list where id = (select id from t.ids where name = 'b_full')), 'Amount Ann|true|true');
select t.eq('unboarded: 0/2 not_boarded', (select tickets_boarded::text || '/' || tickets_total::text || ' ' || boarding_status from public.booking_list where id = (select id from t.ids where name = 'b_full')), '0/2 not_boarded');
select t.as_admin();
update tickets set status = 'boarded', boarded_at = now(), boarded_driver_id = t.u(231)
 where id = (select id from tickets where booking_id = (select id from t.ids where name = 'b_full') order by ticket_index limit 1);
select t.as_user(t.u(5));
select t.eq('one of two boarded: partial', (select tickets_boarded::text || '/' || tickets_total::text || ' ' || boarding_status from public.booking_list where id = (select id from t.ids where name = 'b_full')), '1/2 partial');
select t.as_admin();
update tickets set status = 'boarded', boarded_at = now(), boarded_driver_id = t.u(231) where booking_id = (select id from t.ids where name = 'b_full') and status = 'valid';
select t.as_user(t.u(5));
select t.eq('all boarded', (select boarding_status from public.booking_list where id = (select id from t.ids where name = 'b_full')), 'boarded');
select t.eq('cancelled booking: voided tickets do not count', (select tickets_total::text || ' ' || boarding_status from public.booking_list where id = (select id from t.ids where name = 'b_cancel')), '0 not_boarded');
select t.as_user(t.u(4));   -- operations: no customers.read
select t.eq('operations sees booking rows but no customer data', (select (customer_name is null)::text from public.booking_list where id = (select id from t.ids where name = 'b_full')), 'true');
select t.as_user(t.u(6));   -- driver
select t.eq('driver sees no bookings in booking_list', (select count(*) from public.booking_list), 0::bigint);
