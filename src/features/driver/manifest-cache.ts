import type { ManifestPassenger } from './driverScreensApi';

/**
 * Offline copy of the passenger list of ONE trip (P7b D, plan "cached read-only manifest for the current trip").
 * Why here and not in the service worker: the list holds passenger names. It must be (1) per user, (2) one trip, (3) short-lived, (4) wiped on sign-out.
 * A worker cache is shared by everyone who uses the browser profile and survives sign-out; this store is not.
 *   - one entry only: saving a trip replaces the previous one
 *   - bound to the signed-in user id; another user never reads it
 *   - 12 hours, then ignored and removed (a clock set in the future is rejected too)
 *   - only the fields the manifest screen draws are kept (no phone/email/price exist in the RPC anyway)
 *   - every storage call can throw (private mode, quota): all failures mean "no copy", never an error on screen
 */
export const MANIFEST_CACHE_KEY = 'malaky-driver-manifest-v1';
export const MANIFEST_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export type CachedTripHeader = { origin_name: string; destination_name: string; departure_at: string; arrival_at: string; status: string };
export interface CachedManifest { tripId: string; userId: string; savedAt: string; trip: CachedTripHeader | null; rows: ManifestPassenger[] }
export type CacheStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStore(): CacheStore | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strOrNull = (v: unknown): string | null => (isStr(v) ? v : null);

function cleanRow(r: unknown): ManifestPassenger | null {
  if (typeof r !== 'object' || r === null) return null;
  const o = r as Record<string, unknown>;
  if (!isStr(o.booking_id) || !isStr(o.reference) || !isStr(o.passenger_name) || !isNum(o.seats) || !isNum(o.seats_boarded) || typeof o.is_subscriber !== 'boolean') return null;
  return { booking_id: o.booking_id, reference: o.reference, passenger_name: o.passenger_name, seats: o.seats, seats_boarded: o.seats_boarded, is_subscriber: o.is_subscriber, pickup_stop: strOrNull(o.pickup_stop), dropoff_stop: strOrNull(o.dropoff_stop) };
}
function cleanHeader(h: unknown): CachedTripHeader | null {
  if (typeof h !== 'object' || h === null) return null;
  const o = h as Record<string, unknown>;
  return isStr(o.origin_name) && isStr(o.destination_name) && isStr(o.departure_at) && isStr(o.arrival_at) && isStr(o.status)
    ? { origin_name: o.origin_name, destination_name: o.destination_name, departure_at: o.departure_at, arrival_at: o.arrival_at, status: o.status } : null;
}

export function clearManifest(store: CacheStore | null): void {
  try { store?.removeItem(MANIFEST_CACHE_KEY); } catch { /* nothing to clear */ }
}

export function saveManifest(store: CacheStore | null, e: { tripId: string; userId: string; trip: CachedTripHeader | null; rows: readonly ManifestPassenger[] }, now: number = Date.now()): void {
  if (!store || !e.tripId || !e.userId) return;
  const rows = e.rows.map(cleanRow).filter((r): r is ManifestPassenger => r !== null);
  const entry: CachedManifest = { tripId: e.tripId, userId: e.userId, savedAt: new Date(now).toISOString(), trip: cleanHeader(e.trip), rows };
  try { store.setItem(MANIFEST_CACHE_KEY, JSON.stringify(entry)); } catch { clearManifest(store); }
}

export function loadManifest(store: CacheStore | null, tripId: string, userId: string, now: number = Date.now()): CachedManifest | null {
  if (!store || !tripId || !userId) return null;
  let raw: string | null;
  try { raw = store.getItem(MANIFEST_CACHE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const saved = isStr(o.savedAt) ? Date.parse(o.savedAt) : NaN;
    const stale = !Number.isFinite(saved) || now - saved > MANIFEST_CACHE_MAX_AGE_MS || saved - now > CLOCK_SKEW_MS;
    if (stale || !Array.isArray(o.rows)) { clearManifest(store); return null; }
    if (o.tripId !== tripId || o.userId !== userId) return null;   // someone else's, or another trip: left alone, never shown
    return { tripId, userId, savedAt: o.savedAt as string, trip: cleanHeader(o.trip), rows: o.rows.map(cleanRow).filter((r): r is ManifestPassenger => r !== null) };
  } catch { clearManifest(store); return null; }
}
