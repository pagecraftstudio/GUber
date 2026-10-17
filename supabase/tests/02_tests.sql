-- Self-contained: (re)creates helpers + t.results, then runs tests. Requires fixtures from 01 to exist.
-- LOCAL/CI TEST SUPPORT. Run as superuser after all migrations.
create schema if not exists t;
grant usage on schema t to anon, authenticated;
create table if not exists t.results (id serial primary key, ok boolean not null, name text not null, detail text);
alter table t.results disable row level security;  -- Supabase auto-enables RLS on new tables
grant all on t.results to anon, authenticated;
grant usage on sequence t.results_id_seq to anon, authenticated;
create or replace function t.u(n int) returns uuid language sql immutable as
  $$ select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function t.as_user(p uuid) returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', p::text, false); set role authenticated; end $$;
create or replace function t.as_anon() returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); set role anon; end $$;
create or replace function t.as_admin() returns void language plpgsql as
  $$ begin reset role; perform set_config('request.jwt.claim.sub', '', false); end $$;
create or replace function t.rows(stmt text) returns bigint language plpgsql as
  $$ declare n bigint; begin execute 'select count(*) from (' || stmt || ') q' into n; return n;
     exception when others then
       insert into t.results(ok,name,detail) values (false,'ERROR in t.rows: ' || stmt, sqlstate || ': ' || sqlerrm); return -1; end $$;
create or replace function t.affected(stmt text) returns bigint language plpgsql as
  $$ declare n bigint; begin execute stmt; get diagnostics n = row_count; return n;
     exception when others then
       insert into t.results(ok,name,detail) values (false,'ERROR in t.affected: ' || stmt, sqlstate || ': ' || sqlerrm); return -1; end $$;
create or replace function t.eq(name text, got anyelement, want anyelement) returns void language plpgsql as
  $$ begin
       if got is not distinct from want then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('got %s, want %s',got,want)); raise notice 'FAIL  % (got %, want %)', name, got, want; end if;
     end $$;
create or replace function t.raises(name text, stmt text, state text default null) returns void language plpgsql as
  $$ begin
       execute stmt;
       insert into t.results(ok,name,detail) values (false,name,'no error'); raise notice 'FAIL  % (no error)', name;
     exception when others then
       if state is null or sqlstate = state then insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
       else insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s, want %s: %s',sqlstate,state,sqlerrm)); raise notice 'FAIL  % (sqlstate %, want %: %)', name, sqlstate, state, sqlerrm; end if;
     end $$;
create or replace function t.passes(name text, stmt text) returns void language plpgsql as
  $$ begin
       execute stmt; insert into t.results(ok,name) values (true,name); raise notice 'PASS  %', name;
     exception when others then insert into t.results(ok,name,detail) values (false,name,format('sqlstate %s: %s',sqlstate,sqlerrm)); raise notice 'FAIL  % (sqlstate %: %)', name, sqlstate, sqlerrm;
     end $$;


