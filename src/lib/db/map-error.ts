import { AppError, type AppErrorCode } from '@/lib/errors';

/** Shape of a PostgREST / supabase-js error. */
export type DbErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null };

type Rule = { match: RegExp; code: AppErrorCode; detail: string; fields?: Record<string, string> };

// Named constraints and trigger messages from migrations 0002-0007. Matching on the name keeps the mapping
// independent of column order, and anything unknown falls through to a generic class below.
const RULES: Rule[] = [
  // exclusion constraints: the DB is the authority on double-booking (race-free)
  { match: /trips_bus_no_overlap/, code: 'conflict', detail: 'bus_conflict' },
  { match: /trips_driver_no_overlap/, code: 'conflict', detail: 'driver_conflict' },
  // unique constraints / indexes
  { match: /buses_company_id_plate_number_key/, code: 'conflict', detail: 'plate_number_taken', fields: { plateNumber: 'taken' } },
  { match: /routes_code_uq/, code: 'conflict', detail: 'route_code_taken', fields: { code: 'taken' } },
  { match: /customers_phone_uq/, code: 'conflict', detail: 'customer_phone_taken', fields: { phone: 'taken' } },
  { match: /drivers_user_uq/, code: 'conflict', detail: 'driver_user_taken' },
  { match: /route_stops_order_uq/, code: 'conflict', detail: 'stop_order_taken', fields: { stopOrder: 'taken' } },
  { match: /company_invites_one_pending_idx/, code: 'conflict', detail: 'invite_pending', fields: { email: 'pending' } },
  // check constraints
  { match: /trips_seats_valid/, code: 'business_rule', detail: 'seats_exceed_capacity' },
  { match: /trips_assigned_when_live/, code: 'business_rule', detail: 'bus_and_driver_required' },
  { match: /company_settings_locales_valid/, code: 'validation', detail: 'locale_not_supported', fields: { defaultLocale: 'locale_not_supported' } },
  { match: /trips_times_valid/, code: 'validation', detail: 'arrival_before_departure', fields: { arrivalAt: 'must_be_after_departure' } },
  // trigger messages (0004, 0007)
  { match: /bus is not active/, code: 'business_rule', detail: 'bus_inactive', fields: { busId: 'inactive' } },
  { match: /driver is not active/, code: 'business_rule', detail: 'driver_inactive', fields: { driverId: 'inactive' } },
  { match: /exceeds bus capacity/, code: 'business_rule', detail: 'capacity_exceeds_bus', fields: { capacity: 'exceeds_bus_capacity' } },
  { match: /stop does not belong to the trip route/, code: 'business_rule', detail: 'stop_not_on_route' },
  { match: /at least one active owner/, code: 'business_rule', detail: 'last_owner' },
  { match: /user already belongs to a company/, code: 'conflict', detail: 'user_already_member', fields: { email: 'already_member' } },
  { match: /unknown role/, code: 'validation', detail: 'unknown_role', fields: { roleKey: 'unknown' } },
  { match: /invalid email/, code: 'validation', detail: 'invalid_email', fields: { email: 'invalid' } },
  // platform company management RPCs (0017)
  { match: /companies_slug_key/, code: 'conflict', detail: 'slug_taken', fields: { slug: 'taken' } },
  { match: /invalid slug/, code: 'validation', detail: 'invalid_slug', fields: { slug: 'invalid_slug' } },
  { match: /reserved slug/, code: 'validation', detail: 'reserved_slug', fields: { slug: 'reserved_slug' } },
  { match: /invalid company name/, code: 'validation', detail: 'invalid_name', fields: { name: 'invalid' } },
  { match: /unknown plan/, code: 'validation', detail: 'unknown_plan', fields: { planCode: 'unknown_plan' } },
  { match: /invalid trial days/, code: 'validation', detail: 'invalid_trial_days', fields: { trialDays: 'invalid' } },
  { match: /invalid contact email/, code: 'validation', detail: 'invalid_contact_email', fields: { contactEmail: 'invalid' } },
  { match: /invalid country/, code: 'validation', detail: 'invalid_country', fields: { country: 'invalid_country' } },
  { match: /reason required/, code: 'validation', detail: 'reason_required', fields: { reason: 'reason_required' } },
  { match: /invalid note/, code: 'validation', detail: 'invalid_note', fields: { body: 'invalid' } },
  { match: /invalid company status transition/, code: 'business_rule', detail: 'company_transition_invalid' },
  // platform subscription management RPCs (0018)
  { match: /invalid billing interval/, code: 'validation', detail: 'invalid_billing_interval', fields: { billingInterval: 'invalid' } },
  { match: /invalid subscription status transition/, code: 'business_rule', detail: 'subscription_transition_invalid' },
  { match: /invalid subscription status/, code: 'validation', detail: 'invalid_subscription_status', fields: { status: 'invalid' } },
  { match: /invalid period/, code: 'validation', detail: 'invalid_period', fields: { days: 'invalid_period' } },
  { match: /subscription period ended/, code: 'business_rule', detail: 'subscription_period_ended' },
  { match: /subscription not extendable/, code: 'business_rule', detail: 'subscription_not_extendable' },
  { match: /company cancelled/, code: 'business_rule', detail: 'company_cancelled' },
  // audit read RPCs (0019)
  { match: /invalid filter|invalid range|invalid cursor|invalid limit/, code: 'validation', detail: 'invalid_filter' },
  { match: /audit entry not found/, code: 'not_found', detail: 'audit_not_found' },
  // booking RPCs (0010)
  { match: /invalid phone number/, code: 'validation', detail: 'invalid_phone', fields: { phone: 'invalid_phone' } },
  { match: /idempotency key reused/, code: 'conflict', detail: 'idempotency_conflict' },
  { match: /trip is not open for booking/, code: 'business_rule', detail: 'trip_not_bookable' },
  { match: /trip already departed/, code: 'business_rule', detail: 'trip_departed' },
  { match: /seats per booking exceeded/, code: 'business_rule', detail: 'seats_per_booking_exceeded', fields: { seats: 'too_many' } },
  { match: /not enough seats available/, code: 'business_rule', detail: 'trip_full', fields: { seats: 'not_enough_seats' } },
  { match: /booking cannot be cancelled in its current state/, code: 'business_rule', detail: 'booking_not_cancellable' },
  { match: /trip is closed/, code: 'business_rule', detail: 'trip_closed' },
  { match: /trip has not started/, code: 'business_rule', detail: 'trip_not_started' },
  { match: /invalid booking status transition/, code: 'business_rule', detail: 'booking_transition_invalid' },
  // trip state machine (0011)
  { match: /invalid trip status transition/, code: 'business_rule', detail: 'trip_transition_invalid' },
  { match: /trip has bookings|trip has booking history/, code: 'business_rule', detail: 'trip_has_bookings' },
  { match: /trip is not a draft/, code: 'business_rule', detail: 'trip_not_draft' },
  { match: /bookings are never deleted|booking fields are immutable/, code: 'business_rule', detail: 'booking_immutable' },
];

