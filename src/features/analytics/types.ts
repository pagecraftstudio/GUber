import { z } from 'zod';

export const analyticsQuerySchema = z.object({ days: z.enum(['7', '30', '90']).default('30').transform(Number) });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const exportQuerySchema = z.object({ kind: z.enum(['gaps', 'usage']), days: z.enum(['7', '30', '90']).default('30').transform(Number) });

const n = z.coerce.number();
export const overviewRowsSchema = z.array(z.object({ day: z.string(), page_views: n, visitor_days: n }));
export const usageRowsSchema = z.array(z.object({ surface: z.string(), event: z.string(), events: n, visitor_days: n }));
export const funnelRowsSchema = z.array(z.object({ step: z.string(), ord: n, visitor_days: n }));
export const gapRowsSchema = z.array(z.object({ origin: z.string(), destination: z.string(), searches: n, zero_searches: n, zero_rate: n.nullable() }));
export const cohortRowsSchema = z.array(z.object({ cohort_week: z.string(), week_offset: n, visitors: n }));

export const FUNNEL_LABEL: Record<string, string> = {
  trip_view: 'Viewed a trip',
  booking_start: 'Started booking',
  booking_submit: 'Submitted booking',
  booking_success: 'Booking succeeded',
};

export interface DayRow { day: string; pageViews: number; visitorDays: number }
export interface FunnelStep { step: string; label: string; visitorDays: number; pctOfFirst: number | null; pctOfPrevious: number | null }
export interface UsageRow { surface: string; event: string; events: number; visitorDays: number }
export interface GapRow { origin: string; destination: string; searches: number; zeroSearches: number; zeroRate: number | null }
export interface CohortRow { week: string; size: number; retention: (number | null)[] }
export interface AnalyticsPage { days: number; overview: DayRow[]; funnel: FunnelStep[]; usage: UsageRow[]; gaps: GapRow[]; cohorts: CohortRow[] }

export const COHORT_WEEKS_SHOWN = 12;
export const COHORT_OFFSETS_SHOWN = 8;

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function toFunnel(rows: z.infer<typeof funnelRowsSchema>): FunnelStep[] {
  const sorted = [...rows].sort((a, b) => a.ord - b.ord);
  const first = sorted[0]?.visitor_days ?? 0;
  return sorted.map((r, i) => ({
    step: r.step, label: FUNNEL_LABEL[r.step] ?? r.step, visitorDays: r.visitor_days,
    pctOfFirst: pct(r.visitor_days, first), pctOfPrevious: i === 0 ? null : pct(r.visitor_days, sorted[i - 1]!.visitor_days),
  }));
}

/** Retention % by weeks since first visit. A cell is null when that week has not happened yet for the cohort. */
export function toCohorts(rows: z.infer<typeof cohortRowsSchema>, today = new Date()): CohortRow[] {
  const byWeek = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const m = byWeek.get(r.cohort_week) ?? new Map<number, number>();
    m.set(r.week_offset, r.visitors);
    byWeek.set(r.cohort_week, m);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, COHORT_WEEKS_SHOWN)
    .map(([week, m]) => {
      const size = m.get(0) ?? 0;
      const weeksElapsed = Math.floor((today.getTime() - new Date(`${week}T00:00:00Z`).getTime()) / (7 * 86_400_000));
      const retention = Array.from({ length: COHORT_OFFSETS_SHOWN }, (_, k) => (k > weeksElapsed ? null : pct(m.get(k) ?? 0, size)));
      return { week, size, retention };
    });
}

export const toDays = (r: z.infer<typeof overviewRowsSchema>): DayRow[] => r.map((x) => ({ day: x.day, pageViews: x.page_views, visitorDays: x.visitor_days })).reverse();
export const toUsage = (r: z.infer<typeof usageRowsSchema>): UsageRow[] => r.map((x) => ({ surface: x.surface, event: x.event, events: x.events, visitorDays: x.visitor_days }));
export const toGaps = (r: z.infer<typeof gapRowsSchema>): GapRow[] => r.map((x) => ({ origin: x.origin, destination: x.destination, searches: x.searches, zeroSearches: x.zero_searches, zeroRate: x.zero_rate }));
