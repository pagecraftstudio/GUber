-- 0027: a bus or a driver cannot be on two overlapping trips, DRAFTS INCLUDED.
--
-- Until now the two exclusion constraints ignored drafts, so an overlap was only found when a draft was scheduled
-- (draft -> scheduled). Staff could therefore build two overlapping trips and be told "no" much later. From now on the
-- overlap is refused when the trip is CREATED or RE-ASSIGNED (insert/update), whatever its status, except 'cancelled'
-- (a cancelled trip no longer occupies the bus or the driver).
--
-- The window is unchanged: tstzrange(departure_at, blocked_until), blocked_until = arrival + the buffer already used
-- by the existing constraints. Still enforced by PostgreSQL (gist exclusion), so two concurrent requests cannot both win.
--
-- Existing data: if two non-cancelled trips already overlap on a bus or a driver the migration STOPS with the list
-- of offending trips instead of deleting or cancelling anything. Cancel or move one trip of each pair, then re-run.
--
-- ROLLBACK (restores the previous behaviour: drafts may overlap and are judged when scheduled)
--   alter table public.trips drop constraint trips_bus_no_overlap, drop constraint trips_driver_no_overlap;
--   alter table public.trips add constraint trips_bus_no_overlap exclude using gist (
--     bus_id with =, tstzrange(departure_at, blocked_until) with &&) where (bus_id is not null and status not in ('draft','cancelled'));
--   alter table public.trips add constraint trips_driver_no_overlap exclude using gist (
--     driver_id with =, tstzrange(departure_at, blocked_until) with &&) where (driver_id is not null and status not in ('draft','cancelled'));
set search_path = public, extensions;

do $$
declare v_bus int; v_driver int;
begin
  select count(*) into v_bus from public.trips a join public.trips b
    on a.id < b.id and a.bus_id = b.bus_id and tstzrange(a.departure_at, a.blocked_until) && tstzrange(b.departure_at, b.blocked_until)
   where a.bus_id is not null and a.status <> 'cancelled' and b.status <> 'cancelled';
  select count(*) into v_driver from public.trips a join public.trips b
    on a.id < b.id and a.driver_id = b.driver_id and tstzrange(a.departure_at, a.blocked_until) && tstzrange(b.departure_at, b.blocked_until)
   where a.driver_id is not null and a.status <> 'cancelled' and b.status <> 'cancelled';
  if v_bus > 0 or v_driver > 0 then
    raise exception '0027 blocked: % overlapping trip pair(s) on a bus and % on a driver already exist (drafts included). Cancel or move one trip of each pair, then re-run.', v_bus, v_driver
      using errcode = '23P01';
  end if;
end $$;

alter table public.trips drop constraint trips_bus_no_overlap;
alter table public.trips drop constraint trips_driver_no_overlap;

alter table public.trips add constraint trips_bus_no_overlap exclude using gist (
  bus_id with =, tstzrange(departure_at, blocked_until) with &&
) where (bus_id is not null and status <> 'cancelled');

alter table public.trips add constraint trips_driver_no_overlap exclude using gist (
  driver_id with =, tstzrange(departure_at, blocked_until) with &&
) where (driver_id is not null and status <> 'cancelled');
