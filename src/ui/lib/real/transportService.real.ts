import type {
  Booking, Bus, CanonicalLocation, PassengerTicket, Company, MarketplaceSearchParams, MarketplaceTripItem, Route, Stop, Trip,
} from '../../types';
import {
  applyClientFilters, bookingFromDetail, companyFromRow, locationNameFromId, locationsFromRows, marketplaceItemFromRow,
  routeFromBookingDetail, routeFromRow, stopFromRow, tripFromBookingDetail, tripFromRow,
} from './adapters';
import type { BookingDetailRow, CustomerBackend, PublicStopRow, PublicTripRow } from './customerBackend';

type CreateBookingArgs = {
  tripId: string; passengerName: string; passengerPhone: string; passengerCount: number; studentId?: string;
  pickupStopId?: string; dropoffStopId?: string; idempotencyKey?: string; email?: string;
  // Accepted for call-site compatibility and deliberately IGNORED: companyId, customerId, fareEgp, status,
  // passengerNames. The server derives tenant, customer and price; per-passenger tickets are the next step.
  [ignored: string]: unknown;
};

/**
 * Real-backend implementation of the subset of the transport API that is wired to PostgreSQL.
 * Everything else is intentionally absent: the facade turns a missing method into NotIntegratedError.
 * The catalogue below is a CACHE of rows the database already returned to this user (public search, own bookings);
 * it is never seeded with mock data.
 */
export class RealTransportService {
  private companies = new Map<string, Company>();
  private routes = new Map<string, Route>();
  private stops = new Map<string, Stop>();
  private trips = new Map<string, Trip>();
  private rows = new Map<string, PublicTripRow>();
  private stopRows = new Map<string, PublicStopRow[]>();

  constructor(private readonly backend: CustomerBackend, private readonly toE164: (p: string) => string) {}

  private ingestPublic(rows: PublicTripRow[]): void {
    for (const r of rows) {
      this.rows.set(r.trip_id, r);
      this.companies.set(r.company_id, companyFromRow(r));
      this.routes.set(r.route_id, routeFromRow(r, this.stopRows.get(r.trip_id)));
      this.trips.set(r.trip_id, tripFromRow(r));
    }
  }
  private ingestBookings(details: BookingDetailRow[]): void {
    for (const d of details) {
      if (!this.companies.has(d.company_id)) {
        this.companies.set(d.company_id, companyFromRow({ company_id: d.company_id, company_name: d.company_name, company_slug: d.company_slug }));
      }
      // never overwrite a richer public row (capacity, price) with a booking-derived approximation
      if (!this.trips.has(d.trip_id)) {
        this.trips.set(d.trip_id, tripFromBookingDetail(d));
        this.routes.set(`detail:${d.trip_id}`, routeFromBookingDetail(d));
      }
    }
  }

  // ---- read: public catalogue ----
  async searchMarketplaceTrips(p: MarketplaceSearchParams = {}): Promise<MarketplaceTripItem[]> {
    const rows = await this.backend.searchTrips({
      origin: locationNameFromId(p.originLocationId), destination: locationNameFromId(p.destLocationId),
      date: p.date || undefined, companyId: p.companyId || undefined,
    });
    this.ingestPublic(rows);
    return applyClientFilters(rows.map(marketplaceItemFromRow), p);
  }
  async getCompanies(): Promise<Company[]> {
    if (this.companies.size === 0) this.ingestPublic(await this.backend.searchTrips({}));
    return [...this.companies.values()];
  }
  async getCompanyById(id: string): Promise<Company | undefined> { return (await this.getCompanies()).find((c) => c.id === id); }
  async getCanonicalLocations(): Promise<CanonicalLocation[]> {
    if (this.rows.size === 0) this.ingestPublic(await this.backend.searchTrips({}));
    return locationsFromRows([...this.rows.values()]);
  }
  async getCanonicalLocationById(id: string): Promise<CanonicalLocation | undefined> {
    return (await this.getCanonicalLocations()).find((l) => l.id === id);
  }
  async getTrips(companyId?: string): Promise<Trip[]> {
    return [...this.trips.values()].filter((t) => !companyId || t.companyId === companyId);
  }
  async getRoutes(companyId?: string): Promise<Route[]> {
    return [...this.routes.values()].filter((r) => !companyId || r.companyId === companyId);
  }
  async getStops(companyId?: string): Promise<Stop[]> {
    return [...this.stops.values()].filter((s) => !companyId || s.companyId === companyId);
  }
  /** Bus data is private to the company and deliberately not exposed to customers. */
  async getBuses(): Promise<Bus[]> { return []; }

