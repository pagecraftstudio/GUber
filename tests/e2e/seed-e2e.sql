-- Extra deterministic trips for the browser test (run after seed-customer-web.sql). Company A is published.
-- 804: departs in 4h (bookable, but INSIDE the 24h cancellation window).  802: draft (must never be listed).  803: inside booking cutoff (must not be listed).
insert into trips (id, company_id, route_id, bus_id, driver_id, departure_at, arrival_at, price, capacity, status) values
  ('00000000-0000-4000-8000-000000000804', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000234', now() + interval '5 hours', now() + interval '7 hours', 55, 5, 'scheduled'),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   '00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000232', now() + interval '30 minutes', now() + interval '150 minutes', 40, 5, 'scheduled')
on conflict (id) do nothing;
insert into trips (id, company_id, route_id, departure_at, arrival_at, price, capacity, status) values
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201',
   now() + interval '51 day', now() + interval '51 day 2 hours', 40, 3, 'draft')
on conflict (id) do nothing;
