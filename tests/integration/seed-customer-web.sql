-- Seed for customer-web.int.test.ts (run after reset-db.sh). Company A published, one open trip with 3 seats.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000081', 'web81@test.dev'),
  ('00000000-0000-4000-8000-000000000082', 'web82@test.dev'),
  ('00000000-0000-4000-8000-000000000083', 'web83@test.dev') on conflict do nothing;
insert into website_settings (company_id, is_published) values ('00000000-0000-4000-8000-000000000101', true)
  on conflict (company_id) do update set is_published = true;
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000234',
   now() + interval '50 day', now() + interval '50 day 2 hours', 40, 3, 'scheduled')
on conflict (id) do nothing;
