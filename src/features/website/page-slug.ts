/**
 * A page address made from its English title, e.g. "Contact us" -> "contact-us". Pure. Matches the database format
 * (lowercase letters and digits joined by single hyphens, at most 60). An Arabic-only title has no usable letters, so it becomes
 * "page". A taken address gets -2, -3, ... so adding a page never fails on a clash.
 */
export function pageSlugFrom(title: string, taken: readonly string[]): string {
  const base = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/g, '') || 'page';
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n++) { const next = `${base}-${n}`; if (!taken.includes(next)) return next; }
  return `${base}-${Date.now()}`;
}
