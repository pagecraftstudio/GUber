/** DEVELOPMENT-ONLY mock data service (localStorage). Never reachable in production: see ../runtime.ts. */
import {
  CanonicalLocation,
  Company,
  Stop,
  Route,
  Bus,
  Driver,
  Trip,
  RecurringSchedule,
  Booking,
  PassengerTicket,
  Customer,
  SubscriptionPlan,
  CustomDomain,
  AuditLog,
  MarketplaceTripItem,
  MarketplaceSearchParams,
} from '../../types';
import {
  INITIAL_CANONICAL_LOCATIONS,
  INITIAL_COMPANIES,
  INITIAL_STOPS,
  INITIAL_ROUTES,
  INITIAL_BUSES,
  INITIAL_DRIVERS,
  INITIAL_TRIPS,
  INITIAL_RECURRING_SCHEDULES,
  INITIAL_BOOKINGS,
  INITIAL_CUSTOMERS,
  INITIAL_PLANS,
  INITIAL_DOMAINS,
  INITIAL_AUDIT_LOGS,
} from '../mockData';

const STORAGE_PREFIX = 'malaky_bus_';

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, val: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors in sandbox
  }
}

export class MockTransportService {
  private locations: CanonicalLocation[] = getStored('locations', INITIAL_CANONICAL_LOCATIONS);
  private companies: Company[] = getStored('companies', INITIAL_COMPANIES);
  private stops: Stop[] = getStored('stops', INITIAL_STOPS);
  private routes: Route[] = getStored('routes', INITIAL_ROUTES);
  private buses: Bus[] = getStored('buses', INITIAL_BUSES);
  private drivers: Driver[] = getStored('drivers', INITIAL_DRIVERS);
  private trips: Trip[] = getStored('trips', INITIAL_TRIPS);
  private recurringSchedules: RecurringSchedule[] = getStored('recurringSchedules', INITIAL_RECURRING_SCHEDULES);
  private bookings: Booking[] = getStored('bookings', INITIAL_BOOKINGS);
  private customers: Customer[] = getStored('customers', INITIAL_CUSTOMERS);
  private plans: SubscriptionPlan[] = getStored('plans', INITIAL_PLANS);
  private domains: CustomDomain[] = getStored('domains', INITIAL_DOMAINS);
  private auditLogs: AuditLog[] = getStored('auditLogs', INITIAL_AUDIT_LOGS);

  private async delay(ms = 80): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --- CANONICAL LOCATIONS ---
  async getCanonicalLocations(): Promise<CanonicalLocation[]> {
    await this.delay();
    return [...this.locations];
  }

  async getCanonicalLocationById(id: string): Promise<CanonicalLocation | undefined> {
    await this.delay();
    return this.locations.find((l) => l.id === id);
  }

  // --- COMPANIES ---
  async getCompanies(): Promise<Company[]> {
    await this.delay();
    return [...this.companies];
  }

  async getCompanyById(id: string): Promise<Company | undefined> {
    await this.delay();
    return this.companies.find((c) => c.id === id);
  }

  async updateCompany(id: string, updates: Partial<Company>): Promise<Company> {
    await this.delay();
    const idx = this.companies.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('Company not found');
    const existing = this.companies[idx];
    if (!existing) throw new Error('Company not found');
    const updated: Company = { ...existing, ...updates };
    this.companies[idx] = updated;
    setStored('companies', this.companies);
    return updated;
  }

  async updateWebsiteConfig(companyId: string, websiteConfig: Company['websiteConfig']): Promise<Company> {
    return this.updateCompany(companyId, { websiteConfig });
  }

  // --- STOPS & ROUTES ---
  async getStops(companyId?: string): Promise<Stop[]> {
    await this.delay();
    if (companyId) {
      return this.stops.filter((s) => s.companyId === companyId);
    }
    return [...this.stops];
  }

  async getRoutes(companyId?: string): Promise<Route[]> {
    await this.delay();
    if (companyId) {
      return this.routes.filter((r) => r.companyId === companyId);
    }
    return [...this.routes];
  }