  async getTripById(id: string): Promise<Trip | undefined> {
    if (!this.rows.has(id)) this.ingestPublic(await this.backend.searchTrips({}));
    const row = this.rows.get(id);
    if (!row) return this.trips.get(id);
    if (!this.stopRows.has(id)) {
      const s = await this.backend.tripStops(id);
      this.stopRows.set(id, s);
      for (const st of s) this.stops.set(st.stop_id, stopFromRow(st, row.company_id));
      this.routes.set(row.route_id, routeFromRow(row, s));
    }
    return this.trips.get(id);
  }

  // ---- write: through the booking RPCs only ----
  async createBooking(a: CreateBookingArgs): Promise<Booking> {
    const created = await this.backend.createBooking({
      tripId: a.tripId, seats: a.passengerCount || 1, fullName: a.passengerName.trim(),
      phoneE164: this.toE164(a.passengerPhone), email: a.email, studentId: a.studentId || undefined,
      pickupStopId: a.pickupStopId || undefined, dropoffStopId: a.dropoffStopId || undefined,
      idempotencyKey: a.idempotencyKey ?? crypto.randomUUID(),
    });
    const trip = this.trips.get(created.trip_id);
    if (trip) this.trips.set(trip.id, { ...trip, bookedSeats: Math.min(trip.totalSeats, trip.bookedSeats + (created.idempotent_replay ? 0 : created.seats_count)) });
    return {
      id: created.id, bookingReference: created.reference, companyId: trip?.companyId ?? '', tripId: created.trip_id,
      passengerName: a.passengerName.trim(), passengerPhone: a.passengerPhone.trim(), studentId: a.studentId,
      passengerCount: created.seats_count, fareEgp: Number(created.total_amount),
      status: created.status as Booking['status'], pickupStopId: a.pickupStopId ?? '', dropoffStopId: a.dropoffStopId ?? '',
      createdAt: new Date().toISOString(), qrTicketToken: '', passengers: [],
    };
  }

  async getCustomerBookings(_customerId: string): Promise<Booking[]> {
    const details = await this.backend.myBookings();
    this.ingestBookings(details);
    return details.map((d) => bookingFromDetail(d, _customerId));
  }
  async getCustomerStats(customerId: string): Promise<{ totalTrips: number; totalSpentEgp: number }> {
    const live = (await this.getCustomerBookings(customerId)).filter((b) => b.status !== 'cancelled');
    return { totalTrips: live.length, totalSpentEgp: live.reduce((s, b) => s + b.fareEgp, 0) };
  }
  /**
   * Boardable tickets of one of MY confirmed bookings. The database stores only a hash of each token, so a QR payload
   * cannot be looked up later: every call asks the server to issue a new one. Cancelled tickets are never returned.
   */
  async getBookingTickets(bookingId: string): Promise<PassengerTicket[]> {
    const rows = await this.backend.ticketQr(bookingId);
    return rows.map((r) => ({
      id: r.ticket_id, bookingId, ticketIndex: r.ticket_index, passengerName: '',
      status: r.status, qrOpaqueToken: r.qr_payload ?? '',
    }));
  }
  /** Customer cancellation is immediate inside the company's window (no staff approval step in the database). */
  async requestBookingCancellation(bookingId: string, reason: string): Promise<Booking> {
    await this.backend.cancelBooking(bookingId, reason);
    const d = (await this.backend.myBookings()).find((x) => x.id === bookingId);
    if (!d) throw new Error('booking not found');
    return bookingFromDetail(d, '');
  }
}
