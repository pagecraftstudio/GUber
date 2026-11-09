import { sanitizeSearch } from '@/lib/db/search';
import { normalizeDigits } from '@/ds/format/normalize-digits';

/** Columns of the booking_list view the staff search box looks at: reference (= ticket number), passenger, e-mail, student id, university, route, notes. Phone is handled separately. */
const TEXT_COLUMNS = ['reference', 'customer_name', 'customer_email', 'customer_student_id', 'customer_university', 'route_name', 'notes'] as const;

/**
 * Builds the PostgREST `or(...)` string for the bookings search box, or null for an empty search.
 * Every term goes through sanitizeSearch (no filter syntax can be injected). A few forgiving variants are added because
 * people type what is printed on the ticket or what is in their address book, not the stored form:
 *   - "MBABC234" matches reference "MB-ABC234" (dash optional)
 *   - phones are stored as E.164 without spaces: "+20 100 000 1111" and "0100 000 1111" both match
 * Tenant scoping is a separate AND clause plus RLS: a search can never widen access.
 */
export function bookingSearchFilter(raw: string | undefined | null): string | null {
  const term = sanitizeSearch(raw ? normalizeDigits(raw) : raw);
  if (!term) return null;
  const clauses: string[] = TEXT_COLUMNS.map((c) => `${c}.ilike.%${term}%`);

  const compact = term.replace(/[\s-]+/g, '');
  const ref = /^mb([a-z0-9]{2,})$/i.exec(compact);
  if (ref) clauses.push(`reference.ilike.%MB-${ref[1]}%`);

  if (/^\+?\d{3,}$/.test(compact)) {
    clauses.push(`customer_phone.ilike.%${compact}%`);
    // local format with a leading zero: the stored E.164 number has no zero after the country code
    if (/^0\d{3,}$/.test(compact)) clauses.push(`customer_phone.ilike.%${compact.slice(1)}%`);
  }
  return clauses.join(',');
}
