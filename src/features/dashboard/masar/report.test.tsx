// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import { ReportMasarView } from './ReportMasarView';

beforeAll(polyfillDialog);
afterEach(cleanup);

const props = {
  from: '2026-11-01', to: '2026-11-30', timeZone: 'Africa/Cairo',
  plans: [{ planId: 'p1', planName: 'Monthly', routeName: 'Campus', isActive: true, activeNow: 4, pendingNow: 1, newInRange: 5, revenue: 4500, currency: 'EGP' }],
  days: [{ day: '2026-11-10', goScans: 3, returnScans: 2, goBooked: 4, returnBooked: 3, noShows: 2 }],
  demand: [{ tripId: 't1', routeName: 'Campus', departureAt: '2026-11-20T06:30:00Z', capacity: 40, seatsAvailable: 30, subscriberSeats: 6, returnIntent: 4 }],
};
const mount = (lang: 'en' | 'ar', extra = {}) => render(<DsLangProvider value={lang}><ReportMasarView {...props} {...extra} /></DsLangProvider>);
const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
};

describe('subscription report view', () => {
  it('shows the three tables, the range and the definitions', () => {
    mount('en');
    expect(screen.getByRole('heading', { name: 'Subscription report' })).toBeTruthy();
    expect(screen.getAllByText('Monthly').length).toBeGreaterThan(0);
    expect(screen.getByText('How these numbers are counted')).toBeTruthy();
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-11-01');
  });
  it('shows the range error only when invalid', () => {
    mount('en', { invalid: true });
    expect(screen.getByRole('alert').textContent).toContain('366');
  });
  it('has no serious accessibility violations in en and ar', async () => {
    const en = mount('en'); expect(await bad(en.container)).toEqual([]); cleanup();
    const ar = mount('ar'); expect(await bad(ar.container)).toEqual([]);
  });
});
