import type { DriverTrip } from './driverApi';

/** Statuses of a trip that has not been finished or cancelled: the driver may still scan, and may end it. */
export const OPEN_TRIP_STATUSES: readonly string[] = ['scheduled', 'boarding', 'in_progress'];
export const isOpenTrip = (status: string): boolean => OPEN_TRIP_STATUSES.includes(status);

// Calendar day of an instant on THIS device (the phone's own zone, as every driver screen shows times). Plain Date arithmetic, no Intl.
const dayKey = (d: Date): number => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

export interface TripGroups { earlier: DriverTrip[]; today: DriverTrip[]; upcoming: DriverTrip[] }

/**
 * Today screen grouping. `earlier` is ONLY trips from a past day that are still open (forgotten to end: the driver must see them);
 * a finished or cancelled trip from a past day is not listed. Each group is ordered by departure.
 */
export function groupTrips(trips: readonly DriverTrip[], now: Date): TripGroups {
  const k = dayKey(now);
  const sorted = [...trips].sort((a, b) => new Date(a.departure_at).getTime() - new Date(b.departure_at).getTime());
  const g: TripGroups = { earlier: [], today: [], upcoming: [] };
  for (const t of sorted) {
    const d = dayKey(new Date(t.departure_at));
    if (d < k) { if (isOpenTrip(t.status)) g.earlier.push(t); }
    else if (d === k) g.today.push(t);
    else g.upcoming.push(t);
  }
  return g;
}
