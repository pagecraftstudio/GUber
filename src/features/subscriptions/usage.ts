/**
 * Pure reading of the my_plan_usage() answer (migration 0024). The database counts exactly like the enforce_limit
 * triggers do; nothing here re-implements which rows count or what a plan allows. Display only: Postgres still
 * refuses an over-limit insert whatever this says.
 */
export const USAGE_KEYS = ['max_users', 'max_buses', 'max_drivers', 'max_routes', 'max_trips_per_month'] as const;
export type UsageKey = (typeof USAGE_KEYS)[number];

export type PlanUsage =
  | { status: 'ok'; limits: Record<UsageKey, { limit: number | null; used: number }>; tripMonths: Record<string, number> }
  | { status: 'no_subscription' };

/** What a form needs. `unavailable` = we could not find out (never show invented numbers). */
export type Allowance =
  | { state: 'ok'; key: UsageKey; limit: number | null; used: number | null; remaining: number | null; reached: boolean }
  | { state: 'no_subscription' }
  | { state: 'unavailable' };

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

export function parsePlanUsage(raw: unknown): PlanUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.status === 'no_subscription') return { status: 'no_subscription' };
  if (r.status !== 'ok' || !r.limits || typeof r.limits !== 'object') return null;
  const limits = {} as Record<UsageKey, { limit: number | null; used: number }>;
  for (const key of USAGE_KEYS) {
    const e = (r.limits as Record<string, unknown>)[key] as { limit?: unknown; used?: unknown } | undefined;
    if (!e || !(e.limit === null || isCount(e.limit)) || !isCount(e.used)) return null; // malformed => unavailable, not guessed
    limits[key] = { limit: e.limit as number | null, used: e.used };
  }
  const tripMonths: Record<string, number> = {};
  if (r.trip_months && typeof r.trip_months === 'object')
    for (const [m, n] of Object.entries(r.trip_months as Record<string, unknown>)) if (/^\d{4}-\d{2}$/.test(m) && isCount(n)) tripMonths[m] = n;
  return { status: 'ok', limits, tripMonths };
}

/** `month` ('YYYY-MM') only matters for max_trips_per_month; a month outside the loaded window gives `used: null` (unknown, never blocks). */
export function allowanceFor(usage: PlanUsage | null, key: UsageKey, month?: string): Allowance {
  if (!usage) return { state: 'unavailable' };
  if (usage.status === 'no_subscription') return { state: 'no_subscription' };
  const { limit, used: usedNow } = usage.limits[key];
  const used = key === 'max_trips_per_month' && month ? (usage.tripMonths[month] ?? null) : usedNow;
  if (limit === null) return { state: 'ok', key, limit, used, remaining: null, reached: false };
  return { state: 'ok', key, limit, used, remaining: used === null ? null : Math.max(0, limit - used), reached: used !== null && used >= limit };
}

/** True when submitting cannot succeed and the form should say so instead of sending the request. */
export const blocksSubmit = (a: Allowance): boolean => (a.state === 'ok' && a.reached) || a.state === 'no_subscription';