/**
 * Translates a Postgres/PostgREST error into an AppError. The raw error is kept as `cause` for server logs and
 * is never part of the message. Unknown errors become `internal` (fail closed, no information leak).
 */
export function mapDbError(error: DbErrorLike): AppError {
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  const ruled = RULES.find((r) => r.match.test(text));
  const withRule = (r: Rule) =>
    new AppError(r.code, { detail: r.detail, ...(r.fields ? { fields: r.fields } : {}), cause: error });

  switch (error.code) {
    case 'PT429': // 0020 rate limiter (PostgREST answers HTTP 429); `hint` carries the seconds until the window resets
      return new AppError('rate_limited', { ...(/^\d{1,6}$/.test(error.hint ?? '') ? { detail: `retry_after_${error.hint}` } : {}), cause: error });
    case '42501': // RLS violation, missing grant, or trigger-raised
      if (/no active subscription/.test(text)) return new AppError('subscription_required', { cause: error });
      return new AppError('forbidden', { cause: error });
    case '53400': {
      const limit = /plan limit reached: (\w+)/.exec(text)?.[1];
      return new AppError('plan_limit', { ...(limit ? { detail: limit } : {}), cause: error });
    }
    case '23505': // unique_violation
    case '23P01': // exclusion_violation
      return ruled ? withRule(ruled) : new AppError('conflict', { cause: error });
    case '23503': // foreign_key_violation
      return /update or delete on table/.test(text)
        ? new AppError('conflict', { detail: 'in_use', cause: error })
        : new AppError('validation', { detail: 'invalid_reference', cause: error });
    case '23514': // check_violation (table checks and trigger-raised)
      return ruled ? withRule(ruled) : new AppError('business_rule', { detail: 'check_failed', cause: error });
    case '23502': // not_null_violation
    case '22P02': // invalid_text_representation (for example a malformed uuid)
    case '22007':
    case '22008':
    case '22001': // string_data_right_truncation
    case '22003': // numeric_value_out_of_range
    case '22023': // invalid_parameter_value (raised by our RPCs)
      return ruled ? withRule(ruled) : new AppError('validation', { detail: 'invalid_input', cause: error });
    case 'P0002': // no_data_found: raised by RPCs for "missing OR not yours" (same answer on purpose)
    case 'PGRST116':
      return new AppError('not_found', { cause: error });
    case 'PGRST301': // JWT expired / invalid
    case 'PGRST302':
      return new AppError('unauthenticated', { cause: error });
    default:
      return new AppError('internal', { cause: error });
  }
}
