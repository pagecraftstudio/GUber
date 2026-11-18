// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { RoutePlan, RouteSubscription } from '@/features/route-plans/types';

const decide = vi.fn(async (_id: string, _a: boolean, _n?: string) => ({ ok: true as const }));
const setActive = vi.fn(async (_id: string, _n: string, _p: number, _on: boolean) => ({ ok: true as const }));
const archive = vi.fn(async (_id: string) => ({ ok: true as const }));
const loadBookings = vi.fn();
const revoke = vi.fn(async (_id: string, _ids: string[], _r?: string) => ({ ok: true as const }));
vi.mock('../autosave-actions', () => ({
  loadSubscriptionBookingsAction: (id: string) => loadBookings(id),
  revokeSubscriptionAction: (id: string, ids: string[], r?: string) => revoke(id, ids, r),
  decideSubscriptionAction: (id: string, a: boolean, n?: string) => decide(id, a, n),
  setPlanActiveAction: (id: string, n: string, p: number, on: boolean) => setActive(id, n, p, on),
  archivePlanAction: (id: string) => archive(id),
}));
vi.mock('../form-actions', () => ({ createPlanFormAction: async () => ({ status: 'success' as const, message: 'created', nonce: 1 }) }));

import { PlansMasarView, SubscriptionsMasarView } from './PlansMasarViews';

beforeAll(polyfillDialog);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
const tb = () => within(document.querySelector('table') as HTMLElement);
const dlgOf = () => within(document.querySelector('table dialog') as HTMLElement);
const wrap = (lang: 'en' | 'ar', ui: React.ReactElement) => <DsLangProvider value={lang}>{ui}</DsLangProvider>;

const plan = (o: Partial<RoutePlan> = {}): RoutePlan => ({ id: 'p1', routeId: 'r1', routeName: 'Cairo to Galala', name: 'Monthly', price: 900, validityType: 'duration', durationMonths: 1, startsOn: null, endsOn: null, isActive: true, createdAt: '', ...o });
const sub = (o: Partial<RouteSubscription> = {}): RouteSubscription => ({ id: 's1', planId: 'p1', planName: 'Monthly', routeName: 'Cairo to Galala', masarId: 'MSR-ABCD-2345', memberName: 'Mona Ali', memberPhone: '+201098765432', status: 'pending', price: 900, currency: 'EGP', validFrom: null, validTo: null, requestedAt: '2026-11-17T09:05:21.727Z', decidedAt: null, decisionNote: null, ...o });

