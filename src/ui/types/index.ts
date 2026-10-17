export interface CanonicalLocation {
  id: string;
  nameEn: string;
  nameAr: string;
  regionEn: string;
  regionAr: string;
  isUniversityHub?: boolean;
}

export interface Company {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  logoText: string;
  primaryColor: string;
  accentColor: string;
  phone: string;
  email: string;
  supportAddressEn: string;
  supportAddressAr: string;
  customDomain?: string;
  status: 'active' | 'trial' | 'suspended';
  planId: 'starter' | 'growth' | 'enterprise';
  createdAt: string;
  marketplaceListed: boolean;
  rating: number;
  websiteConfig: WebsiteConfig; // Backwards-compatible alias to published config
  publishedWebsiteConfig?: WebsiteConfig;
  draftWebsiteConfig?: WebsiteConfig;
}

export interface WebsiteConfig {
  heroTitleEn: string;
  heroTitleAr: string;
  heroSubtitleEn: string;
  heroSubtitleAr: string;
  heroNoticeEn: string;
  heroNoticeAr: string;
  announcementEn?: string;
  announcementAr?: string;
  faqs: Array<{
    id: string;
    qEn: string;
    qAr: string;
    aEn: string;
    aAr: string;
  }>;
  perks: Array<{
    id: string;
    icon: string;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
  }>;
}

export interface Stop {
  id: string;
  companyId: string;
  canonicalLocationId: string;
  nameEn: string;
  nameAr: string;
  cityEn: string;
  cityAr: string;
  landmarkEn: string;
  landmarkAr: string;
  isCampus: boolean;
}

export interface Route {
  id: string;
  companyId: string;
  originLocationId: string;
  destLocationId: string;
  originStopId: string;
  destStopId: string;
  originCityEn: string;
  originCityAr: string;
  destCityEn: string;
  destCityAr: string;
  distanceKm: number;
  durationMinutes: number;
  baseFareEgp: number;
  active: boolean;
}

export interface Bus {
  id: string;
  companyId: string;
  plateNumber: string;
  model: string;
  capacity: number;
  status: 'active' | 'maintenance' | 'idle';
  features: string[];
  year: number;
}

export interface Driver {
  id: string;
  companyId: string;
  fullNameEn: string;
  fullNameAr: string;
  phone: string;
  licenseNumber: string;
  rating: number;
  status: 'active' | 'on_trip' | 'off_duty';
}

export interface Trip {
  id: string;
  companyId: string;
  routeId: string;
  busId: string;
  driverId: string;
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  arrivalTime: string;   // HH:mm
  priceEgp: number;
  totalSeats: number;
  bookedSeats: number;
  status: 'scheduled' | 'boarding' | 'in_transit' | 'completed' | 'cancelled';
  published: boolean;
  recurringScheduleId?: string;
}

export interface RecurringSchedule {
  id: string;
  companyId: string;
  routeId: string;
  departureTime: string;
  daysOfWeek: number[];
  busId: string;
  driverId: string;
  active: boolean;
}

export interface PassengerTicket {
  id: string;
  bookingId: string;
  ticketIndex: number;
  passengerName: string;
  phone?: string;
  status: 'valid' | 'boarded' | 'cancelled';
  boardedAt?: string;
  qrOpaqueToken: string; // Cryptographically random opaque token (Rule #2)
  seatNumber?: number;
}

export interface Booking {
  id: string;
  bookingReference: string;
  companyId: string;
  customerId?: string; // Optional: linked if customer was authenticated; undefined for guest checkout
  tripId: string;
  passengerName: string;
  passengerPhone: string;
  studentId?: string;
  passengerCount: number;
  seatNumber?: number;
  fareEgp: number;
  status: 'confirmed' | 'pending' | 'boarded' | 'cancellation_requested' | 'cancelled' | 'completed' | 'no_show';
  pickupStopId: string;
  dropoffStopId: string;
  createdAt: string;
  qrTicketToken: string; // Master opaque cryptographically generated token
  passengers: PassengerTicket[]; // Individual passenger records for duplicate prevention (Rule #4)
  cancellationReason?: string;
  /** Real mode only: server-computed (my_booking_details.can_cancel). Undefined in mock mode. */
  canCancel?: boolean;
}

export * from './auth';
export * from './apiContracts';

export interface CustomerUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  studentId?: string;
  createdAt: string;
  avatarUrl?: string;
}

export interface Customer {
  id: string;
  companyId: string;
  fullName: string;
  phone: string;
  email: string;
  studentId?: string;
  totalTrips: number;
  totalSpentEgp: number;
  lastTripDate: string;
}

export interface SubscriptionPlan {
  id: 'starter' | 'growth' | 'enterprise';
  nameEn: string;
  nameAr: string;
  monthlyFeeEgp: number;
  maxBuses: number;
  maxRoutes: number;
  perBookingFeePercent: number;
  featuresEn: string[];
  featuresAr: string[];
}

export interface CustomDomain {
  id: string;
  companyId: string;
  domain: string;
  status: 'verified' | 'pending' | 'error';
  sslStatus: 'active' | 'issuing' | 'expired';
  cnameTarget: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  role: 'super_admin' | 'company_admin' | 'dispatcher';
  companyName: string;
  action: string;
  actionAr: string;
  target: string;
  timestamp: string;
}

// Marketplace aggregate query types
export interface MarketplaceTripItem {
  id: string;
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  companySlug: string;
  companyLogoText: string;
  companyPrimaryColor: string;
  companyAccentColor: string;
  companyRating: number;
  routeId: string;
  originLocationId: string;
  destLocationId: string;
  originLocationNameEn: string;
  originLocationNameAr: string;
  destLocationNameEn: string;
  destLocationNameAr: string;
  originStopNameEn: string;
  originStopNameAr: string;
  destStopNameEn: string;
  destStopNameAr: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  priceEgp: number;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  isFullyBooked: boolean;
  busModel: string;
  busFeatures: string[];
  status: Trip['status'];
  published: boolean;
}

export interface MarketplaceSearchParams {
  originLocationId?: string;
  destLocationId?: string;
  date?: string;
  companyId?: string;
  maxPrice?: number;
  timeOfDay?: 'all' | 'morning' | 'afternoon' | 'evening';
  minAvailableSeats?: number;
  sortBy?: 'time_asc' | 'time_desc' | 'price_asc' | 'price_desc';
}
