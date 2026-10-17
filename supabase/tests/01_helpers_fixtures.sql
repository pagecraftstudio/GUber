-- SAFETY: these files create fake users/companies and change settings. They must NEVER run on a real Supabase project.
do $$ begin
  if to_regclass('auth.refresh_tokens') is not null or exists (select 1 from pg_extension where extname in ('supabase_vault','pg_graphql')) then
    raise exception 'REFUSING: this looks like a real Supabase project (GoTrue tables / Supabase extensions found). Run test suites only on a throw-away local Postgres (tests/integration/reset-db.sh).';
  end if;
end $$;
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
  $$ declare n bigint; begin execute 'select count(*) from (' || stmt || ') q' into n; return n; end $$;
create or replace function t.affected(stmt text) returns bigint language plpgsql as
  $$ declare n bigint; begin execute stmt; get diagnostics n = row_count; return n; end $$;
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

-- ---------------- fixtures (superuser, bypasses RLS; triggers still fire) ----------------
-- users: 1 platform super_admin, 2 ownerA, 3 managerA, 4 opsA, 5 bookingA, 6 driverA, 7 ownerB, 8 ownerC,
--        9 platform support, 10 platform billing
insert into auth.users (id, email) select t.u(n), 'u' || n || '@test.dev' from generate_series(1,10) n;
insert into platform_users (user_id, role) values (t.u(1),'super_admin'),(t.u(9),'support'),(t.u(10),'billing');

insert into companies (id, name, slug, status, suspended_at, suspension_reason) values
  (t.u(101),'Company A','company-a','active',null,null),
  (t.u(102),'Company B','company-b','active',null,null),
  (t.u(103),'Company C','company-c','suspended',now(),'secret internal reason');
insert into subscriptions (company_id, plan_id, status, billing_interval, current_period_start, current_period_end)
select c.id, p.id, 'active', 'monthly', now(), now() + interval '30 days'
from (values (t.u(101),'professional'),(t.u(102),'starter'),(t.u(103),'starter')) c(id, code)
join plans p on p.code = c.code;

insert into company_users (company_id, user_id, role_id)
select v.c, t.u(v.u), r.id from (values
  (t.u(101),2,'owner'),(t.u(101),3,'manager'),(t.u(101),4,'operations'),(t.u(101),5,'booking'),(t.u(101),6,'driver'),
  (t.u(102),7,'owner'),(t.u(103),8,'owner')) v(c,u,k) join roles r on r.key = v.k;

insert into domains (company_id, hostname, kind, is_primary, verification_status, verified_at) values
  (t.u(101),'a.test','platform_subdomain',true,'verified',now()),
  (t.u(102),'b.test','custom',true,'pending',null),
  (t.u(103),'c.test','platform_subdomain',true,'verified',now());

insert into routes (id, company_id, name, origin_name, destination_name) values
  (t.u(201),t.u(101),'A route 1','Fayoum','Cairo'),(t.u(202),t.u(101),'A route 2','Fayoum','Giza'),
  (t.u(203),t.u(102),'B route 1','Fayoum','Cairo'),(t.u(204),t.u(103),'C route 1','x','y');
insert into route_stops (id, company_id, route_id, name, stop_order, stop_type) values
  (t.u(211),t.u(101),t.u(201),'A stop 1',1,'both'),(t.u(212),t.u(101),t.u(202),'A stop 2',1,'both'),
  (t.u(213),t.u(102),t.u(203),'B stop 1',1,'both');
insert into buses (id, company_id, plate_number, capacity, status) values
  (t.u(221),t.u(101),'A-1',40,'active'),(t.u(222),t.u(101),'A-2',40,'active'),(t.u(223),t.u(101),'A-3',40,'inactive'),
  (t.u(224),t.u(102),'B-1',40,'active'),(t.u(225),t.u(101),'A-4',40,'active');
insert into drivers (id, company_id, user_id, full_name, phone) values
  (t.u(231),t.u(101),t.u(6),'Driver A1','+201000000001'),(t.u(232),t.u(101),null,'Driver A2','+201000000002'),
  (t.u(233),t.u(102),null,'Driver B1','+201000000003'),(t.u(234),t.u(101),null,'Driver A3','+201000000004');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(241),t.u(101),t.u(201),t.u(221),t.u(231), date_trunc('day', now()) + interval '1 day 8 hours', date_trunc('day', now()) + interval '1 day 10 hours', 50, 40, 'scheduled'),
  (t.u(242),t.u(101),t.u(202),t.u(222),t.u(232), date_trunc('day', now()) + interval '1 day 8 hours', date_trunc('day', now()) + interval '1 day 10 hours', 50, 40, 'scheduled'),
  (t.u(243),t.u(102),t.u(203),t.u(224),t.u(233), date_trunc('day', now()) + interval '1 day 8 hours', date_trunc('day', now()) + interval '1 day 10 hours', 50, 40, 'scheduled');
insert into trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  (t.u(244),t.u(101),t.u(201), date_trunc('day', now()) + interval '2 day 8 hours', date_trunc('day', now()) + interval '2 day 10 hours', 50, 40, 'draft');
insert into customers (id, company_id, full_name, phone, notes) values
  (t.u(251),t.u(101),'Cust A','+201111111111','staff note A'),(t.u(252),t.u(102),'Cust B','+201222222222','staff note B');
insert into bookings (id, company_id, reference, trip_id, customer_id, seats_count, unit_price, total_amount, currency, status, source) values
  (t.u(261),t.u(101),'MB-AAAAAA',t.u(241),t.u(251),2,50,100,'EGP','confirmed','staff'),
  (t.u(262),t.u(102),'MB-BBBBBB',t.u(243),t.u(252),1,50,50,'EGP','confirmed','staff');
insert into invoices (company_id, invoice_number, status, currency, subtotal, total) values
  (t.u(101),'INV-1','open','EGP',100,100),(t.u(102),'INV-2','open','EGP',100,100);
insert into company_notes (company_id, body) values (t.u(101),'internal note A');
insert into website_publications (company_id, version, snapshot, is_current) values
  (t.u(101),1,'{}',true),(t.u(102),1,'{}',true),(t.u(103),1,'{}',true);
insert into notifications (company_id, recipient_user_id, channel, body) values
  (t.u(101), t.u(6), 'in_app', 'hello driver'),(t.u(101), t.u(2), 'in_app', 'hello owner');
insert into media (id, company_id, kind, bucket, storage_path, original_filename, mime_type, size_bytes) values
  (t.u(271), t.u(102), 'logo', 'company-public', t.u(102)::text || '/logo.png', 'logo.png', 'image/png', 1000);
