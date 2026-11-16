export type RouteRow = {
  id: string;
  name: string;
  code: string | null;
  origin_name: string;
  destination_name: string;
  description: string | null;
  is_active: boolean;
  return_route_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Route = {
  id: string;
  name: string;
  code: string | null;
  originName: string;
  destinationName: string;
  description: string | null;
  isActive: boolean;
  /** The route used for the way back. Every route has one (migration 0033); the link is mutual. */
  returnRouteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export const ROUTE_SELECT = 'id,name,code,origin_name,destination_name,description,is_active,return_route_id,created_at,updated_at';

export const toRoute = (r: RouteRow): Route => ({
  id: r.id,
  name: r.name,
  code: r.code,
  originName: r.origin_name,
  destinationName: r.destination_name,
  description: r.description,
  isActive: r.is_active,
  returnRouteId: r.return_route_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
