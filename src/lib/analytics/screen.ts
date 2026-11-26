const ID_LIKE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

/**
 * "/dashboard/trips/<uuid>/edit" -> "trips.edit". The area prefix and any id are dropped, so a screen name never carries a record id or anything typed.
 * Anything unexpected becomes "other" rather than leaking a raw path.
 */
export function screenFromPath(path: string): string {
  const parts = path.split('?')[0]!.split('#')[0]!.split('/').filter(Boolean).slice(1);
  const clean = parts.filter((p) => !ID_LIKE.test(p));
  if (clean.length === 0) return 'home';
  const name = clean.slice(0, 3).join('.').toLowerCase();
  return /^[a-z0-9.-]{1,60}$/.test(name) ? name : 'other';
}
