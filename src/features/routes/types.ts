export type RouteRow = {
  id: string;
  name: string;
  code: string | null;
  origin_name: string;
  destination_name: string;
  description: string | null;
  is_active: boolean;
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
  createdAt: string;
  updatedAt: string;
};

export const ROUTE_SELECT = 'id,name,code,origin_name,destination_name,description,is_active,created_at,updated_at';

export const toRoute = (r: RouteRow): Route => ({
  id: r.id,
  name: r.name,
  code: r.code,
  originName: r.origin_name,
  destinationName: r.destination_name,
  description: r.description,
  isActive: r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
