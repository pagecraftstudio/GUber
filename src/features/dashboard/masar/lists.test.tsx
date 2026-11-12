// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import { DsFlagProvider } from '@/ds/shell/flag';
import type { Route } from '@/features/routes/types';
import type { Bus } from '@/features/buses/types';
import type { Driver } from '@/features/drivers/types';
import type { Customer } from '@/features/customers/types';

const setRoute = vi.fn(async (_id: string, _on: boolean) => ({ ok: true as const }));
const setBus = vi.fn(async (_id: string, _v: string) => ({ ok: true as const }));
const setDriver = vi.fn(async (_id: string, _v: string) => ({ ok: true as const }));
vi.mock('../autosave-actions', () => ({
  setRouteActiveAction: (id: string, on: boolean) => setRoute(id, on), setBusStatusAction: (id: string, v: string) => setBus(id, v), setDriverStatusAction: (id: string, v: string) => setDriver(id, v),
}));
vi.mock('../form-actions', () => {
  const ok = async () => ({ status: 'success' as const, message: 'created', nonce: 1 });
  return { createBusFormAction: ok, createDriverFormAction: ok, inviteDriverFormAction: ok, linkDriverFormAction: ok };
});

import { BusesMasarView, CustomersMasarView, DriversMasarView, RoutesMasarView } from './ListsMasarViews';

beforeAll(polyfillDialog);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
const table = () => within(document.querySelector('table') as HTMLElement);
const wrap = (lang: 'en' | 'ar', ui: React.ReactElement) => <DsLangProvider value={lang}><DsFlagProvider value>{ui}</DsFlagProvider></DsLangProvider>;

const route = (o: Partial<Route> = {}): Route => ({ id: 'r1', name: 'Cairo to Galala', originName: 'Cairo', destinationName: 'Galala', isActive: true, ...o } as Route);
const bus = (o: Partial<Bus> = {}): Bus => ({ id: 'b1', plateNumber: 'ABC 1234', name: null, capacity: 40, make: 'Mercedes', model: 'Tourismo', year: 2022, status: 'active', notes: null, createdAt: '', updatedAt: '', ...o });
const driver = (o: Partial<Driver> = {}): Driver => ({ id: 'd1', fullName: 'Omar Hassan', phone: '01012345678', licenseNumber: 'L-99', licenseExpiry: '2027-03-01', status: 'active', userId: null, ...o } as Driver);
const customer = (o: Partial<Customer> = {}): Customer => ({ id: 'c1', fullName: 'Mona Ali', phone: '01098765432', email: 'mona@example.com', university: 'Galala University', studentId: null, notes: null, createdAt: '2026-10-05T09:00:00Z', updatedAt: '', ...o });

describe('routes list', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible, links to the route, switch calls the same action`, async () => {
      const { container } = render(wrap(lang, <RoutesMasarView rows={[route()]} canWrite usage={null} />));
      expect(await bad(container)).toEqual([]);
      expect(table().getByRole('link', { name: 'Cairo to Galala' }).getAttribute('href')).toBe('/dashboard/routes/r1');
    });
  }
  it('switch saves through setRouteActiveAction with the flipped value', async () => {
    render(wrap('en', <RoutesMasarView rows={[route()]} canWrite usage={null} />));
    await userEvent.click(table().getByRole('switch'));
    await waitFor(() => expect(setRoute).toHaveBeenCalledWith('r1', false));
  });
  it('read-only role: View link, no switch, no add button', () => {
    render(wrap('en', <RoutesMasarView rows={[route()]} canWrite={false} usage={null} />));
    expect(table().queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a route' })).toBeNull();
    expect(table().getByRole('link', { name: /View Cairo to Galala/ })).toBeTruthy();
  });
  it('no rows: empty state', () => {
    render(wrap('en', <RoutesMasarView rows={[]} canWrite usage={null} />));
    expect(screen.getByText('No routes yet')).toBeTruthy();
    expect(document.querySelector('table')).toBeNull();
  });
});

describe('buses list', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible; plate stays Latin; add form present for writers`, async () => {
      const { container } = render(wrap(lang, <BusesMasarView rows={[bus()]} canWrite usage={null} />));
      expect(await bad(container)).toEqual([]);
      expect(table().getByText('ABC 1234').closest('[dir]')?.getAttribute('dir')).toBe('ltr');
      expect(container.querySelector('form')).not.toBeNull();
    });
  }
  it('status select saves through the same action', async () => {
    render(wrap('en', <BusesMasarView rows={[bus()]} canWrite usage={null} />));
    await userEvent.selectOptions(table().getByRole('combobox'), 'maintenance');
    await waitFor(() => expect(setBus).toHaveBeenCalledWith('b1', 'maintenance'));
  });
  it('read-only: no form, no select', () => {
    const { container } = render(wrap('en', <BusesMasarView rows={[bus()]} canWrite={false} usage={null} />));
    expect(container.querySelector('form')).toBeNull();
    expect(table().queryByRole('combobox')).toBeNull();
  });
});

describe('drivers list', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible with a linked login and an open one`, async () => {
      const rows = [driver(), driver({ id: 'd2', fullName: 'Sara Nabil', userId: 'u2' })];
      const logins = { d1: { linked: null, pendingExpires: null }, d2: { linked: { name: 'Sara', email: 'sara@example.com', suspended: false }, pendingExpires: null } };
      const { container } = render(wrap(lang, <DriversMasarView rows={rows} logins={logins} members={[]} canWrite canLogin usage={null} />));
      expect(await bad(container)).toEqual([]);
    });
  }
  it('status select saves through the same action', async () => {
    render(wrap('en', <DriversMasarView rows={[driver()]} logins={{}} members={[]} canWrite canLogin={false} usage={null} />));
    await userEvent.selectOptions(table().getAllByRole('combobox')[0]!, 'inactive');
    await waitFor(() => expect(setDriver).toHaveBeenCalledWith('d1', 'inactive'));
  });
});

describe('customers list', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: accessible, search keeps the query`, async () => {
      const { container } = render(wrap(lang, <CustomersMasarView rows={[customer()]} q="mona" page={1} pageSize={25} total={1} />));
      expect(await bad(container)).toEqual([]);
      expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('mona');
    });
  }
  it('Arabic uses Arabic-Indic digits for the total', () => {
    render(wrap('ar', <CustomersMasarView rows={[customer()]} q="" page={1} pageSize={25} total={12} />));
    expect(screen.getByRole('status').textContent).toContain('١٢');
  });
  it('no match with a query vs no customers at all', () => {
    const { rerender } = render(wrap('en', <CustomersMasarView rows={[]} q="zz" page={1} pageSize={25} total={0} />));
    expect(screen.getByText('No matching customers')).toBeTruthy();
    rerender(wrap('en', <CustomersMasarView rows={[]} q="" page={1} pageSize={25} total={0} />));
    expect(screen.getByText('No customers yet')).toBeTruthy();
  });
});
