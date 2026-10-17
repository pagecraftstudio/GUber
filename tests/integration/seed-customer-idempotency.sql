-- Run AFTER seed-customer-web.sql, on the bus_web database only (NOT on the browser-test DB: the portal lists a fixed number of cards).
-- Idempotency / cancellation integration fixtures (customer-idempotency.int.test.ts). All on a dedicated bus/driver, non-overlapping.
-- 811 cap 10 +80d | 812 cap 2 +82d | 813 cap 5 +30h (cancellable, window 24h) | 814 cap 5 +23h (inside window) | 815 cap 6 +84d | 816 cap 4 +86d
-- dedicated bus + driver: fixture trips sit at fixed clock times, so sharing their bus/driver would make these tests time-of-day dependent
insert into buses (id, company_id, plate_number, capacity) values ('00000000-0000-4000-8000-000000000929', '00000000-0000-4000-8000-000000000101', 'SEED-929', 20) on conflict (id) do nothing;
insert into drivers (id, company_id, full_name, phone) values ('00000000-0000-4000-8000-000000000939', '00000000-0000-4000-8000-000000000101', 'Seed driver 939', '+2010000939') on conflict (id) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000084', 'web84@test.dev'), ('00000000-0000-4000-8000-000000000085', 'web85@test.dev'),
  ('00000000-0000-4000-8000-000000000086', 'web86@test.dev'), ('00000000-0000-4000-8000-000000000087', 'web87@test.dev'),
  ('00000000-0000-4000-8000-000000000088', 'web88@test.dev'), ('00000000-0000-4000-8000-000000000089', 'web89@test.dev') on conflict do nothing;
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select ('00000000-0000-4000-8000-000000000' || v.n)::uuid, '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
       '00000000-0000-4000-8000-000000000929', '00000000-0000-4000-8000-000000000939',
       now() + v.dep, now() + v.dep + interval '2 hours', 40, v.cap, 'scheduled'
from (values ('811', interval '80 days', 10), ('812', interval '82 days', 2), ('813', interval '30 hours', 5),
             ('814', interval '23 hours', 5), ('815', interval '84 days', 6), ('816', interval '86 days', 4)) as v(n, dep, cap)
on conflict (id) do nothing;
