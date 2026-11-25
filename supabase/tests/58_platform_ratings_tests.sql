-- 58: platform moderation list (migration 0063). Needs 01 fixtures (companies A=101 / B=102, users 1 platform super_admin, 2 ownerA, 7 ownerB, 9 platform support).
-- Rating rows are inserted directly (as the superuser) with the aggregates kept the way 0061 keeps them, so this suite does not depend on suite 57's data.
select t.as_admin();
create or replace function t.err58(p text) returns text language plpgsql as $$ begin execute p; return 'NO ERROR'; exception when others then return sqlstate || '|' || sqlerrm; end $$;
create or replace function t.cnt58(p text) returns bigint language plpgsql security definer as $$ declare n bigint; begin execute p into n; return n; end $$;

-- fixtures: up to 3 existing bookings of company A and 1 of company B become rated (driver = any active driver of the same company)
insert into auth.users (id, email) select t.u(5800 + g), 'r58_' || g || '@test.dev' from generate_series(1, 4) g on conflict do nothing;
create or replace function t.seed58() returns integer language plpgsql security definer as $$
declare r record; n integer := 0; v_drv uuid;
begin
  for r in select x.id, x.company_id, x.trip_id, x.rn from (select b.id, b.company_id, b.trip_id, row_number() over (order by b.id) as rn from public.bookings b where b.company_id = t.u(101)) x where x.rn <= 3
           union all
           select y.id, y.company_id, y.trip_id, 4::bigint from (select b.id, b.company_id, b.trip_id from public.bookings b where b.company_id = t.u(102) order by b.id limit 1) y loop
    select d.id into v_drv from public.drivers d where d.company_id = r.company_id order by d.created_at limit 1;
    continue when v_drv is null;
    insert into public.trip_ratings (company_id, trip_id, booking_id, rater_user_id, driver_id, trip_stars, driver_stars, created_at)
    values (r.company_id, r.trip_id, r.id, t.u(5800 + r.rn::int), v_drv, 1 + (r.rn::int % 5), 5 - (r.rn::int % 5), now() - r.rn * interval '1 minute');
    perform app_private.rating_apply(r.company_id, v_drv, 1 + (r.rn::int % 5), 5 - (r.rn::int % 5), 1);
    n := n + 1;
  end loop;
  return n;
end $$;
select t.eq('setup: at least two rated bookings seeded from the fixtures', t.seed58() >= 2, true);

-- 1. who may call it -------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.eq('super_admin sees the seeded ratings', (select count(*) from public.platform_list_ratings()) >= 2, true);
select t.as_user(t.u(9));
select t.eq('platform support is refused (hiding is super_admin only, so is reading)', t.err58('select * from public.platform_list_ratings()') like '42501%', true);
select t.as_user(t.u(2));
select t.eq('a company owner is refused', t.err58('select * from public.platform_list_ratings()') like '42501%', true);
select t.as_user(t.u(5801));
select t.eq('a rider is refused', t.err58('select * from public.platform_list_ratings()') like '42501%', true);
select t.as_anon();
select t.eq('anon is refused', t.err58('select * from public.platform_list_ratings()') like '42501%', true);

-- 2. the rater is never exposed ----------------------------------------------------------------------------------------------------------------------
select t.eq('the result columns carry no rater, user, booking or customer', (select pg_get_function_result(p.oid) !~* '(rater|user_id|booking|customer)' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'platform_list_ratings'), true);

-- 3. filters and paging -------------------------------------------------------------------------------------------------------------------------------
select t.as_user(t.u(1));
select t.eq('company filter: only company A', (select count(*) from public.platform_list_ratings(t.u(101)) where company_id <> t.u(101)), 0::bigint);
select t.eq('company filter: company B shows only B', (select count(*) from public.platform_list_ratings(t.u(102)) where company_id <> t.u(102)), 0::bigint);
select t.eq('newest first', (select bool_and(created_at <= lag_c) from (select created_at, lag(created_at) over (order by ordinality) as lag_c from public.platform_list_ratings() with ordinality as f) x where lag_c is not null), true);
select t.eq('limit 1 returns one row', (select count(*) from public.platform_list_ratings(null, 'all', null, null, 1)), 1::bigint);
select t.eq('keyset: the page after the first row never repeats it', (select count(*) from public.platform_list_ratings(null, 'all', (select created_at from public.platform_list_ratings(null, 'all', null, null, 1)), (select rating_id from public.platform_list_ratings(null, 'all', null, null, 1)), 100)
                                                                where rating_id = (select rating_id from public.platform_list_ratings(null, 'all', null, null, 1))), 0::bigint);
select t.eq('a zero limit is clamped to 1', (select count(*) from public.platform_list_ratings(null, 'all', null, null, 0)), 1::bigint);
select t.eq('an absurd limit is clamped to 100 at most', (select count(*) from public.platform_list_ratings(null, 'all', null, null, 100000)) <= 100, true);
select t.eq('invalid visibility refused', t.err58($$select * from public.platform_list_ratings(null, 'everything')$$), '22023|invalid visibility');
select t.eq('null visibility refused', t.err58($$select * from public.platform_list_ratings(null, null)$$), '22023|invalid visibility');

-- 4. hide / restore through the list ------------------------------------------------------------------------------------------------------------------
create or replace function t.firstid58() returns uuid language sql security definer as $$ select id from public.trip_ratings where company_id = t.u(101) order by created_at desc, id desc limit 1 $$;
select t.passes('super_admin hides the newest rating of A', format($q$select public.set_trip_rating_hidden(%L, true)$q$, t.firstid58()));
select t.eq('hidden filter lists exactly it', (select count(*) from public.platform_list_ratings(t.u(101), 'hidden') where rating_id = t.firstid58()), 1::bigint);
select t.eq('visible filter no longer lists it', (select count(*) from public.platform_list_ratings(t.u(101), 'visible') where rating_id = t.firstid58()), 0::bigint);
select t.eq('all still lists it, with hidden_at set', (select count(*) from public.platform_list_ratings(t.u(101), 'all') where rating_id = t.firstid58() and hidden_at is not null), 1::bigint);
select t.passes('...and restores it', format($q$select public.set_trip_rating_hidden(%L, false)$q$, t.firstid58()));
select t.eq('hidden filter is empty again for A', (select count(*) from public.platform_list_ratings(t.u(101), 'hidden')), 0::bigint);
