export type TripFilterValues = { view: string; status: string; route: string; bus: string; driver: string; source: string; from: string; to: string };

/** Plain (server-safe) module: the trips page calls this on the server, so it must NOT live in a 'use client' file. */
export const hrefWith = (v: Partial<TripFilterValues>): string => {
  const q = new URLSearchParams();
  for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
  const s = q.toString();
  return s ? `/dashboard/trips?${s}` : '/dashboard/trips';
};