  async createRoute(newRoute: Omit<Route, 'id'>): Promise<Route> {
    await this.delay();
    const route: Route = {
      ...newRoute,
      id: `route_${Date.now()}`,
    };
    this.routes.push(route);
    setStored('routes', this.routes);
    return route;
  }

  // --- BUSES & DRIVERS ---
  async getBuses(companyId?: string): Promise<Bus[]> {
    await this.delay();
    if (companyId) {
      return this.buses.filter((b) => b.companyId === companyId);
    }
    return [...this.buses];
  }

  async createBus(busData: Omit<Bus, 'id'>): Promise<Bus> {
    await this.delay();
    const bus: Bus = {
      ...busData,
      id: `bus_${Date.now()}`,
    };
    this.buses.push(bus);
    setStored('buses', this.buses);
    return bus;
  }

  async updateBusStatus(busId: string, status: Bus['status']): Promise<Bus> {
    await this.delay();
    const bus = this.buses.find((b) => b.id === busId);
    if (!bus) throw new Error('Bus not found');
    bus.status = status;
    setStored('buses', this.buses);
    return bus;
  }

  async getDrivers(companyId?: string): Promise<Driver[]> {
    await this.delay();
    if (companyId) {
      return this.drivers.filter((d) => d.companyId === companyId);
    }
    return [...this.drivers];
  }

  async createDriver(driverData: Omit<Driver, 'id' | 'rating'>): Promise<Driver> {
    await this.delay();
    const driver: Driver = {
      ...driverData,
      rating: 4.8,
      id: `drv_${Date.now()}`,
    };
    this.drivers.push(driver);
    setStored('drivers', this.drivers);
    return driver;
  }

  // --- TRIPS ---
  async getTrips(companyId?: string): Promise<Trip[]> {
    await this.delay();
    if (companyId) {
      return this.trips.filter((t) => t.companyId === companyId);
    }
    return [...this.trips];
  }

  async getTripById(id: string): Promise<Trip | undefined> {
    await this.delay();
    return this.trips.find((t) => t.id === id);
  }

  async createTrip(tripData: Omit<Trip, 'id' | 'bookedSeats'>): Promise<Trip> {
    await this.delay();
    const trip: Trip = {
      ...tripData,
      bookedSeats: 0,
      published: tripData.published ?? true,
      id: `trip_${Date.now()}`,
    };
    this.trips.unshift(trip);
    setStored('trips', this.trips);
    return trip;
  }

  async updateTripStatus(tripId: string, status: Trip['status']): Promise<Trip> {
    await this.delay();
    const trip = this.trips.find((t) => t.id === tripId);
    if (!trip) throw new Error('Trip not found');
    trip.status = status;
    setStored('trips', this.trips);
    return trip;
  }

