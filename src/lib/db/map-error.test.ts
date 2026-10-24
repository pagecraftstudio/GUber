import { describe, expect, it } from 'vitest';
import { mapDbError } from './map-error';

const e = (code: string, message: string, details?: string) => mapDbError({ code, message, details: details ?? null });

describe('mapDbError', () => {
  it.each([
    ['42501', 'new row violates row-level security policy for table "buses"', 'forbidden', undefined],
    ['42501', 'permission denied for table companies', 'forbidden', undefined],
    ['42501', 'company_id is immutable', 'forbidden', undefined],
    ['42501', 'no active subscription', 'subscription_required', undefined],
    ['53400', 'plan limit reached: max_buses (5)', 'plan_limit', 'max_buses'],
    ['23P01', 'conflicting key value violates exclusion constraint "trips_bus_no_overlap"', 'conflict', 'bus_conflict'],
    ['23P01', 'conflicting key value violates exclusion constraint "trips_driver_no_overlap"', 'conflict', 'driver_conflict'],
    ['23505', 'duplicate key value violates unique constraint "buses_company_id_plate_number_key"', 'conflict', 'plate_number_taken'],
    ['23505', 'duplicate key value violates unique constraint "customers_phone_uq"', 'conflict', 'customer_phone_taken'],
    ['23505', 'duplicate key value violates unique constraint "routes_code_uq"', 'conflict', 'route_code_taken'],
    ['23505', 'duplicate key value violates unique constraint "route_stops_order_uq"', 'conflict', 'stop_order_taken'],
    ['23505', 'duplicate key value violates unique constraint "company_invites_one_pending_idx"', 'conflict', 'invite_pending'],
    ['23505', 'duplicate key value violates unique constraint "something_else"', 'conflict', undefined],
    ['23503', 'insert or update on table "trips" violates foreign key constraint "trips_bus_fk"', 'validation', 'invalid_reference'],
    ['23503', 'update or delete on table "buses" violates foreign key constraint "trips_bus_fk" on table "trips"', 'conflict', 'in_use'],
    ['23514', 'bus is not active', 'business_rule', 'bus_inactive'],
    ['23514', 'driver is not active', 'business_rule', 'driver_inactive'],
    ['23514', 'trip capacity (50) exceeds bus capacity (40)', 'business_rule', 'capacity_exceeds_bus'],
    ['23514', 'pickup stop does not belong to the trip route', 'business_rule', 'stop_not_on_route'],
    ['23514', 'company must keep at least one active owner', 'business_rule', 'last_owner'],
    ['23514', 'new row for relation "trips" violates check constraint "trips_seats_valid"', 'business_rule', 'seats_exceed_capacity'],
    ['23514', 'new row for relation "trips" violates check constraint "trips_assigned_when_live"', 'business_rule', 'bus_and_driver_required'],
    ['23514', 'new row for relation "company_settings" violates check constraint "company_settings_locales_valid"', 'validation', 'locale_not_supported'],
    ['23514', 'new row for relation "x" violates check constraint "unknown_check"', 'business_rule', 'check_failed'],
    ['22P02', 'invalid input syntax for type uuid: "nope"', 'validation', 'invalid_input'],
    ['22023', 'unknown role', 'validation', 'unknown_role'],
    ['22023', 'invalid email', 'validation', 'invalid_email'],
    ['23505', 'user already belongs to a company', 'conflict', 'user_already_member'],
    ['23505', 'duplicate key value violates unique constraint "companies_slug_key"', 'conflict', 'slug_taken'],
    ['22023', 'invalid slug', 'validation', 'invalid_slug'],
    ['22023', 'reserved slug', 'validation', 'reserved_slug'],
    ['22023', 'unknown plan', 'validation', 'unknown_plan'],
    ['22023', 'invalid trial days', 'validation', 'invalid_trial_days'],
    ['22023', 'invalid contact email', 'validation', 'invalid_contact_email'],
    ['22023', 'reason required', 'validation', 'reason_required'],
    ['22023', 'invalid sort', 'validation', 'invalid_input'],
    ['23514', 'invalid company status transition', 'business_rule', 'company_transition_invalid'],
    ['P0002', 'company not found', 'not_found', undefined],
    ['22023', 'invalid billing interval', 'validation', 'invalid_billing_interval'],
    ['22023', 'invalid subscription status', 'validation', 'invalid_subscription_status'],
    ['22023', 'invalid period', 'validation', 'invalid_period'],
    ['23514', 'invalid subscription status transition', 'business_rule', 'subscription_transition_invalid'],
    ['23514', 'subscription period ended', 'business_rule', 'subscription_period_ended'],
    ['23514', 'subscription not extendable', 'business_rule', 'subscription_not_extendable'],
    ['23514', 'company cancelled', 'business_rule', 'company_cancelled'],
    ['P0002', 'subscription not found', 'not_found', undefined],
    ['PGRST116', 'JSON object requested, multiple (or no) rows returned', 'not_found', undefined],
    ['PGRST301', 'JWT expired', 'unauthenticated', undefined],
  ])('%s %s -> %s', (pg, message, code, detail) => {
    const err = e(pg, message);
    expect(err.code).toBe(code);
    expect(err.detail).toBe(detail);
  });

  it('fails closed: unknown errors become internal and the message never carries SQL', () => {
    const err = e('XX000', 'relation "secret_table" exploded at 10.0.0.5');
    expect(err.code).toBe('internal');
    expect(err.message).not.toMatch(/secret_table|10\.0\.0\.5/);
    expect(err.cause).toBeDefined();
  });
});

describe('mapDbError: rate limiter (0020, SQLSTATE PT429)', () => {
  it('maps to rate_limited with the retry hint as a stable detail', () => {
    const e = mapDbError({ code: 'PT429', message: 'rate limit exceeded', hint: '123' });
    expect(e.code).toBe('rate_limited');
    expect(e.detail).toBe('retry_after_123');
  });
  it('ignores a malformed hint (no injection into detail)', () => {
    const e = mapDbError({ code: 'PT429', message: 'rate limit exceeded', hint: '12; drop table' });
    expect(e.code).toBe('rate_limited');
    expect(e.detail).toBeUndefined();
  });
});
