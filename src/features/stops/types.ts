export type StopType = 'pickup' | 'dropoff' | 'both';

export type StopRow = {
  id: string;
  route_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  stop_order: number;
  stop_type: StopType;
  offset_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Stop = {
  id: string;
  routeId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  stopOrder: number;
  stopType: StopType;
  offsetMinutes: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const STOP_SELECT =
  'id,route_id,name,address,latitude,longitude,stop_order,stop_type,offset_minutes,is_active,created_at,updated_at';

export const toStop = (r: StopRow): Stop => ({
  id: r.id,
  routeId: r.route_id,
  name: r.name,
  address: r.address,
  latitude: r.latitude,
  longitude: r.longitude,
  stopOrder: r.stop_order,
  stopType: r.stop_type,
  offsetMinutes: r.offset_minutes,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