  // --- MASTER MARKETPLACE DISCOVERY SERVICE ---
  async searchMarketplaceTrips(params: MarketplaceSearchParams = {}): Promise<MarketplaceTripItem[]> {
    await this.delay();

    // 1. Filter out unpublished trips, cancelled trips, and non-participating companies
    const participatingCompanies = this.companies.filter(
      (c) => c.status !== 'suspended' && c.marketplaceListed
    );
    const participatingCompanyIds = new Set(participatingCompanies.map((c) => c.id));

    const candidateTrips = this.trips.filter((t) => {
      // Must be published and participating
      if (!t.published) return false;
      if (!participatingCompanyIds.has(t.companyId)) return false;
      // Exclude cancelled trips from bookable discovery
      if (t.status === 'cancelled') return false;

      // Filter by company if requested
      if (params.companyId && t.companyId !== params.companyId) return false;

      // Filter by date if requested
      if (params.date && t.departureDate !== params.date) return false;

      return true;
    });

    // 2. Resolve matching routes
    const results: MarketplaceTripItem[] = [];

    for (const trip of candidateTrips) {
      const route = this.routes.find((r) => r.id === trip.routeId);
      if (!route || !route.active) continue;

      // Canonical Location Matching
      if (params.originLocationId && route.originLocationId !== params.originLocationId) {
        continue;
      }
      if (params.destLocationId && route.destLocationId !== params.destLocationId) {
        continue;
      }

      // Price filter
      if (params.maxPrice && trip.priceEgp > params.maxPrice) {
        continue;
      }

      // Time of day filter
      if (params.timeOfDay && params.timeOfDay !== 'all') {
        const hour = parseInt(trip.departureTime.split(':')[0] ?? '0', 10);
        if (params.timeOfDay === 'morning' && (hour < 5 || hour >= 12)) continue;
        if (params.timeOfDay === 'afternoon' && (hour < 12 || hour >= 17)) continue;
        if (params.timeOfDay === 'evening' && (hour < 17 || hour > 23)) continue;
      }

      const availableSeats = Math.max(0, trip.totalSeats - trip.bookedSeats);
      const isFullyBooked = availableSeats <= 0;

      // Minimum available capacity filter
      if (params.minAvailableSeats && availableSeats < params.minAvailableSeats) {
        continue;
      }

      const company = this.companies.find((c) => c.id === trip.companyId)!;
      const bus = this.buses.find((b) => b.id === trip.busId);
      const originLoc = this.locations.find((l) => l.id === route.originLocationId);
      const destLoc = this.locations.find((l) => l.id === route.destLocationId);
      const originStop = this.stops.find((s) => s.id === route.originStopId);
      const destStop = this.stops.find((s) => s.id === route.destStopId);

      // Sanitize response into public DTO (no internal driver national IDs or margin numbers)
      results.push({
        id: trip.id,
        companyId: company.id,
        companyNameEn: company.nameEn,
        companyNameAr: company.nameAr,
        companySlug: company.slug,
        companyLogoText: company.logoText,
        companyPrimaryColor: company.primaryColor,
        companyAccentColor: company.accentColor,
        companyRating: company.rating || 4.8,
        routeId: route.id,
        originLocationId: route.originLocationId,
        destLocationId: route.destLocationId,
        originLocationNameEn: originLoc?.nameEn || route.originCityEn,
        originLocationNameAr: originLoc?.nameAr || route.originCityAr,
        destLocationNameEn: destLoc?.nameEn || route.destCityEn,
        destLocationNameAr: destLoc?.nameAr || route.destCityAr,
        originStopNameEn: originStop?.nameEn || route.originCityEn,
        originStopNameAr: originStop?.nameAr || route.originCityAr,
        destStopNameEn: destStop?.nameEn || route.destCityEn,
        destStopNameAr: destStop?.nameAr || route.destCityAr,
        departureDate: trip.departureDate,
        departureTime: trip.departureTime,
        arrivalTime: trip.arrivalTime,
        durationMinutes: route.durationMinutes,
        priceEgp: trip.priceEgp,
        totalSeats: trip.totalSeats,
        bookedSeats: trip.bookedSeats,
        availableSeats,
        isFullyBooked,
        busModel: bus?.model || 'Air-Conditioned Coach',
        busFeatures: bus?.features || ['ac', 'wifi'],
        status: trip.status,
        published: trip.published,
      });
    }

    // 3. Sorting
    if (params.sortBy === 'price_asc') {
      results.sort((a, b) => a.priceEgp - b.priceEgp);
    } else if (params.sortBy === 'price_desc') {
      results.sort((a, b) => b.priceEgp - a.priceEgp);
    } else if (params.sortBy === 'time_desc') {
      results.sort((a, b) => b.departureTime.localeCompare(a.departureTime));
    } else {
      // Default: time_asc
      results.sort((a, b) => a.departureTime.localeCompare(b.departureTime));
    }

    return results;
  }

  // --- RECURRING SCHEDULES ---
  async getRecurringSchedules(companyId?: string): Promise<RecurringSchedule[]> {
    await this.delay();
    if (companyId) {
      return this.recurringSchedules.filter((s) => s.companyId === companyId);
    }
    return [...this.recurringSchedules];
  }

  async createRecurringSchedule(data: Omit<RecurringSchedule, 'id'>): Promise<RecurringSchedule> {
    await this.delay();
    const sched: RecurringSchedule = {
      ...data,
      id: `sched_${Date.now()}`,
    };
    this.recurringSchedules.push(sched);
    setStored('recurringSchedules', this.recurringSchedules);
    return sched;
  }

