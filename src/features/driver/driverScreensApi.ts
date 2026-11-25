import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Typed wrappers for the three driver RPCs of migration 0060 (trip manifest, end trip, my profile).
 * Nothing here sends a company id or a driver id: the database derives both from auth.uid(), and a trip id is only a TARGET that must be assigned to the caller.
 * Raw database messages are never shown; they are mapped to a code and the screen picks the words (driver-screens-text.ts).
 */
export interface ManifestPassenger {
  booking_id: string;
  reference: string;
  passenger_name: string;
  seats: number;
  seats_boarded: number;
  is_subscriber: boolean;
  pickup_stop: string | null;
  dropoff_stop: string | null;
}
export interface EndTripResult {
  trip_id: string;
  status: 'completed';
  ended_at: string | null;
  /** false when the trip was already completed (a repeat tap is a harmless no-op) */
  changed: boolean;
  expected?: number;
  boarded?: number;
  remaining?: number;
}
export interface DriverProfile {
  company_name: string | null;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  /** a calendar day, YYYY-MM-DD */
  license_expiry: string | null;
  license_days_left: number | null;
  photo_media_id: string | null;
  trips_completed: number;
  /** P7c: ratings from riders who boarded (0061). Absent on a database that predates 0061. */
  rating_count?: number;
  rating_average?: number | string | null;
  rating_distribution?: number[];
}

export type ScreenErrorCode = 'not_signed_in' | 'trip_not_found' | 'driver_not_found' | 'not_started' | 'cannot_end' | 'rate_limited' | 'network' | 'unknown';
export class ScreenError extends Error {
  constructor(readonly code: ScreenErrorCode) { super(code); this.name = 'ScreenError'; }
}

export function classifyScreenError(code: string | undefined, message: string): ScreenErrorCode {
  const m = message.toLowerCase();
  // a request that never reached the server has no database code (fetch failed, offline, dropped signal)
  if (!code && /failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(m)) return 'network';
  if (code === 'PT429') return 'rate_limited';
  if (code === '28000' || code === 'PGRST301' || (code === '42501' && (m.includes('permission') || m.includes('jwt')))) return 'not_signed_in';
  if (code === 'P0002') return m.includes('driver not found') ? 'driver_not_found' : 'trip_not_found';
  if (code === '23514') {
    if (m.includes('has not started')) return 'not_started';
    if (m.includes('cannot be ended')) return 'cannot_end';
  }
  return 'unknown';
}

async function call<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = (await client.rpc(fn, args)) as { data: T | null; error: { code?: string; message: string } | null };
  if (error) {
    // No failure telemetry yet: reportOperationFailure takes a closed list of operations (lib/log) that the server schema also pins. Adding driver.* there is a separate change.
    throw new ScreenError(classifyScreenError(error.code, error.message));
  }
  return data as T;
}

type RawPassenger = Omit<ManifestPassenger, 'seats' | 'seats_boarded'> & { seats: number | string; seats_boarded: number | string };

export function createDriverScreensApi(client: SupabaseClient) {
  return {
    /** The assigned driver's passenger list: name, seats, boarded count, subscriber marker, stops, booking reference. No phone, email, price or payment. */
    manifest: async (tripId: string): Promise<ManifestPassenger[]> => {
      const rows = (await call<RawPassenger[]>(client, 'driver_trip_manifest', { p_trip_id: tripId })) ?? [];
      // bigint counts can arrive as strings; the screen only ever sees numbers
      return rows.map((r) => ({ ...r, seats: Number(r.seats), seats_boarded: Number(r.seats_boarded) }));
    },
    /** Assigned driver only, once. The server decides every rule; the screen only reports the answer. */
    endTrip: (tripId: string) => call<EndTripResult>(client, 'driver_end_trip', { p_trip_id: tripId }),
    myProfile: () => call<DriverProfile>(client, 'driver_my_profile'),
  };
}
export type DriverScreensApi = ReturnType<typeof createDriverScreensApi>;

/** Licence expiry state for the profile warning. `daysLeft` is computed by the database in the company's time zone. */
export const LICENSE_WARN_DAYS = 30;
export type LicenseState = 'unknown' | 'expired' | 'soon' | 'ok';
export function licenseState(daysLeft: number | null | undefined): LicenseState {
  if (typeof daysLeft !== 'number' || !Number.isFinite(daysLeft)) return 'unknown';
  if (daysLeft < 0) return 'expired';
  return daysLeft <= LICENSE_WARN_DAYS ? 'soon' : 'ok';
}
