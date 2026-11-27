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