  // --- BOOKINGS & CAPACITY MANAGEMENT ---
  async getBookings(companyId?: string): Promise<Booking[]> {
    await this.delay();
    if (companyId) {
      return this.bookings.filter((b) => b.companyId === companyId);
    }
    return [...this.bookings];
  }

  async createBooking(
    bookingData: Omit<Booking, 'id' | 'bookingReference' | 'createdAt' | 'qrTicketToken' | 'passengers'> & {
      passengerNames?: string[];
      qrTicketToken?: string;
      passengers?: PassengerTicket[];
    }
  ): Promise<Booking> {
    await this.delay();
    const trip = this.trips.find((t) => t.id === bookingData.tripId);
    if (!trip) throw new Error('Trip not found');

    if (trip.status === 'cancelled') {
      throw new Error('Cannot book seats on a cancelled trip');
    }

    const requestedSeats = bookingData.passengerCount || 1;
    const availableSeats = trip.totalSeats - trip.bookedSeats;

    if (availableSeats < requestedSeats) {
      throw new Error(`Trip capacity exceeded. Only ${availableSeats} seat(s) remaining.`);
    }

    const refNum = Math.floor(1000 + Math.random() * 9000);
    const bookingId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    // Rule #2: Backend-generated cryptographically random opaque tokens (NO predictable IDs)
    const secureTokenEntropy = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const masterOpaqueToken = `malaky_sec_tk_${secureTokenEntropy}`;

    // Rule #4: Multi-passenger individual ticket model for duplicate-scan prevention
    const passengerNames = (bookingData as any).passengerNames as string[] | undefined;
    const passengers = Array.from({ length: requestedSeats }, (_, idx) => {
      const pName = passengerNames && passengerNames[idx] ? passengerNames[idx].trim() : (idx === 0 ? bookingData.passengerName : `${bookingData.passengerName} (Guest ${idx + 1})`);
      const ptEntropy = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      return {
        id: `pt_${Date.now()}_${idx + 1}`,
        bookingId,
        ticketIndex: idx + 1,
        passengerName: pName,
        phone: idx === 0 ? bookingData.passengerPhone : undefined,
        status: 'valid' as const,
        qrOpaqueToken: `malaky_sec_tk_p${idx + 1}_${ptEntropy}`,
      };
    });

    const booking: Booking = {
      ...bookingData,
      passengerCount: requestedSeats,
      id: bookingId,
      bookingReference: `GC-${new Date().getFullYear().toString().slice(-2)}${new Date().getMonth() + 1}-${refNum}`,
      createdAt: new Date().toISOString(),
      qrTicketToken: masterOpaqueToken,
      passengers,
      status: 'confirmed',
    };

    // Safely increment capacity
    trip.bookedSeats = Math.min(trip.totalSeats, trip.bookedSeats + requestedSeats);
    setStored('trips', this.trips);

    this.bookings.unshift(booking);
    setStored('bookings', this.bookings);
    return booking;
  }

  async updateBookingStatus(bookingId: string, status: Booking['status']): Promise<Booking> {
    await this.delay();
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    const prevStatus = booking.status;
    booking.status = status;

    const seats = booking.passengerCount || 1;
    const trip = this.trips.find((t) => t.id === booking.tripId);

    if (trip) {
      // Prevent duplicate capacity adjustments on repeated status calls
      if (prevStatus !== 'cancelled' && status === 'cancelled') {
        trip.bookedSeats = Math.max(0, trip.bookedSeats - seats);
        setStored('trips', this.trips);
      } else if (prevStatus === 'cancelled' && (status === 'confirmed' || status === 'boarded')) {
        trip.bookedSeats = Math.min(trip.totalSeats, trip.bookedSeats + seats);
        setStored('trips', this.trips);
      }
    }

    setStored('bookings', this.bookings);
    return booking;
  }