describe('plans view', () => {
  it('shows name, route, price and both validity kinds in English and Arabic', async () => {
    const rows = [plan(), plan({ id: 'p2', name: 'Term', validityType: 'range', durationMonths: null, startsOn: '2027-01-01', endsOn: '2027-06-01' })];
    render(wrap('en', <PlansMasarView rows={rows} routes={[{ id: 'r1', name: 'Cairo to Galala' }]} currency="EGP" canWrite usage={null} />));
    expect(tb().getByText('1 month from approval')).toBeTruthy();
    expect(tb().getByText(/2027/)).toBeTruthy();
    expect(await bad(document.body)).toEqual([]);
    cleanup();
    render(wrap('ar', <PlansMasarView rows={rows} routes={[]} currency="EGP" canWrite usage={null} />));
    expect(screen.getAllByText('باقات الاشتراك').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('شهر');
  });
  it('the switch and archive call the actions with the plan data; read-only users get no controls', async () => {
    render(wrap('en', <PlansMasarView rows={[plan()]} routes={[]} currency="EGP" canWrite usage={null} />));
    await userEvent.click(tb().getByRole('switch', { name: /Monthly/ }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith('p1', 'Monthly', 900, false));
    await userEvent.click(tb().getByRole('button', { name: /Archive Monthly/ }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith('p1'));
    cleanup();
    render(wrap('en', <PlansMasarView rows={[plan()]} routes={[]} currency="EGP" canWrite={false} usage={null} />));
    expect(screen.queryAllByRole('switch')).toEqual([]);
    expect(screen.queryAllByRole('button', { name: /Archive/ })).toEqual([]);
    expect(screen.queryByText('Add a plan')).toBeNull();
  });
  it('empty state', () => {
    render(wrap('en', <PlansMasarView rows={[]} routes={[]} currency="" canWrite usage={null} />));
    expect(screen.getAllByText('No plans yet').length).toBeGreaterThan(0);
  });
});

describe('requests view', () => {
  it('shows the request date (a timestamp), the member, the MASAR ID and the pending count', async () => {
    render(wrap('en', <SubscriptionsMasarView rows={[sub()]} filter="pending" canDecide />));
    expect(tb().getByText('Mona Ali')).toBeTruthy();
    expect(tb().getByText('MSR-ABCD-2345')).toBeTruthy();
    expect(document.body.textContent).toMatch(/2026/);          // requested date is not blank
    expect(screen.getByText('1 waiting for a decision')).toBeTruthy();
    expect(await bad(document.body)).toEqual([]);
  });
  it('approve asks first, then sends the decision with the note', async () => {
    render(wrap('en', <SubscriptionsMasarView rows={[sub()]} filter="pending" canDecide />));
    await userEvent.click(tb().getByRole('button', { name: /Approve Mona Ali/ }));
    const dlg = dlgOf();
    expect(dlg.getByText('Approve this request?')).toBeTruthy();
    await userEvent.type(dlg.getByRole('textbox'), 'paid cash');
    await userEvent.click(dlg.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('s1', true, 'paid cash'));
  });
  it('reject sends approve=false; users who cannot decide get no buttons; decided rows have none', async () => {
    render(wrap('en', <SubscriptionsMasarView rows={[sub()]} filter="pending" canDecide />));
    await userEvent.click(tb().getByRole('button', { name: /Reject Mona Ali/ }));
    await userEvent.click(dlgOf().getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('s1', false, ''));
    cleanup();
    render(wrap('en', <SubscriptionsMasarView rows={[sub()]} filter="pending" canDecide={false} />));
    expect(screen.queryAllByRole('button', { name: /Approve/ })).toEqual([]);
    cleanup();
    render(wrap('en', <SubscriptionsMasarView rows={[sub({ status: 'active', validFrom: '2026-11-17', validTo: '2026-12-16' })]} filter="active" canDecide />));
    expect(screen.queryAllByRole('button', { name: /Approve/ })).toEqual([]);
    expect(tb().getByText('Active')).toBeTruthy();
  });
  it('Arabic: title, filters and an empty state', () => {
    render(wrap('ar', <SubscriptionsMasarView rows={[]} filter="pending" canDecide />));
    expect(screen.getAllByText('طلبات الاشتراك').length).toBeGreaterThan(0);
    expect(screen.getAllByText('لا توجد طلبات').length).toBeGreaterThan(0);
  });
});

describe('RevokeCell (Phase E1)', () => {
  const fb = (id: string, canCancel: boolean, direction: 'go' | 'return' = 'go') => ({ bookingId: id, reference: `BK-${id}`, direction, departureAt: '2026-12-02T06:00:00Z', originName: 'Cairo', destinationName: 'Galala', canCancel });
  const mount = (lang: 'en' | 'ar' = 'en') => render(<DsLangProvider value={lang}><SubscriptionsMasarView rows={[sub({ status: 'active', validFrom: '2026-11-01', validTo: '2026-12-01' })]} filter="active" canDecide /></DsLangProvider>);

  it('lists the upcoming bookings, locks the boarded one, and sends only the ticked ids', async () => {
    loadBookings.mockResolvedValue({ ok: true, data: [fb('a', true), fb('b', true, 'return'), fb('c', false)] });
    mount();
    await userEvent.click(tb().getByRole('button', { name: 'Revoke Mona Ali' }));
    const dlg = within(document.querySelector('table dialog') as HTMLElement);
    expect(await dlg.findByText('BK-a')).toBeTruthy();
    const box = (ref: string) => dlg.getByLabelText(new RegExp(ref)) as HTMLInputElement;
    expect(box('BK-a').checked).toBe(true);
    expect(box('BK-c').disabled).toBe(true);
    expect(box('BK-c').checked).toBe(false);
    await userEvent.click(box('BK-b'));                        // keep this one
    expect(dlg.getByText(/1 will be cancelled/)).toBeTruthy();
    await userEvent.type(dlg.getByLabelText('Reason (optional)'), 'left');
    await userEvent.click(dlg.getByRole('button', { name: 'Revoke subscription' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('s1', ['a'], 'left'));
  });
  it('select none sends an empty list; nothing upcoming still allows the revoke', async () => {
    loadBookings.mockResolvedValue({ ok: true, data: [] });
    mount();
    await userEvent.click(tb().getByRole('button', { name: 'Revoke Mona Ali' }));
    const dlg = within(document.querySelector('table dialog') as HTMLElement);
    expect(await dlg.findByText('No upcoming booked trips.')).toBeTruthy();
    await userEvent.click(dlg.getByRole('button', { name: 'Revoke subscription' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('s1', [], ''));
  });
  it('a failed load disables the revoke button', async () => {
    loadBookings.mockResolvedValue({ ok: false, code: 'not_found' });
    mount();
    await userEvent.click(tb().getByRole('button', { name: 'Revoke Mona Ali' }));
    const dlg = within(document.querySelector('table dialog') as HTMLElement);
    expect(await dlg.findByRole('alert')).toBeTruthy();
    expect((dlg.getByRole('button', { name: 'Revoke subscription' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows Revoke only on active rows and has no serious a11y violations in Arabic', async () => {
    loadBookings.mockResolvedValue({ ok: true, data: [fb('a', true)] });
    const { container } = mount('ar');
    expect(tb().getAllByRole('button', { name: /إنهاء الاشتراك/ }).length).toBe(1);
    expect(await bad(container)).toEqual([]);
  });
});
