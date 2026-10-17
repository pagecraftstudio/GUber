export type TripStatus = 'draft' | 'scheduled' | 'boarding' | 'in_progress' | 'completed' | 'cancelled';

type RouteEmbed = { id: string; name: string; origin_name: string; destination_name: string } | null;
type BusEmbed = { id: string; plate_number: string; capacity: number } | null;
type DriverEmbed = { id: string; full_name: string } | null;

export type TripRow = {
  id: string;
  route_id: string;
  bus_id: string | null;
  driver_id: string | null;
  departure_at: string;
  arrival_at: string;
  buffer_minutes: number;
  blocked_until: string;
  template_id: string | null;
  price: number;
  capacity: number;
  seats_booked: number;
  status: TripStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  route: RouteEmbed;
  bus: BusEmbed;
  driver: DriverEmbed;
};

export type Trip = {
  id: string;
  routeId: string;
  busId: string | null;
  driverId: string | null;
  departureAt: string;
  arrivalAt: string;
  /** arrival + company buffer. The bus/driver are considered busy until then. Set by the database. */
  blockedUntil: string;
  bufferMinutes: number;
  templateId: string | null;
  price: number;
  capacity: number;
  /** Maintained by the database only (booking RPCs, Phase 5/8). Never writable from here. */
  seatsBooked: number;
  /** capacity - seatsBooked. Derived, never stored. */
  seatsAvailable: number;
  status: TripStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Related names for list screens. null when the caller's role cannot read that table. */
  route: { id: string; name: string; originName: string; destinationName: string } | null;
  bus: { id: string; plateNumber: string; capacity: number } | null;
  driver: { id: string; fullName: string } | null;
};

export const TRIP_SELECT =
  'id,route_id,bus_id,driver_id,departure_at,arrival_at,buffer_minutes,blocked_until,template_id,price,capacity,seats_booked,status,notes,created_at,updated_at,route:routes(id,name,origin_name,destination_name),bus:buses(id,plate_number,capacity),driver:drivers(id,full_name)';

export const toTrip = (r: TripRow): Trip => ({
  id: r.id,
  routeId: r.route_id,
  busId: r.bus_id,
  driverId: r.driver_id,
  departureAt: r.departure_at,
  arrivalAt: r.arrival_at,
  blockedUntil: r.blocked_until,
  bufferMinutes: r.buffer_minutes,
  templateId: r.template_id,
  price: r.price,
  capacity: r.capacity,
  seatsBooked: r.seats_booked,
  seatsAvailable: r.capacity - r.seats_booked,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  route: r.route && { id: r.route.id, name: r.route.name, originName: r.route.origin_name, destinationName: r.route.destination_name },
  bus: r.bus && { id: r.bus.id, plateNumber: r.bus.plate_number, capacity: r.bus.capacity },
  driver: r.driver && { id: r.driver.id, fullName: r.driver.full_name },
});

export type TripTransitioned = { id: string; status: TripStatus; changed: boolean; bookingsCancelled: number };
