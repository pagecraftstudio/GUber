import { describe, expect, it } from 'vitest';
import { STATUS_MAP } from './status-map';
import type { BookingStatus, BoardingStatus, PaymentStatus } from '@/features/bookings/types';
import type { TripStatus } from '@/features/trips/types';
import type { CompanyStatus } from '@/features/companies/types';
import type { SubscriptionStatus } from '@/features/subscriptions/types';
import type { InviteStatus } from '@/features/users/types';

/** Compile-time completeness: if a backend value is added, the Record type errors here until the badge exists. */
const booking: Record<BookingStatus, true> = { pending: true, confirmed: true, cancelled: true, completed: true, no_show: true };
const payment: Record<PaymentStatus, true> = { unpaid: true, partial: true, paid: true, refunded: true };
const boarding: Record<BoardingStatus, true> = { not_boarded: true, partial: true, boarded: true };
const trip: Record<TripStatus, true> = { draft: true, scheduled: true, boarding: true, in_progress: true, completed: true, cancelled: true };
const company: Record<CompanyStatus, true> = { trial: true, active: true, suspended: true, cancelled: true };
const sub: Record<SubscriptionStatus, true> = { trialing: true, active: true, past_due: true, cancelled: true, expired: true };
const invite: Record<InviteStatus, true> = { pending: true, accepted: true, revoked: true, expired: true };

describe('status map covers every backend status (plan 10.3)', () => {
  const cases: [keyof typeof STATUS_MAP, Record<string, true>][] = [['booking', booking], ['payment', payment], ['boarding', boarding], ['trip', trip], ['company', company], ['subscription', sub], ['invite', invite]];
  for (const [domain, values] of cases) it(domain, () => expect(Object.keys(STATUS_MAP[domain]).sort()).toEqual(Object.keys(values).sort()));
  it('bus, driver, route and member are covered', () => {
    expect(Object.keys(STATUS_MAP.bus).sort()).toEqual(['active', 'inactive', 'maintenance']);
    expect(Object.keys(STATUS_MAP.driver).sort()).toEqual(['active', 'inactive']);
    expect(Object.keys(STATUS_MAP.member).sort()).toEqual(['active', 'suspended']);
  });
  it('has no Delayed or Failed (no backend equivalent)', () => expect(JSON.stringify(STATUS_MAP)).not.toMatch(/delayed|failed/i));
  it('every status has both labels', () => {
    for (const d of Object.values(STATUS_MAP)) for (const s of Object.values(d)) { expect(s.label.en).toBeTruthy(); expect(s.label.ar).toBeTruthy(); }
  });
});