  // Correction #8: Clearly distinguish cancellation requests from confirmed cancellations
  async requestBookingCancellation(bookingId: string, reason: string): Promise<Booking> {
    await this.delay();
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    if (booking.status === 'cancelled') {
      throw new Error('Booking is already cancelled.');
    }
    if (booking.status === 'boarded') {
      throw new Error('Cannot cancel a trip that has already been boarded.');
    }

    booking.status = 'cancellation_requested';
    booking.cancellationReason = reason.trim();
    setStored('bookings', this.bookings);
    return booking;
  }

  async approveBookingCancellation(bookingId: string): Promise<Booking> {
    await this.delay();
    return this.updateBookingStatus(bookingId, 'cancelled');
  }

  async rejectBookingCancellation(bookingId: string): Promise<Booking> {
    await this.delay();
    const booking = this.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');
    booking.status = 'confirmed';
    setStored('bookings', this.bookings);
    return booking;
  }

  // Correction #6: Driver Scanner with Atomic Duplicate-Scan Protection & Authenticated Validation
  async verifyAndBoardPassengerTicket(params: {
    ticketToken: string;
    tripId?: string;
    operatorId?: string;
    driverId?: string;
  }): Promise<{ ticket: any; booking: Booking; message: string }> {
    await this.delay(120);

    const token = params.ticketToken.trim();
    if (!token) throw new Error('Please scan or enter a valid ticket token.');

    // Find the matching booking and passenger ticket
    let matchedBooking: Booking | undefined;
    let matchedTicket: any | undefined;

    for (const b of this.bookings) {
      // Check master token or individual passenger tokens
      if (b.qrTicketToken === token) {
        matchedBooking = b;
        matchedTicket = b.passengers?.[0] || {
          id: `pt_${b.id}_1`,
          bookingId: b.id,
          ticketIndex: 1,
          passengerName: b.passengerName,
          status: b.status === 'boarded' ? 'boarded' : 'valid',
          qrOpaqueToken: b.qrTicketToken,
        };
        break;
      }
      if (b.passengers) {
        const pt = b.passengers.find((p) => p.qrOpaqueToken === token);
        if (pt) {
          matchedBooking = b;
          matchedTicket = pt;
          break;
        }
      }
    }

    if (!matchedBooking || !matchedTicket) {
      throw new Error('Ticket not found. Invalid or unrecognized QR security token.');
    }

    // Verify company / operator authorization
    if (params.operatorId && matchedBooking.companyId !== params.operatorId) {
      throw new Error('Operator Mismatch: This ticket belongs to another bus company.');
    }

    // Verify trip assignment if tripId is provided
    if (params.tripId && matchedBooking.tripId !== params.tripId) {
      throw new Error('Trip Mismatch: This ticket is for a different scheduled departure.');
    }

    // Verify booking status
    if (matchedBooking.status === 'cancelled') {
      throw new Error('Validation Failed: This ticket was cancelled and is invalid for boarding.');
    }

    // Atomic Duplicate-Scan Protection
    if (matchedTicket.status === 'boarded') {
      throw new Error(
        `Atomic Duplicate Boarding Blocked! This passenger (${matchedTicket.passengerName}) was already boarded at ${
          matchedTicket.boardedAt ? new Date(matchedTicket.boardedAt).toLocaleTimeString() : 'an earlier checkpoint'
        }.`
      );
    }

    // Mark passenger ticket as boarded
    matchedTicket.status = 'boarded';
    matchedTicket.boardedAt = new Date().toISOString();

    // If all passengers on booking are boarded, mark booking as boarded
    const allBoarded = matchedBooking.passengers
      ? matchedBooking.passengers.every((p) => p.status === 'boarded')
      : true;

    if (allBoarded) {
      matchedBooking.status = 'boarded';
    }

    setStored('bookings', this.bookings);

    return {
      ticket: matchedTicket,
      booking: matchedBooking,
      message: `Boarding Approved: ${matchedTicket.passengerName} (Pass ${matchedTicket.ticketIndex}/${matchedBooking.passengerCount})`,
    };
  }

