export type TripTemplateRow = {
  id: string; name: string; route_id: string; bus_id: string | null; driver_id: string | null;
  departure_time: string; duration_minutes: number; days_of_week: number[]; start_date: string; end_date: string | null;
  price: number; capacity: number; is_active: boolean; generated_through: string | null;
  return_route_id: string | null; return_price: number | null; round_trip_price: number | null; return_times: string[]; return_day_offset: number;
  route: { id: string; name: string; origin_name: string; destination_name: string } | null;
  bus: { id: string; plate_number: string } | null;
  driver: { id: string; full_name: string } | null;
};

/** days: ISO weekday, 1 = Monday ... 7 = Sunday (same numbers as PostgreSQL isodow). */
export type TripTemplate = {
  id: string; name: string; routeId: string; busId: string | null; driverId: string | null;
  departureTime: string; durationMinutes: number; daysOfWeek: number[]; startDate: string; endDate: string | null;
  price: number; capacity: number; isActive: boolean; generatedThrough: string | null;
  /** Go-and-return: when returnTimes is not empty every outbound trip gets one return option per time. price = go only. */
  returnRouteId: string | null; returnPrice: number | null; roundTripPrice: number | null; returnTimes: string[]; returnDayOffset: number;
  route: { id: string; name: string; originName: string; destinationName: string } | null;
  bus: { id: string; plateNumber: string } | null;
  driver: { id: string; fullName: string } | null;
};

export const TEMPLATE_SELECT =
  'id,name,route_id,bus_id,driver_id,departure_time,duration_minutes,days_of_week,start_date,end_date,price,capacity,is_active,generated_through,return_route_id,return_price,round_trip_price,return_times,return_day_offset,route:routes(id,name,origin_name,destination_name),bus:buses(id,plate_number),driver:drivers(id,full_name)';

export const toTemplate = (r: TripTemplateRow): TripTemplate => ({
  id: r.id, name: r.name, routeId: r.route_id, busId: r.bus_id, driverId: r.driver_id,
  departureTime: r.departure_time.slice(0, 5), durationMinutes: r.duration_minutes,
  daysOfWeek: [...r.days_of_week].sort((a, b) => a - b), startDate: r.start_date, endDate: r.end_date,
  price: r.price, capacity: r.capacity, isActive: r.is_active, generatedThrough: r.generated_through,
  returnRouteId: r.return_route_id, returnPrice: r.return_price, roundTripPrice: r.round_trip_price,
  returnTimes: [...(r.return_times ?? [])].map((t) => t.slice(0, 5)).sort(), returnDayOffset: r.return_day_offset,
  route: r.route && { id: r.route.id, name: r.route.name, originName: r.route.origin_name, destinationName: r.route.destination_name },
  bus: r.bus && { id: r.bus.id, plateNumber: r.bus.plate_number },
  driver: r.driver && { id: r.driver.id, fullName: r.driver.full_name },
});

export type GenerateResult = { created: number; returnTripsCreated: number; alreadyExisted: number; conflicts: number; limitReached: boolean; through: string };
