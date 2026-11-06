import type { Stop } from './types';
import type { StopDraft } from './validate';

/** Editor row: numbers are kept as the text the user typed so "" and "12." survive while typing. `uid` is client-only. */
export type StopRow = {
  uid: string;
  id: string | null;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  stopType: 'pickup' | 'dropoff' | 'both';
  offsetMinutes: string;
  isActive: boolean;
};

let counter = 0;
export const newUid = () => `n${++counter}`;

export const blankRow = (offsetMinutes = 0): StopRow => ({ uid: newUid(), id: null, name: '', address: '', latitude: '', longitude: '', stopType: 'both', offsetMinutes: String(offsetMinutes), isActive: true });

export const rowsFromStops = (stops: readonly Stop[]): StopRow[] =>
  [...stops].sort((a, b) => a.stopOrder - b.stopOrder).map((s) => ({
    uid: s.id, id: s.id, name: s.name, address: s.address ?? '', latitude: s.latitude === null ? '' : String(s.latitude), longitude: s.longitude === null ? '' : String(s.longitude),
    stopType: s.stopType, offsetMinutes: String(s.offsetMinutes), isActive: s.isActive,
  }));

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** Row -> what the service expects. A non-numeric coordinate becomes NaN on purpose, so validation reports it. */
export const toDraft = (r: StopRow): StopDraft => ({
  id: r.id, name: r.name, address: r.address.trim() === '' ? null : r.address, latitude: numOrNull(r.latitude), longitude: numOrNull(r.longitude),
  stopType: r.stopType, offsetMinutes: r.offsetMinutes.trim() === '' ? Number.NaN : Number(r.offsetMinutes), isActive: r.isActive,
});

/** The JSON the server action receives. NaN cannot cross JSON, so it is sent as null and the server rejects it too. */
export const serializeStops = (rows: readonly StopRow[]): string =>
  JSON.stringify(rows.map(toDraft).map((d) => ({ ...d, offsetMinutes: Number.isNaN(d.offsetMinutes) ? null : d.offsetMinutes, latitude: Number.isNaN(d.latitude ?? 0) ? null : d.latitude, longitude: Number.isNaN(d.longitude ?? 0) ? null : d.longitude })));

/** Returns a new array with row `from` moved to index `to` (no-op when out of range). */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return [...rows];
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** Changes whenever the saved list (ids, order, content) changes: the editor re-reads server data only then. */
export const fingerprint = (stops: readonly Stop[]): string => stops.map((s) => `${s.id}:${s.stopOrder}:${s.updatedAt}`).join('|');
