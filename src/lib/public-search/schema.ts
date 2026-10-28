import { z } from 'zod';

/**
 * Input and output contracts for the anonymous public trip endpoints (/api/public/trips, /api/public/trips/:id/stops).
 * Input is STRICT: unknown, repeated or empty parameters are rejected, so a caller cannot widen the query or create
 * unlimited distinct cache keys with junk parameters (?x=1, ?x=2 ...). Output is an ALLOW-LIST: a column added to the RPC later
 * is not published until it is added here on purpose.
 */
export const MAX_LIMIT = 100; // = the RPC hard cap; the marketplace UI loads the whole catalogue in one call
export const MAX_OFFSET = 500;
export const MAX_TEXT = 60;

const calendarDate = (v: string): boolean => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const place = z.string().trim().min(1).max(MAX_TEXT).regex(/^[^\u0000-\u001f\u007f<>]+$/);
const digits = (max: number, min = 0) =>
  z.string().regex(/^\d{1,4}$/).transform(Number).refine((n) => n >= min && n <= max);

export const searchQuerySchema = z
  .object({
    origin: place.optional(),
    destination: place.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(calendarDate).optional(),
    companyId: z.uuid().optional(),
    limit: digits(MAX_LIMIT, 1).optional(),
    offset: digits(MAX_OFFSET).optional(),
  })
  .strict();
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Query string -> plain object. A repeated key is invalid (no parameter-pollution ambiguity). Returns null when invalid. */
export function queryObject(sp: URLSearchParams): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    if (all.length !== 1) return null;
    out[key] = all[0]!;
  }
  return out;
}

export const tripIdSchema = z.uuid();

const num = z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]);
export const publicTripRowSchema = z.object({
  trip_id: z.uuid(), company_id: z.uuid(), company_name: z.string(), company_slug: z.string(),
  route_id: z.uuid(), origin_name: z.string(), destination_name: z.string(),
  departure_at: z.string(), arrival_at: z.string(),
  price: num, currency: z.string(), capacity: z.number().int(), seats_available: z.number().int(),
  max_seats_per_booking: z.number().int(), timezone: z.string(),
});
export const publicStopRowSchema = z.object({
  stop_id: z.uuid(), name: z.string(), address: z.string().nullable(), stop_order: z.number().int(),
  stop_type: z.enum(['pickup', 'dropoff', 'both']), offset_minutes: z.number().int(),
});
