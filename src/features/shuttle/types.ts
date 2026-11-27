export type ShuttleDirection = 'forward' | 'backward';

export type ShuttleServiceRow = {
  id: string; route_id: string; name: string; outbound_direction: ShuttleDirection; allow_reverse: boolean;
  request_ttl_minutes: number; allow_walk_in: boolean; max_seats_per_request: number; hub_stop_id: string | null;
  is_active: boolean; created_at: string; updated_at: string;
};
export type ShuttleService = {
  id: string; routeId: string; name: string; outboundDirection: ShuttleDirection; allowReverse: boolean;
  requestTtlMinutes: number; allowWalkIn: boolean; maxSeatsPerRequest: number; hubStopId: string | null;
  isActive: boolean; updatedAt: string;
};
export const SERVICE_SELECT =
  'id, route_id, name, outbound_direction, allow_reverse, request_ttl_minutes, allow_walk_in, max_seats_per_request, hub_stop_id, is_active, created_at, updated_at';
export const toService = (r: ShuttleServiceRow): ShuttleService => ({
  id: r.id, routeId: r.route_id, name: r.name, outboundDirection: r.outbound_direction, allowReverse: r.allow_reverse,
  requestTtlMinutes: r.request_ttl_minutes, allowWalkIn: r.allow_walk_in, maxSeatsPerRequest: r.max_seats_per_request,
  hubStopId: r.hub_stop_id, isActive: r.is_active, updatedAt: r.updated_at,
});

export type ShuttleFareRow = { id: string; service_id: string; from_stop_id: string; to_stop_id: string; price: number | string };
export type ShuttleFare = { id: string; serviceId: string; fromStopId: string; toStopId: string; price: number };
export const FARE_SELECT = 'id, service_id, from_stop_id, to_stop_id, price';
export const toFare = (r: ShuttleFareRow): ShuttleFare => ({ id: r.id, serviceId: r.service_id, fromStopId: r.from_stop_id, toStopId: r.to_stop_id, price: Number(r.price) });

// ---- S2: what shuttle_overview / shuttle_start_day return (jsonb, snake_case)
export type SessionState = 'ready' | 'loading' | 'in_transit' | 'arrived' | 'completed' | 'out_of_service';
export type OverviewSession = {
  id: string; state: SessionState; runId: string; runNo: number; direction: ShuttleDirection; capacity: number;
  busId: string; plate: string; driverId: string; driverName: string; stationPos: number; stationName: string;
};
export type DayStatus = 'open' | 'closed' | 'reconciled' | 'cancelled';
export type ShuttleOverview = {
  serviceDate: string;
  day: { id: string; status: DayStatus; openedAt: string; stations: { idx: number; stopId: string; name: string }[] } | null;
  sessions: OverviewSession[];
};
type Json = Record<string, unknown>;
export const toOverview = (raw: unknown): ShuttleOverview => {
  const r = (raw ?? {}) as Json;
  const d = r.day as Json | null;
  return {
    serviceDate: String(r.service_date ?? ''),
    day: d ? {
      id: String(d.id), status: d.status as DayStatus, openedAt: String(d.opened_at),
      stations: ((d.stations as Json[]) ?? []).map((s) => ({ idx: Number(s.idx), stopId: String(s.stop_id), name: String(s.name) })),
    } : null,
    sessions: ((r.sessions as Json[]) ?? []).map((s) => ({
      id: String(s.id), state: s.state as SessionState, runId: String(s.run_id), runNo: Number(s.run_no), direction: s.direction as ShuttleDirection,
      capacity: Number(s.capacity), busId: String(s.bus_id), plate: String(s.plate), driverId: String(s.driver_id), driverName: String(s.driver_name),
      stationPos: Number(s.station_pos), stationName: String(s.station_name ?? ''),
    })),
  };
};
export type StartDayResult = { dayId: string; replayed: boolean; sessionCount: number };
export const toStartResult = (raw: unknown): StartDayResult => {
  const r = (raw ?? {}) as Json;
  return { dayId: String(r.day_id), replayed: r.replayed === true, sessionCount: Array.isArray(r.sessions) ? r.sessions.length : 0 };
};