  // Customer Bookings Query & Authorized Stats (Correction #8)
  async getBookingTickets(bookingId: string): Promise<PassengerTicket[]> {
    const b = (await this.getBookings()).find((x) => x.id === bookingId);
    return b?.passengers ?? [];
  }
  async getCustomerBookings(customerId: string): Promise<Booking[]> {
    await this.delay();
    return this.bookings.filter((b) => b.customerId === customerId);
  }

  async getCustomerStats(customerId: string): Promise<{ totalTrips: number; totalSpentEgp: number }> {
    await this.delay();
    const customerBookings = this.bookings.filter(
      (b) => b.customerId === customerId && b.status !== 'cancelled'
    );
    const totalTrips = customerBookings.length;
    const totalSpentEgp = customerBookings.reduce((sum, b) => sum + b.fareEgp, 0);
    return { totalTrips, totalSpentEgp };
  }

  // Correction #5: Preserve separate draft and published website configurations
  async getPublishedWebsiteConfig(companyId: string): Promise<Company['websiteConfig']> {
    await this.delay();
    const company = this.companies.find((c) => c.id === companyId);
    if (!company) throw new Error('Company not found');
    return company.publishedWebsiteConfig || company.websiteConfig;
  }

  async saveDraftWebsiteConfig(companyId: string, draftConfig: Company['websiteConfig']): Promise<Company> {
    await this.delay();
    const company = this.companies.find((c) => c.id === companyId);
    if (!company) throw new Error('Company not found');
    company.draftWebsiteConfig = draftConfig;
    setStored('companies', this.companies);
    return company;
  }

  async publishWebsiteConfig(companyId: string): Promise<Company> {
    await this.delay();
    const company = this.companies.find((c) => c.id === companyId);
    if (!company) throw new Error('Company not found');
    if (!company.draftWebsiteConfig) {
      company.draftWebsiteConfig = company.websiteConfig;
    }
    company.publishedWebsiteConfig = { ...company.draftWebsiteConfig };
    company.websiteConfig = { ...company.draftWebsiteConfig }; // maintain backwards compatibility
    setStored('companies', this.companies);
    return company;
  }

  // --- CUSTOMERS ---
  async getCustomers(companyId?: string): Promise<Customer[]> {
    await this.delay();
    if (companyId) {
      return this.customers.filter((c) => c.companyId === companyId);
    }
    return [...this.customers];
  }

  // --- SUPER ADMIN ---
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    await this.delay();
    return [...this.plans];
  }

  async getCustomDomains(): Promise<CustomDomain[]> {
    await this.delay();
    return [...this.domains];
  }

  async addCustomDomain(domainData: Omit<CustomDomain, 'id' | 'status' | 'sslStatus' | 'cnameTarget' | 'createdAt'>): Promise<CustomDomain> {
    await this.delay();
    const domain: CustomDomain = {
      ...domainData,
      id: `dom_${Date.now()}`,
      status: 'pending',
      sslStatus: 'issuing',
      cnameTarget: 'cname.malakybus.com',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    this.domains.push(domain);
    setStored('domains', this.domains);
    return domain;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    await this.delay();
    return [...this.auditLogs];
  }

  async resetToDefaults(): Promise<void> {
    try {
      localStorage.clear();
    } catch {}
    this.locations = [...INITIAL_CANONICAL_LOCATIONS];
    this.companies = [...INITIAL_COMPANIES];
    this.stops = [...INITIAL_STOPS];
    this.routes = [...INITIAL_ROUTES];
    this.buses = [...INITIAL_BUSES];
    this.drivers = [...INITIAL_DRIVERS];
    this.trips = [...INITIAL_TRIPS];
    this.recurringSchedules = [...INITIAL_RECURRING_SCHEDULES];
    this.bookings = [...INITIAL_BOOKINGS];
    this.customers = [...INITIAL_CUSTOMERS];
    this.plans = [...INITIAL_PLANS];
    this.domains = [...INITIAL_DOMAINS];
    this.auditLogs = [...INITIAL_AUDIT_LOGS];
  }
}

/** Lazy for the same reason as the mock auth service: no localStorage seeding unless mock mode is active. */
let instance: MockTransportService | undefined;
export const getMockTransportService = (): MockTransportService => (instance ??= new MockTransportService());
