import type { Booking, CanonicalLocation, Company, MarketplaceSearchParams, MarketplaceTripItem, Route, Stop, Trip } from '../../types';
import type { BookingDetailRow, PublicStopRow, PublicTripRow } from './customerBackend';

/** Pure mapping DB rows -> UI types. No I/O, fully unit-tested. */

const LOC_PREFIX = 'loc:';
export const locationIdFromName = (name: string): string => LOC_PREFIX + name.trim().toLowerCase();
export const locationNameFromId = (id: string | undefined): string | undefined =>
  id && id.startsWith(LOC_PREFIX) ? id.slice(LOC_PREFIX.length) : undefined;

/** "01012345678" / "+20 101 234 5678" / "201012345678" -> "+201012345678"; anything else is passed through trimmed so the DB can reject it. */
export function toE164Egypt(input: string): string {
  const raw = input.replace(/[\s\-()]/g, '');
  if (/^\+\d{8,15}$/.test(raw)) return raw;
  if (/^00\d{8,15}$/.test(raw)) return '+' + raw.slice(2);
  if (/^0[0-9]{10}$/.test(raw)) return '+20' + raw.slice(1);
  if (/^20[0-9]{10}$/.test(raw)) return '+' + raw;
  return raw;
}

function zoned(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export function companyFromRow(r: Pick<PublicTripRow, 'company_id' | 'company_name' | 'company_slug'>): Company {
  return {
    id: r.company_id, slug: r.company_slug, nameEn: r.company_name, nameAr: r.company_name,
    taglineEn: '', taglineAr: '', logoText: initials(r.company_name),
    primaryColor: '#14243A', accentColor: '#3563E9', phone: '', email: '',
    supportAddressEn: '', supportAddressAr: '', status: 'active', planId: 'starter', createdAt: '',
    marketplaceListed: true, rating: 0,
    websiteConfig: { heroTitleEn: r.company_name, heroTitleAr: r.company_name, heroSubtitleEn: '', heroSubtitleAr: '', heroNoticeEn: '', heroNoticeAr: '', faqs: [], perks: [] },
  };
}

export function routeFromRow(r: PublicTripRow, stops: PublicStopRow[] = []): Route {
  const pickups = stops.filter((s) => s.stop_type !== 'dropoff');
  const dropoffs = stops.filter((s) => s.stop_type !== 'pickup');
  return {
    id: r.route_id, companyId: r.company_id,
    originLocationId: locationIdFromName(r.origin_name), destLocationId: locationIdFromName(r.destination_name),
    originStopId: pickups[0]?.stop_id ?? '', destStopId: dropoffs[dropoffs.length - 1]?.stop_id ?? '',
    originCityEn: r.origin_name, originCityAr: r.origin_name, destCityEn: r.destination_name, destCityAr: r.destination_name,
    distanceKm: 0, durationMinutes: Math.round((Date.parse(r.arrival_at) - Date.parse(r.departure_at)) / 60000),
    baseFareEgp: Number(r.price), active: true,
  };
}

export function stopFromRow(s: PublicStopRow, companyId: string): Stop {
  return {
    id: s.stop_id, companyId, canonicalLocationId: '', nameEn: s.name, nameAr: s.name,
    cityEn: '', cityAr: '', landmarkEn: s.address ?? '', landmarkAr: s.address ?? '', isCampus: false,
  };
}

export function locationsFromRows(rows: Array<Pick<PublicTripRow, 'origin_name' | 'destination_name'>>): CanonicalLocation[] {
  const names = new Set<string>();
  for (const r of rows) { names.add(r.origin_name.trim()); names.add(r.destination_name.trim()); }
  return [...names].sort().map((n) => ({ id: locationIdFromName(n), nameEn: n, nameAr: n, regionEn: '', regionAr: '' }));
}

export function tripFromRow(r: PublicTripRow): Trip {
  const dep = zoned(r.departure_at, r.timezone); const arr = zoned(r.arrival_at, r.timezone);
  return {
    id: r.trip_id, companyId: r.company_id, routeId: r.route_id, busId: '', driverId: '',
    departureDate: dep.date, departureTime: dep.time, arrivalTime: arr.time,
    priceEgp: Number(r.price), totalSeats: r.capacity, bookedSeats: r.capacity - r.seats_available,
    status: 'scheduled', published: true,
  };
}

export function marketplaceItemFromRow(r: PublicTripRow): MarketplaceTripItem {
  const t = tripFromRow(r); const c = companyFromRow(r);
  return {
    id: r.trip_id, companyId: r.company_id, companyNameEn: c.nameEn, companyNameAr: c.nameAr, companySlug: c.slug,
    companyLogoText: c.logoText, companyPrimaryColor: c.primaryColor, companyAccentColor: c.accentColor, companyRating: 0,
    routeId: r.route_id,
    originLocationId: locationIdFromName(r.origin_name), destLocationId: locationIdFromName(r.destination_name),
    originLocationNameEn: r.origin_name, originLocationNameAr: r.origin_name, destLocationNameEn: r.destination_name, destLocationNameAr: r.destination_name,
    originStopNameEn: r.origin_name, originStopNameAr: r.origin_name, destStopNameEn: r.destination_name, destStopNameAr: r.destination_name,
    departureDate: t.departureDate, departureTime: t.departureTime, arrivalTime: t.arrivalTime,
    durationMinutes: Math.round((Date.parse(r.arrival_at) - Date.parse(r.departure_at)) / 60000),
    priceEgp: t.priceEgp, totalSeats: r.capacity, bookedSeats: t.bookedSeats,
    availableSeats: r.seats_available, isFullyBooked: r.seats_available <= 0,
    busModel: '', busFeatures: [], status: 'scheduled', published: true,
  };
}

/** Filters the database cannot express (the RPC filters origin/destination/date/company itself). */
export function applyClientFilters(items: MarketplaceTripItem[], p: MarketplaceSearchParams): MarketplaceTripItem[] {
  const hour = (t: string) => Number(t.slice(0, 2));
  let out = items.filter((i) => {
    if (p.maxPrice !== undefined && i.priceEgp > p.maxPrice) return false;
    if (p.minAvailableSeats !== undefined && i.availableSeats < p.minAvailableSeats) return false;
    if (p.timeOfDay === 'morning' && !(hour(i.departureTime) < 12)) return false;
    if (p.timeOfDay === 'afternoon' && !(hour(i.departureTime) >= 12 && hour(i.departureTime) < 17)) return false;
    if (p.timeOfDay === 'evening' && !(hour(i.departureTime) >= 17)) return false;
    return true;
  });
  const key = (i: MarketplaceTripItem) => `${i.departureDate}T${i.departureTime}`;
  switch (p.sortBy) {
    case 'time_desc': out = [...out].sort((a, b) => key(b).localeCompare(key(a))); break;
    case 'price_asc': out = [...out].sort((a, b) => a.priceEgp - b.priceEgp); break;
    case 'price_desc': out = [...out].sort((a, b) => b.priceEgp - a.priceEgp); break;
    default: out = [...out].sort((a, b) => key(a).localeCompare(key(b)));
  }
  return out;
}

const UI_BOOKING_STATUS: Record<string, Booking['status']> = {
  pending: 'pending', confirmed: 'confirmed', cancelled: 'cancelled', completed: 'completed', no_show: 'no_show',
};

/** NOTE: passenger-level tickets and opaque QR tokens do not exist in the database yet (next step), so none are invented here. */
export function bookingFromDetail(d: BookingDetailRow, customerId: string): Booking {
  return {
    id: d.id, bookingReference: d.reference, companyId: d.company_id, customerId, tripId: d.trip_id,
    passengerName: '', passengerPhone: '', passengerCount: d.seats_count, fareEgp: Number(d.total_amount),
    status: UI_BOOKING_STATUS[d.status] ?? 'pending', pickupStopId: '', dropoffStopId: '',
    createdAt: d.created_at, qrTicketToken: '', passengers: [], canCancel: d.can_cancel,
  };
}

export function tripFromBookingDetail(d: BookingDetailRow, timeZone = 'Africa/Cairo'): Trip {
  const dep = zoned(d.departure_at, timeZone); const arr = zoned(d.arrival_at, timeZone);
  return {
    id: d.trip_id, companyId: d.company_id, routeId: `detail:${d.trip_id}`, busId: '', driverId: '',
    departureDate: dep.date, departureTime: dep.time, arrivalTime: arr.time,
    priceEgp: d.seats_count ? Number(d.total_amount) / d.seats_count : 0, totalSeats: 0, bookedSeats: 0,
    status: d.trip_status === 'in_progress' ? 'in_transit' : (d.trip_status as Trip['status']), published: true,
  };
}

export function routeFromBookingDetail(d: BookingDetailRow): Route {
  return {
    id: `detail:${d.trip_id}`, companyId: d.company_id,
    originLocationId: locationIdFromName(d.origin_name), destLocationId: locationIdFromName(d.destination_name),
    originStopId: '', destStopId: '', originCityEn: d.origin_name, originCityAr: d.origin_name,
    destCityEn: d.destination_name, destCityAr: d.destination_name, distanceKm: 0,
    durationMinutes: Math.round((Date.parse(d.arrival_at) - Date.parse(d.departure_at)) / 60000),
    baseFareEgp: d.seats_count ? Number(d.total_amount) / d.seats_count : 0, active: true,
  };
}
