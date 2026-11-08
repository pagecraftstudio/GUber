import type { Trip } from './types';

/** Calendar-day helpers in the COMPANY time zone (a trip at 23:30 Cairo time belongs to that Cairo day, not the UTC day). */

const partsOf = (iso: string | number | Date, tz: string) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
};

/** 'YYYY-MM-DD' of the instant in the zone. */
export function dayKey(iso: string | number | Date, tz: string): string {
  const { y, m, d } = partsOf(iso, tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The instant (ISO, UTC) at which the given calendar day STARTS in the zone. Handles offsets that change (DST). */
export function dayStartInstant(date: string, tz: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  let guess = Date.UTC(y, m - 1, d); // first guess: pretend the zone is UTC, then correct by the real offset (twice, for DST edges)
  for (let i = 0; i < 2; i++) {
    const p = partsOf(guess, tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    guess -= asUtc - Date.UTC(y, m - 1, d);
  }
  return new Date(guess).toISOString();
}

export const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Monday-based week containing `date`. */
export const weekRange = (date: string): { from: string; to: string } => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const from = addDays(date, -dow);
  return { from, to: addDays(from, 6) };
};

export type DayGroup = { day: string; trips: Trip[] };

/** Groups in the order given (trips must already be sorted by departure); trips inside a group keep that order. */
export function groupTripsByDay(trips: readonly Trip[], tz: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const t of trips) {
    const day = dayKey(t.departureAt, tz);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.trips.push(t);
    else groups.push({ day, trips: [t] });
  }
  return groups;
}

export const timeLabel = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export const isValidDateOnly = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