-- ===== TENANT ISOLATION (owner of A vs data of B) =====
select t.as_user(t.u(2));
select t.eq('A owner sees only own routes', t.rows('select 1 from routes'), 2::bigint);
select t.eq('A owner cannot see B route by id', t.rows('select 1 from routes where id = t.u(203)'), 0::bigint);
select t.eq('A owner cannot see B trips', t.rows('select 1 from trips where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B bookings', t.rows('select 1 from bookings where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B customers', t.rows('select 1 from customers where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B buses', t.rows('select 1 from buses where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B drivers', t.rows('select 1 from drivers where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B invoices', t.rows('select 1 from invoices where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B media', t.rows('select 1 from media where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot see B publications', t.rows('select 1 from website_publications where company_id = t.u(102)'), 0::bigint);
select t.eq('A owner cannot UPDATE B route', t.affected($$update routes set name = 'hacked' where id = t.u(203)$$), 0::bigint);
select t.eq('A owner cannot DELETE B stop', t.affected($$delete from route_stops where id = t.u(213)$$), 0::bigint);
select t.eq('A owner cannot UPDATE B trip', t.affected($$update trips set price = 1 where id = t.u(243)$$), 0::bigint);
select t.raises('A owner cannot INSERT route into B', $$insert into routes (company_id,name,origin_name,destination_name) values (t.u(102),'x','x','x')$$, '42501');
select t.raises('A owner cannot INSERT trip into B', $$insert into trips (company_id,route_id,departure_at,arrival_at,price,capacity) values (t.u(102),t.u(203),now(),now()+interval '1 hour',1,1)$$, '42501');
select t.raises('company_id immutable (move own route to B)', $$update routes set company_id = t.u(102) where id = t.u(201)$$);
select t.eq('tenants have no policy on companies', t.rows('select 1 from companies'), 0::bigint);
select t.eq('tenants have no access to company_notes', t.rows('select 1 from company_notes'), 0::bigint);
select t.eq('my_company returns exactly own company', t.rows('select 1 from my_company'), 1::bigint);
select t.eq('my_company_status returns own status', (select status from my_company_status() limit 1), 'active');
select t.raises('my_company view has no suspension_reason', 'select suspension_reason from my_company', '42703');
-- cross-tenant link attempts at DB level (as superuser = RLS off; composite FK must still reject)
select t.as_admin();
select t.raises('composite FK blocks A template -> B bus', $$insert into trip_templates (company_id,name,route_id,bus_id,departure_time,duration_minutes,days_of_week,start_date,price,capacity) values (t.u(101),'x',t.u(201),t.u(224),'07:00',60,'{1}',current_date,1,10)$$, '23503');
select t.raises('A trip -> B bus rejected (trigger/FK)', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) values (t.u(101),t.u(201),t.u(224),t.u(231),now()+interval '30 day',now()+interval '30 day 1 hour',1,10,'scheduled')$$);
select t.raises('composite FK blocks A booking -> B customer', $$insert into bookings (company_id,reference,trip_id,customer_id,seats_count,unit_price,total_amount,currency,status,source) values (t.u(101),'MB-X',t.u(241),t.u(252),1,1,1,'EGP','pending','staff')$$, '23503');
select t.raises('composite FK blocks website logo -> B media', $$insert into website_settings (company_id, logo_media_id) values (t.u(101), t.u(271))$$, '23503');
select t.raises('media path must start with own company_id', $$insert into media (company_id,kind,bucket,storage_path,original_filename,mime_type,size_bytes) values (t.u(101),'logo','company-public','other/logo.png','l.png','image/png',10)$$, '23514');
select t.raises('media path traversal rejected', $$insert into media (company_id,kind,bucket,storage_path,original_filename,mime_type,size_bytes) values (t.u(101),'logo','company-public', t.u(101)::text || '/../x.png','l.png','image/png',10)$$, '23514');

-- ===== ROLES / PERMISSIONS =====
select t.as_user(t.u(3));   -- manager
select t.eq('manager reads trips', t.rows('select 1 from trips') > 0, true);
select t.eq('manager cannot read invoices (no billing.read)', t.rows('select 1 from invoices'), 0::bigint);
select t.raises('manager cannot add company_users', $$insert into company_users (company_id,user_id,role_id) select t.u(101), t.u(7), id from roles where key='owner'$$, '42501');
select t.as_user(t.u(2));   -- owner
select t.eq('owner reads invoices', t.rows('select 1 from invoices'), 1::bigint);
select t.raises('owner cannot write company_users directly (RPC only)', $$insert into company_users (company_id,user_id,role_id) select t.u(101), t.u(7), id from roles where key='manager'$$, '42501');
select t.eq('owner cannot self-edit role via client', t.affected($$update company_users set role_id = role_id where user_id = t.u(2)$$), 0::bigint);
select t.eq('owner sees exactly own-company staff profiles (5)', t.rows('select 1 from profiles'), 5::bigint);
select t.eq('owner cannot see B profiles', t.rows('select 1 from profiles where id = t.u(7)'), 0::bigint);
select t.raises('profile email not client-writable', $$update profiles set email = 'x@x.dev' where id = t.u(2)$$, '42501');
select t.raises('profile is_active not client-writable', $$update profiles set is_active = true where id = t.u(2)$$, '42501');
select t.eq('profile name is client-writable', t.affected($$update profiles set full_name = 'New Name' where id = t.u(2)$$), 1::bigint);
select t.as_user(t.u(4));   -- operations
select t.eq('operations cannot read customers', t.rows('select 1 from customers'), 0::bigint);
select t.eq('operations can read buses', t.rows('select 1 from buses') > 0, true);
select t.raises('direct DELETE on trips is closed for clients (0011: use delete_draft_trip)', $$delete from trips where id = t.u(244)$$, '42501');
select t.passes('operations can delete a draft trip through the RPC', $$select public.delete_draft_trip(t.u(244))$$);
select t.raises('RPC refuses to delete a scheduled trip', $$select public.delete_draft_trip(t.u(242))$$, '23514');
select t.as_user(t.u(5));   -- booking staff
select t.eq('booking staff reads customers', t.rows('select 1 from customers'), 1::bigint);
select t.eq('booking staff reads bookings', t.rows('select 1 from bookings'), 1::bigint);
select t.eq('booking staff cannot read buses', t.rows('select 1 from buses'), 0::bigint);
select t.eq('booking staff cannot write trips', t.affected($$update trips set price = 1$$), 0::bigint);
select t.raises('bookings cannot be inserted by clients (function only)', $$insert into bookings (company_id,reference,trip_id,customer_id,seats_count,unit_price,total_amount,currency,status,source) values (t.u(101),'MB-Z',t.u(241),t.u(251),1,1,1,'EGP','pending','staff')$$, '42501');
select t.as_user(t.u(6));   -- driver
select t.eq('driver sees only assigned trip', t.rows('select 1 from trips'), 1::bigint);
select t.eq('driver sees assigned trip id', (select id from trips limit 1), t.u(241));
select t.eq('driver sees only assigned route', t.rows('select 1 from routes'), 1::bigint);
select t.eq('driver sees only assigned bus', t.rows('select 1 from buses'), 1::bigint);
select t.eq('driver sees only own driver row', t.rows('select 1 from drivers'), 1::bigint);
select t.eq('driver cannot read bookings', t.rows('select 1 from bookings'), 0::bigint);
select t.eq('driver cannot read customers', t.rows('select 1 from customers'), 0::bigint);
select t.eq('driver cannot read invoices', t.rows('select 1 from invoices'), 0::bigint);
select t.raises('driver cannot insert trips', $$insert into trips (company_id,route_id,departure_at,arrival_at,price,capacity) values (t.u(101),t.u(201),now(),now()+interval '1 hour',1,1)$$, '42501');
select t.eq('driver sees own notification only', t.rows('select 1 from notifications'), 1::bigint);

-- ===== SUSPENDED TENANT = FULL LOCKOUT (Q7) =====
select t.as_user(t.u(8));
select t.eq('suspended owner reads no routes', t.rows('select 1 from routes'), 0::bigint);
select t.eq('suspended owner reads no company row', t.rows('select 1 from my_company'), 0::bigint);
select t.eq('suspended owner reads no own membership', t.rows('select 1 from company_users'), 0::bigint);
select t.eq('my_company_status exposes only status', (select status from my_company_status() limit 1), 'suspended');
select t.raises('suspended owner cannot write', $$insert into routes (company_id,name,origin_name,destination_name) values (t.u(103),'x','x','x')$$, '42501');

-- ===== DB-LEVEL BOOKING / CONFLICT GUARANTEES (superuser, RLS off) =====
select t.as_admin();
select t.raises('seats_booked > capacity rejected', $$update trips set seats_booked = 41 where id = t.u(241)$$, '23514');
select t.eq('blocked_until = arrival + buffer(30)', (select blocked_until - arrival_at from trips where id = t.u(241)), interval '30 minutes');
select t.raises('bus overlap rejected', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) select company_id,route_id,bus_id,t.u(234),departure_at + interval '1 hour',arrival_at + interval '1 hour',1,10,'scheduled' from trips where id = t.u(241)$$, '23P01');
select t.raises('bus buffer enforced (starts 10 min after arrival)', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) select company_id,route_id,bus_id,t.u(234),arrival_at + interval '10 minutes',arrival_at + interval '2 hours',1,10,'scheduled' from trips where id = t.u(241)$$, '23P01');
select t.passes('bus free after buffer (starts 31 min after arrival)', $$insert into trips (id,company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) select t.u(245),company_id,route_id,bus_id,t.u(234),arrival_at + interval '31 minutes',arrival_at + interval '3 hours',1,10,'scheduled' from trips where id = t.u(241)$$);
select t.raises('driver overlap rejected (different bus)', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) select company_id,route_id,t.u(225),driver_id,departure_at,arrival_at,1,10,'scheduled' from trips where id = t.u(241)$$, '23P01');
select t.passes('cancelled trip does not block bus', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) select company_id,route_id,bus_id,t.u(234),departure_at,arrival_at,1,10,'cancelled' from trips where id = t.u(241)$$);
select t.raises('scheduled trip needs bus+driver', $$update trips set bus_id = null where id = t.u(241)$$, '23514');
select t.passes('draft trip may have no bus', $$insert into trips (company_id,route_id,departure_at,arrival_at,price,capacity,status) values (t.u(101),t.u(201),now()+interval '50 day',now()+interval '50 day 1 hour',1,10,'draft')$$);
select t.raises('inactive bus not assignable', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) values (t.u(101),t.u(201),t.u(223),t.u(234),now()+interval '60 day',now()+interval '60 day 1 hour',1,10,'scheduled')$$, '23514');
select t.raises('trip capacity > bus capacity rejected', $$insert into trips (company_id,route_id,bus_id,driver_id,departure_at,arrival_at,price,capacity,status) values (t.u(101),t.u(201),t.u(225),t.u(234),now()+interval '61 day',now()+interval '61 day 1 hour',1,41,'scheduled')$$, '23514');
select t.raises('booking stop must belong to trip route', $$insert into bookings (company_id,reference,trip_id,customer_id,pickup_stop_id,seats_count,unit_price,total_amount,currency,status,source) values (t.u(101),'MB-S',t.u(241),t.u(251),t.u(212),1,1,1,'EGP','pending','staff')$$, '23514');
select t.raises('booking total must equal price*seats', $$insert into bookings (company_id,reference,trip_id,customer_id,seats_count,unit_price,total_amount,currency,status,source) values (t.u(101),'MB-T',t.u(241),t.u(251),2,50,99,'EGP','pending','staff')$$, '23514');
select t.raises('customer phone unique per company', $$insert into customers (company_id,full_name,phone) values (t.u(101),'Dup','+201111111111')$$, '23505');
select t.passes('same phone allowed in another company', $$insert into customers (company_id,full_name,phone) values (t.u(102),'Same phone','+201111111111')$$);
select t.raises('trips: duplicate template generation rejected', $$with tp as (insert into trip_templates (id,company_id,name,route_id,departure_time,duration_minutes,days_of_week,start_date,price,capacity) values (t.u(281),t.u(101),'tpl',t.u(201),'07:30',90,'{1,2}',current_date,10,10) returning id) insert into trips (company_id,route_id,template_id,departure_at,arrival_at,price,capacity,status) select t.u(101),t.u(201),id,now()+interval '70 day',now()+interval '70 day 1 hour',1,10,'draft' from tp union all select t.u(101),t.u(201),id,now()+interval '70 day',now()+interval '70 day 1 hour',1,10,'draft' from tp$$, '23505');

-- ===== CLIENT CANNOT TOUCH PROTECTED TRIP COLUMNS =====
select t.as_user(t.u(2));
select t.raises('client cannot set seats_booked', $$update trips set seats_booked = 1 where id = t.u(241)$$, '42501');
select t.raises('client cannot set blocked_until', $$update trips set blocked_until = now() where id = t.u(241)$$, '42501');
select t.raises('client cannot insert seats_booked', $$insert into trips (company_id,route_id,departure_at,arrival_at,price,capacity,seats_booked) values (t.u(101),t.u(201),now(),now()+interval '1 hour',1,10,5)$$, '42501');
select t.passes('client can insert valid draft trip', $$insert into trips (company_id,route_id,departure_at,arrival_at,price,capacity) values (t.u(101),t.u(201),now()+interval '80 day',now()+interval '80 day 1 hour',1,10)$$);
select t.eq('created_by forced to caller', (select created_by from trips where departure_at > now() + interval '79 day' limit 1), t.u(2));

-- ===== SUBSCRIPTION LIMITS =====
select t.as_user(t.u(7));   -- owner B, starter: max_buses 5, has 1
select t.passes('B can add buses up to limit', $$insert into buses (company_id,plate_number,capacity) select t.u(102),'B-' || g,10 from generate_series(2,5) g$$);
select t.raises('B 6th bus blocked by plan limit', $$insert into buses (company_id,plate_number,capacity) values (t.u(102),'B-6',10)$$, '53400');
select t.as_admin();
insert into auth.users (id, email) select t.u(n), 'u' || n || '@test.dev' from generate_series(11,13) n;
select t.passes('B adds users up to max_users (starter=3)', $$insert into company_users (company_id,user_id,role_id) select t.u(102), t.u(n), (select id from roles where key='manager') from generate_series(11,12) n$$);
select t.raises('B 4th user blocked by plan limit', $$insert into company_users (company_id,user_id,role_id) select t.u(102), t.u(13), id from roles where key='manager'$$, '53400');
select t.eq('entitlement_limit returns plan value (professional buses)', app_private.entitlement_limit(t.u(101),'max_buses'), 20);
update subscriptions set status = 'cancelled' where company_id = t.u(102);
select t.raises('no live subscription => cannot create buses', $$insert into buses (company_id,plate_number,capacity) values (t.u(102),'B-X',10)$$, '42501');
update subscriptions set status = 'active' where company_id = t.u(102);

-- ===== INVARIANTS =====
select t.raises('company must keep one owner (demote)', $$update company_users set role_id = (select id from roles where key='manager') where user_id = t.u(2)$$, '23514');
select t.raises('company must keep one owner (delete)', $$delete from company_users where user_id = t.u(2)$$, '23514');
select t.raises('one company per user (Q8)', $$insert into company_users (company_id,user_id,role_id) select t.u(103), t.u(2), id from roles where key='manager'$$, '23505');
select t.passes('audit writer works', $$select app_private.write_audit('system', t.u(101), 'test.event', 'test')$$);
select t.raises('audit_logs update blocked even for superuser', $$update audit_logs set action = 'x'$$, '42501');
select t.raises('audit_logs delete blocked', $$delete from audit_logs$$, '42501');
select t.raises('slug uppercase rejected', $$insert into companies (name,slug) values ('x','Bad-Slug')$$, '23514');
select t.raises('slug reserved word rejected', $$insert into companies (name,slug) values ('x','admin')$$, '23514');
select t.raises('hostname uppercase rejected', $$insert into domains (company_id,hostname,kind) values (t.u(101),'UPPER.test','custom')$$, '23514');
select t.raises('entitlement type mismatch rejected', $$insert into plan_entitlements (plan_id,key,bool_value) select id,'max_users',true from plans where code='starter' on conflict (plan_id,key) do update set bool_value = true, int_value = null$$, '23514');

-- ===== ANON (public) =====
select t.as_anon();
select t.raises('anon cannot read routes', 'select 1 from routes', '42501');
select t.raises('anon cannot read trips', 'select 1 from trips', '42501');
select t.raises('anon cannot read bookings', 'select 1 from bookings', '42501');
select t.raises('anon cannot read companies', 'select 1 from companies', '42501');
select t.raises('anon cannot read domains', 'select 1 from domains', '42501');
select t.eq('anon sees current publication of active+verified A only', (select array_agg(company_id order by company_id) from website_publications), array[t.u(101)]);
select t.eq('anon sees no non-public plans', t.rows('select 1 from plans'), 0::bigint);
select t.eq('resolve_tenant: verified active host', (select company_id from resolve_tenant('A.TEST')), t.u(101));
select t.eq('resolve_tenant: unverified host hidden', t.rows($$select 1 from resolve_tenant('b.test')$$), 0::bigint);
select t.eq('resolve_tenant: suspended company hidden', t.rows($$select 1 from resolve_tenant('c.test')$$), 0::bigint);
select t.raises('anon cannot call my_company_status', 'select * from my_company_status()', '42501');
select t.raises('anon cannot call private helpers directly', $$select app_private.write_audit('system', null, 'a', 'b')$$, '42501');

-- ===== PLATFORM STAFF =====
select t.as_user(t.u(1));
select t.eq('super_admin reads all 3 companies', t.rows('select 1 from companies'), 3::bigint);
select t.eq('super_admin reads suspension_reason', (select suspension_reason from companies where id = t.u(103)), 'secret internal reason');
select t.eq('super_admin reads company_notes', t.rows('select 1 from company_notes'), 1::bigint);
select t.eq('super_admin reads suspended company data', t.rows('select 1 from routes where company_id = t.u(103)'), 1::bigint);
select t.passes('super_admin can suspend company', $$update companies set status = 'suspended', suspended_at = now(), suspension_reason = 'test' where id = t.u(102)$$);
select t.as_user(t.u(7));
select t.eq('B owner sees nothing after suspension', t.rows('select 1 from routes'), 0::bigint);
select t.as_user(t.u(1));
select t.passes('super_admin can reactivate', $$update companies set status = 'active', suspended_at = null where id = t.u(102)$$);
select t.raises('super_admin cannot hard-delete companies', 'delete from companies where id = t.u(101)', '42501');
select t.as_user(t.u(9));   -- support
select t.eq('support reads companies', t.rows('select 1 from companies'), 3::bigint);
select t.eq('support cannot update companies', t.affected($$update companies set name = 'x' where id = t.u(101)$$), 0::bigint);
select t.passes('support can add internal note', $$insert into company_notes (company_id, author_id, body) values (t.u(101), t.u(9), 'support note')$$);
select t.as_user(t.u(10));  -- billing
select t.passes('billing role can write invoices', $$insert into invoices (company_id,invoice_number,status,currency,subtotal,total) values (t.u(101),'INV-9','open','EGP',10,10)$$);
select t.eq('billing role cannot update companies', t.affected($$update companies set name = 'x' where id = t.u(101)$$), 0::bigint);
select t.as_user(t.u(2));
select t.eq('tenant cannot read platform_users', t.rows('select 1 from platform_users'), 0::bigint);
select t.eq('tenant sees own plan, not other non-public plans', (select array_agg(code order by code) from plans), array['professional']);
select t.as_admin();
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;
select id, name, detail from t.results where not ok order by id;