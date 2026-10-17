-- 07: customer identity (0012). Requires 01 fixtures + 05 (fixture trip t.u(501) in company A, t.u(506) cap 20).
select t.as_admin();
insert into auth.users (id, email, phone, phone_confirmed_at) values
  (t.u(71), 'c71@test.dev', '201001110071', now()),      -- verified phone, has guest rows in A
  (t.u(72), 'c72@test.dev', '201001110072', null),       -- phone NOT verified
  (t.u(73), 'c73@test.dev', '201001110073', now()),      -- verified, never booked
  (t.u(74), 'c74@test.dev', '201001110074', now())       -- later gets 71's number (recycled number scenario below)
  on conflict do nothing;
insert into customers (id, company_id, full_name, phone) values
  (t.u(701), t.u(101), 'Guest 71 in A', '+201001110071'),
  (t.u(702), t.u(102), 'Guest 71 in B', '+201001110071'),
  (t.u(703), t.u(101), 'Guest 72 in A', '+201001110072');
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source, notes)
  values (t.u(711), t.u(101), 'MB-TESTID1', t.u(506), t.u(701), 1, 30, 30, 'EGP', 'confirmed', 'staff', 'staff-only note');

-- unverified phone can't claim
select t.as_user(t.u(72));
select t.eq('claim: unverified phone rejected', (select t.err_of($$select public.claim_my_customer(t.u(101))$$) like '42501|phone not verified%'), true);
-- anon can't call
select t.as_anon();
select t.eq('claim: anon has no execute', (select t.err_of($$select public.claim_my_customer(t.u(101))$$) like '42501|%'), true);
-- no guest row => nothing to claim, same for missing / inactive company
select t.as_user(t.u(73));
select t.eq('claim: nothing to claim', (select t.err_of($$select public.claim_my_customer(t.u(101))$$) like 'P0002|%'), true);
select t.eq('claim: inactive company looks identical', (select t.err_of($$select public.claim_my_customer(t.u(103))$$) like 'P0002|%'), true);
-- happy path
select t.as_user(t.u(71));
select t.eq('claim: verified phone links A row', (select (public.claim_my_customer(t.u(101)))->>'customer_id'), t.u(701)::text);
select t.eq('claim: idempotent', (select (public.claim_my_customer(t.u(101)))->>'customer_id'), t.u(701)::text);
select t.eq('own customers: sees A row only so far', (select t.rows('select 1 from customers')), 1::bigint);
select t.eq('claim: company B row is a separate link', (select (public.claim_my_customer(t.u(102)))->>'customer_id'), t.u(702)::text);
select t.eq('own customers: sees A + B rows', (select t.rows('select 1 from customers')), 2::bigint);
-- ownership. Real GoTrue enforces UNIQUE(auth.users.phone), so a recycled number reaches a new account only AFTER the
-- old holder lost it. Model exactly that: 71 loses the number, 74 verifies it. The row stays linked to 71.
select t.as_admin();
update auth.users set phone = null where id = t.u(71);
update auth.users set phone = '201001110071', phone_confirmed_at = now() where id = t.u(74);
select t.as_user(t.u(74));
select t.eq('claim: same phone, row already linked to someone else', (select t.err_of($$select public.claim_my_customer(t.u(101))$$) like '42501|customer already linked%'), true);
select t.eq('other user sees zero customers', (select t.rows('select 1 from customers')), 0::bigint);
select t.as_admin();   -- restore the original numbers for the rest of the suite
update auth.users set phone = '201001110074' where id = t.u(74);
update auth.users set phone = '201001110071', phone_confirmed_at = now() where id = t.u(71);
-- cannot set user_id directly
select t.as_user(t.u(5));   -- booking staff A (customers.write)
select t.raises('staff cannot write customers.user_id (update)', format($$update customers set user_id = %L where id = %L$$, t.u(74), t.u(703)), '42501');
select t.raises('staff cannot write customers.user_id (insert)', format($$insert into customers (company_id, full_name, phone, user_id) values (%L,'x','+201009998877',%L)$$, t.u(101), t.u(74)), '42501');
select t.passes('staff can still edit normal customer columns', format($$update customers set notes = 'ok' where id = %L$$, t.u(703)));
select t.as_user(t.u(71));
select t.eq('customer cannot write customers directly (0 rows via RLS)', (select t.affected(format($$update customers set full_name='x' where id = %L$$, t.u(701)))), 0::bigint);
-- bookings
select t.eq('my_bookings: sees own A booking', (select count(*) from public.my_bookings()), 1::bigint);
select t.eq('my_bookings: filter by company', (select count(*) from public.my_bookings(t.u(102))), 0::bigint);
select t.eq('customer has no direct bookings select (0 rows via RLS)', (select t.rows('select 1 from bookings')), 0::bigint);
select t.as_user(t.u(74));
select t.eq('my_bookings: other user sees none', (select count(*) from public.my_bookings()), 0::bigint);
-- update own profile
select t.as_user(t.u(71));
select t.eq('update_my_customer: ok', (select (public.update_my_customer(t.u(101), 'New Name', null, 'Cairo Univ'))->>'customer_id'), t.u(701)::text);
select t.eq('update_my_customer: other company row not touchable', (select t.err_of(format($$select public.update_my_customer(%L,'Hack')$$, t.u(103))) like 'P0002|%'), true);
select t.as_user(t.u(74));
select t.eq('update_my_customer: not owner', (select t.err_of(format($$select public.update_my_customer(%L,'Hack')$$, t.u(101))) like 'P0002|%'), true);
-- suspended company => customer loses access
select t.as_admin();
update companies set status = 'suspended', suspended_at = now(), suspension_reason = 't' where id = t.u(101);
select t.as_user(t.u(71));
select t.eq('suspended company: my_bookings empty', (select count(*) from public.my_bookings(t.u(101))), 0::bigint);
select t.eq('suspended company: customer rows hidden', (select t.rows('select 1 from customers where company_id = ' || quote_literal(t.u(101)))), 0::bigint);
select t.as_admin();
update companies set status = 'active', suspended_at = null, suspension_reason = null where id = t.u(101);
