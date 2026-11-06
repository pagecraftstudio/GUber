/**
 * Pure validation of a whole ordered stop list. The rules are the ones save_route_stops() (migration 0024) enforces;
 * the database stays the authority. This module exists so the service (zod schema) and the editor UI give the SAME
 * answer before a round trip. No imports from server-only code: the browser uses it too.
 */
export type StopDraft = {
  id?: string | null;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  stopType?: 'pickup' | 'dropoff' | 'both';
  offsetMinutes: number;
  isActive?: boolean;
};

export const STOP_LIMITS = { min: 2, max: 200, nameMin: 2, nameMax: 120, addressMax: 300, offsetMax: 32767 } as const;

export const STOP_ISSUE_CODES = [
  'stops_min_two',
  'stops_too_many',
  'stop_name_invalid',
  'stop_name_duplicate',
  'stop_address_invalid',
  'stop_coords_invalid',
  'stop_offset_invalid',
  'stop_offset_order',
  'stops_min_two_active',
  'stops_need_pickup_and_dropoff',
] as const;
export type StopIssueCode = (typeof STOP_ISSUE_CODES)[number];

/** index === null: the problem belongs to the list as a whole. */
export type StopIssue = { index: number | null; field: 'list' | 'name' | 'address' | 'coords' | 'offsetMinutes' | 'stopType'; code: StopIssueCode };

export function validateStopList(stops: readonly StopDraft[]): StopIssue[] {
  const issues: StopIssue[] = [];
  if (stops.length < STOP_LIMITS.min) issues.push({ index: null, field: 'list', code: 'stops_min_two' });
  if (stops.length > STOP_LIMITS.max) issues.push({ index: null, field: 'list', code: 'stops_too_many' });

  const seen = new Set<string>();
  let prevOffset = 0;
  let active = 0;
  let pickup = 0;
  let dropoff = 0;
  let both = 0;
  stops.forEach((s, i) => {
    const name = s.name.trim();
    if (name.length < STOP_LIMITS.nameMin || name.length > STOP_LIMITS.nameMax) issues.push({ index: i, field: 'name', code: 'stop_name_invalid' });
    else if (seen.has(name.toLowerCase())) issues.push({ index: i, field: 'name', code: 'stop_name_duplicate' });
    seen.add(name.toLowerCase());
    if ((s.address ?? '').trim().length > STOP_LIMITS.addressMax) issues.push({ index: i, field: 'address', code: 'stop_address_invalid' });
    const lat = s.latitude ?? null;
    const lng = s.longitude ?? null;
    if (
      (lat === null) !== (lng === null) ||
      (lat !== null && lng !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180))
    )
      issues.push({ index: i, field: 'coords', code: 'stop_coords_invalid' });
    const off = s.offsetMinutes;
    if (!Number.isInteger(off) || off < 0 || off > STOP_LIMITS.offsetMax) issues.push({ index: i, field: 'offsetMinutes', code: 'stop_offset_invalid' });
    else {
      if (off < prevOffset) issues.push({ index: i, field: 'offsetMinutes', code: 'stop_offset_order' });
      prevOffset = off;
    }
    if (s.isActive ?? true) {
      active += 1;
      const type = s.stopType ?? 'both';
      if (type === 'pickup') pickup += 1;
      else if (type === 'dropoff') dropoff += 1;
      else both += 1;
    }
  });
  if (stops.length >= STOP_LIMITS.min && active < 2) issues.push({ index: null, field: 'list', code: 'stops_min_two_active' });
  else if (active >= 2 && !(pickup + both >= 1 && dropoff + both >= 1)) issues.push({ index: null, field: 'stopType', code: 'stops_need_pickup_and_dropoff' });
  return issues;
}
