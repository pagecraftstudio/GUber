-- Run AFTER seed-customer-web.sql on a throw-away database (bus_tix). Fixtures for tickets.int.test.ts.
-- Drivers (company A): user 91 = driver 961 (trip 981), user 92 = driver 962 (trip 982), user 93 = driver 963 (trip 983). Trips depart in 90 minutes:
-- inside the 2h boarding window, outside the 60 min web-booking cutoff, so customers can still book them over HTTP.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000091', 'drv91@test.dev'), ('00000000-0000-4000-8000-000000000092', 'drv92@test.dev'),
  ('00000000-0000-4000-8000-000000000093', 'drv93@test.dev'), ('00000000-0000-4000-8000-000000000084', 'web84@test.dev'), ('00000000-0000-4000-8000-000000000085', 'web85@test.dev') on conflict do nothing;
insert into company_users (company_id, user_id, role_id)
select '00000000-0000-4000-8000-000000000101', u.id, r.id from (values ('00000000-0000-4000-8000-000000000091'::uuid), ('00000000-0000-4000-8000-000000000092'), ('00000000-0000-4000-8000-000000000093')) u(id), roles r where r.key = 'driver';
insert into buses (id, company_id, plate_number, capacity) values
  ('00000000-0000-4000-8000-000000000971', '00000000-0000-4000-8000-000000000101', 'TIX-1', 20),
  ('00000000-0000-4000-8000-000000000972', '00000000-0000-4000-8000-000000000101', 'TIX-2', 20),
  ('00000000-0000-4000-8000-000000000973', '00000000-0000-4000-8000-000000000101', 'TIX-3', 20);
insert into drivers (id, company_id, user_id, full_name, phone) values
  ('00000000-0000-4000-8000-000000000961', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000091', 'TIX driver 1', '+201000019001'),
  ('00000000-0000-4000-8000-000000000962', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000092', 'TIX driver 2', '+201000019002'),
  ('00000000-0000-4000-8000-000000000963', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000093', 'TIX driver 3', '+201000019003');
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status)
select ('00000000-0000-4000-8000-000000000' || v.n)::uuid, '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
       ('00000000-0000-4000-8000-000000000' || v.bus)::uuid, ('00000000-0000-4000-8000-000000000' || v.drv)::uuid,
       now() + interval '90 minutes', now() + interval '210 minutes', 40, v.cap, 'scheduled'
from (values ('981', '971', '961', 20), ('982', '972', '962', 20), ('983', '973', '963', 20)) as v(n, bus, drv, cap);
