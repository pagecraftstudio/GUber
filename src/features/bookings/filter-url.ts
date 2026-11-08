/** Plain (server-safe) module: the bookings page calls this on the server, so it must NOT live in a 'use client' file. */
export type BookingFilterValues = {
  q: string;
  view: string;
  sort: string;
  pay: string;
  boarding: string;
  source: string;
  route: string;
  trip: string;
  from: string;
  to: string;
};

export const bookingsHref = (v: Partial<BookingFilterValues> & { page?: number }): string => {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(v)) if (val) q.set(k, String(val));
  const s = q.toString();
  return s ? `/dashboard/bookings?${s}` : '/dashboard/bookings';
};

/**
 * Where a booking action returns to. Comes from a hidden form field, so it is validated here: only the bookings page itself
 * (with an optional query string) is accepted, anything else falls back to the plain list. No open redirect.
 */
export function safeBookingsReturn(raw: unknown): string {
  const v = typeof raw === 'string' ? raw : '';
  return /^\/dashboard\/bookings(\?[A-Za-z0-9=&%_.+\-]*)?$/.test(v) ? v : '/dashboard/bookings';
}

/** Adds one flash parameter and drops any previous flash, keeping the filters. */
export function withFlash(path: string, key: 'notice' | 'error', value: string): string {
  const [base = '/dashboard/bookings', qs = ''] = path.split('?');
  const q = new URLSearchParams(qs);
  q.delete('notice');
  q.delete('error');
  q.set(key, value);
  return `${base}?${q.toString()}`;
}
