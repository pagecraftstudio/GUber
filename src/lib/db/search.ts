/**
 * User text that ends up inside a PostgREST `or(...)` filter string. Characters that are syntax there
 * (comma, parentheses, quotes, backslash, wildcards) are removed, so a search box can never inject extra
 * filter clauses. Letters in any script, digits, spaces and a few email/phone characters are kept.
 * (Tenant scoping is a separate AND clause plus RLS, so even a bug here cannot cross tenants.)
 */
export function sanitizeSearch(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@.+-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Builds `col1.ilike.%term%,col2.ilike.%term%` or null when there is nothing to search for. */
export function ilikeAny(columns: readonly string[], rawTerm: string | undefined | null): string | null {
  const term = sanitizeSearch(rawTerm);
  if (!term) return null;
  return columns.map((c) => `${c}.ilike.%${term}%`).join(',');
}
