-- Extra deterministic trips for portal.mjs ONLY (kept out of seed-e2e.sql: the marketplace lists a fixed number of cards and flow.mjs
-- asserts every DB trip is on screen). Company A, window 24h, booking cutoff 60min. Dedicated bus/driver, non-overlapping.
-- 805 +30h cap 5 (cancellable) | 806 +60d cap 1 (over-capacity) | 807 +48h cap 5 (becomes in-window after we move it) | 808 +70d cap 5 (history)
-- dedicated bus + driver: fixture trips sit at fixed clock times, so sharing their bus/driver would make these tests time-of-day dependent
insert into buses (id, company_id, plate_number, capacity) values ('00000000-0000-4000-8000-000000000928', '00000000-0000-4000-8000-000000000101', 'SEED-928', 20) on conflict (id) do nothing;
insert into drivers (id, company_id, full_name, phone) values ('00000000-0000-4000-8000-000000000938', '00000000-0000-4000-8000-000000000101', 'Seed driver 938', '+2010000938') on conflict (id) do nothing;
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select ('00000000-0000-4000-8000-000000000' || v.n)::uuid, '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
       '00000000-0000-4000-8000-000000000928', '00000000-0000-4000-8000-000000000938', now() + v.dep, now() + v.dep + interval '2 hours', v.price, v.cap, 'scheduled'
from (values ('805', interval '30 hours', 45, 5), ('806', interval '60 days', 30, 1), ('807', interval '48 hours', 35, 5), ('808', interval '70 days', 25, 5)) as v(n, dep, price, cap)
on conflict (id) do nothing;
