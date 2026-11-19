// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { ExpiringSubscription } from '@/features/route-plans/types';

vi.mock('../autosave-actions', () => ({ loadSubscriptionBookingsAction: vi.fn(), revokeSubscriptionAction: vi.fn(), decideSubscriptionAction: vi.fn(), setPlanActiveAction: vi.fn(), archivePlanAction: vi.fn() }));
vi.mock('../form-actions', () => ({ createPlanFormAction: async () => ({ status: 'success' as const, message: 'created', nonce: 1 }) }));
import { SubscriptionsMasarView } from './PlansMasarViews';

beforeAll(polyfillDialog);
afterEach(cleanup);

const row = (o: Partial<ExpiringSubscription> = {}): ExpiringSubscription => ({ id: 'a1', masarId: 'MSR-AAAA-BBBB', memberName: 'Rana Student', memberPhone: '+201001234567', memberLocale: 'en',
  companyName: 'Nile Bus', planName: 'Monthly', routeName: 'Cairo → Galala', validTo: '2026-11-25', daysLeft: 5, renewalPending: false, ...o });
const mount = (lang: 'en' | 'ar', rows: ExpiringSubscription[]) =>
  render(<DsLangProvider value={lang}><SubscriptionsMasarView rows={[]} expiring={rows} filter="expiring" canDecide /></DsLangProvider>);
const tb = () => document.querySelector('table') as HTMLElement;

describe('expiring soon (Phase E3)', () => {
  it('lists the member with days left and a WhatsApp link carrying the ready message', () => {
    mount('en', [row()]);
    expect(within(tb()).getByText('Rana Student')).toBeTruthy();
    expect(within(tb()).getByText(/5 days left/)).toBeTruthy();
    const a = within(tb()).getByRole('link', { name: 'WhatsApp: Rana Student' }) as HTMLAnchorElement;
    expect(a.href.startsWith('https://wa.me/201001234567?text=')).toBe(true);
    expect(decodeURIComponent(a.href)).toContain('Hello Rana Student');
    expect(a.rel).toContain('noopener');
    expect(a.target).toBe('_blank');
  });
  it('writes the message in Arabic for an Arabic member, and shows a pending renewal', () => {
    mount('en', [row({ memberLocale: 'ar', renewalPending: true })]);
    const a = within(tb()).getByRole('link', { name: /WhatsApp/ }) as HTMLAnchorElement;
    expect(decodeURIComponent(a.href)).toContain('مرحباً Rana Student');
    expect(within(tb()).getByText('Requested')).toBeTruthy();
  });
  it('shows no link for a phone without usable digits', () => {
    mount('en', [row({ memberPhone: 'n/a' })]);
    expect(within(tb()).queryByRole('link', { name: /WhatsApp/ })).toBeNull();
    expect(within(tb()).getByText('No valid number')).toBeTruthy();
  });
  it('shows the empty state', () => {
    mount('en', []);
    expect(screen.getByText('Nothing ends soon')).toBeTruthy();
  });
  it('has the tab and no serious a11y violations in en and ar', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const { container, unmount } = mount(lang, [row()]);
      const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
      unmount();
    }
    mount('en', [row()]);
    expect(screen.getByRole('link', { name: 'Expiring soon' })).toBeTruthy();
  });
});
