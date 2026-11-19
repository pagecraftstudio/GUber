export type PlanReportRow = { plan_id: string; plan_name: string; route_name: string; is_active: boolean; active_now: number; pending_now: number; new_in_range: number; revenue_in_range: number | string; currency: string | null };
export type DailyReportRow = { service_date: string; go_scans: number; return_scans: number; go_booked: number; return_booked: number; no_shows: number };
export type DemandRow = { trip_id: string; route_name: string; departure_at: string; capacity: number; seats_available: number; subscriber_seats: number; return_intent: number };

export type PlanReport = { planId: string; planName: string; routeName: string; isActive: boolean; activeNow: number; pendingNow: number; newInRange: number; revenue: number; currency: string };
export type DailyReport = { day: string; goScans: number; returnScans: number; goBooked: number; returnBooked: number; noShows: number };
export type TripDemand = { tripId: string; routeName: string; departureAt: string; capacity: number; seatsAvailable: number; subscriberSeats: number; returnIntent: number };

export const toPlanReport = (r: PlanReportRow): PlanReport => ({ planId: r.plan_id, planName: r.plan_name, routeName: r.route_name, isActive: r.is_active,
  activeNow: r.active_now, pendingNow: r.pending_now, newInRange: r.new_in_range, revenue: Number(r.revenue_in_range), currency: r.currency ?? 'EGP' });
export const toDailyReport = (r: DailyReportRow): DailyReport => ({ day: r.service_date, goScans: r.go_scans, returnScans: r.return_scans, goBooked: r.go_booked, returnBooked: r.return_booked, noShows: r.no_shows });
export const toTripDemand = (r: DemandRow): TripDemand => ({ tripId: r.trip_id, routeName: r.route_name, departureAt: r.departure_at, capacity: r.capacity,
  seatsAvailable: r.seats_available, subscriberSeats: r.subscriber_seats, returnIntent: r.return_intent });

/** Everything the report page shows, for one date range. */
export type SubscriptionReport = { from: string; to: string; plans: PlanReport[]; days: DailyReport[]; demand: TripDemand[] };
