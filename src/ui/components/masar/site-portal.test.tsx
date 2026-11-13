// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { LocaleProvider } from '../../context/LocaleContext';
import { INITIAL_BOOKINGS, INITIAL_COMPANIES, INITIAL_BUSES, INITIAL_DRIVERS, INITIAL_ROUTES, INITIAL_STOPS, INITIAL_TRIPS } from '../../lib/mockData';
const ctx = vi.hoisted(() => ({ company: null as unknown, setActiveView: () => undefined }));
vi.mock('../../context/TenantContext', () => ({ useTenant: () => ({ currentCompany: ctx.company, companies: [ctx.company], setActiveView: ctx.setActiveView }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, isAuthenticated: false, signOut: vi.fn() }) }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light', toggleTheme: vi.fn() }) }));

import { PublicFooterMasar, PublicHeaderMasar, PublicSiteMasarView } from './PublicSiteMasarView';
import { TripDetailsMasarView } from './TripDetailsMasarView';
import { CustomerPortalMasarView, type CustomerPortalMasarProps } from './CustomerPortalMasarView';
import type { Booking } from '../../types';

beforeAll(polyfillDialog);
afterEach(() => { cleanup(); localStorage.clear(); });

const wrap = (lang: 'en' | 'ar', ui: React.ReactNode) => { localStorage.setItem('malaky_locale', lang); ctx.company = INITIAL_COMPANIES[0]; return <LocaleProvider>{ui}</LocaleProvider>; };
const bad = async (el: HTMLElement) => {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join('|')}`);
};
const RAW = /\b(?:bg|text|border|ring|from|to|via)-(?:slate|blue|gray|zinc|emerald|amber|red|green)-\d{2,3}\b|#[0-9a-f]{6}\b(?!.{0,3}")/i;
const rawClasses = (html: string) => (html.match(/class="[^"]*"/g) ?? []).filter((c) => RAW.test(c));

const trips = INITIAL_TRIPS.filter((t) => t.published && t.status !== 'cancelled').slice(0, 3);
const site = (over = {}) => ({ routes: INITIAL_ROUTES, trips, buses: INITIAL_BUSES, stops: INITIAL_STOPS, origin: '', dest: '', date: '2026-11-11', onSearch: vi.fn(), onSelectTrip: vi.fn(), onViewDetails: vi.fn(), ...over });

describe('tenant public site', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: header, page and footer are accessible and use no raw colour classes`, async () => {
      const { container } = render(wrap(lang, <><PublicHeaderMasar onBook={vi.fn()} /><PublicSiteMasarView {...site()} /><PublicFooterMasar /></>));
      expect(await bad(container)).toEqual([]);
      expect(rawClasses(container.innerHTML)).toEqual([]);
      expect(container.querySelector('h1')?.textContent?.length).toBeGreaterThan(0);
    });
  }
  it('book and details fire for the chosen trip; a full trip cannot be booked', async () => {
    const full = { ...trips[0]!, id: 'full', bookedSeats: trips[0]!.totalSeats };
    const p = site({ trips: [trips[1]!, full] });
    render(wrap('en', <PublicSiteMasarView {...p} />));
    await userEvent.click(screen.getAllByRole('button', { name: /^book seat$/i })[0]!);
    expect(p.onSelectTrip).toHaveBeenCalledWith(trips[1]);
    await userEvent.click(screen.getAllByRole('button', { name: /view details/i })[0]!);
    expect(p.onViewDetails).toHaveBeenCalledWith(trips[1]);
    expect((screen.getByRole('button', { name: /fully booked/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('search submits the selected stops and date', async () => {
    const p = site();
    render(wrap('en', <PublicSiteMasarView {...p} />));
    await userEvent.click(screen.getByRole('button', { name: /find scheduled trips/i }));
    expect(p.onSearch).toHaveBeenCalledTimes(1);
    expect(p.onSearch.mock.calls[0]![2]).toBe('2026-11-11');
  });
  it('shows the empty state when no trip matches', () => {
    render(wrap('en', <PublicSiteMasarView {...site({ trips: [] })} />));
    expect(screen.getByText(/no trips|no departures/i)).not.toBeNull();
  });
  it('header book button fires once', async () => {
    const onBook = vi.fn();
    render(wrap('en', <PublicHeaderMasar onBook={onBook} />));
    await userEvent.click(screen.getAllByRole('button', { name: /book/i })[0]!);
    expect(onBook).toHaveBeenCalledTimes(1);
  });
  it('footer credits MASAR only, not the studio', () => {
    const { container } = render(wrap('en', <PublicFooterMasar />));
    expect(container.textContent).toContain('Powered by MASAR');
    expect(container.textContent).not.toContain('MALAKY');
  });
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: trip details dialog is accessible and its single action books`, async () => {
      const t = trips[0]!; const onBookNow = vi.fn(); const onClose = vi.fn();
      const route = INITIAL_ROUTES.find((r) => r.id === t.routeId);
      render(wrap(lang, <TripDetailsMasarView isOpen onClose={onClose} trip={t} route={route} bus={INITIAL_BUSES.find((b) => b.id === t.busId)} driver={INITIAL_DRIVERS.find((d) => d.id === t.driverId)} originStop={INITIAL_STOPS.find((s) => s.id === route?.originStopId)} destStop={INITIAL_STOPS.find((s) => s.id === route?.destStopId)} onBookNow={onBookNow} />));
      const dlg = document.querySelector('dialog') as HTMLElement;
      expect(await bad(dlg)).toEqual([]);
      expect(rawClasses(dlg.innerHTML)).toEqual([]);
      await userEvent.click(screen.getAllByRole('button').find((b) => /book/i.test(b.textContent ?? '') || /احجز/.test(b.textContent ?? ''))!);
      expect(onBookNow).toHaveBeenCalledWith(t);
    });
  }
});

const booking = (o: Partial<Booking> = {}): Booking => ({ ...INITIAL_BOOKINGS[0]!, id: 'b1', status: 'confirmed', canCancel: true, ...o });
const portal = (o: Partial<CustomerPortalMasarProps> = {}): CustomerPortalMasarProps => ({
  user: { id: 'u1', fullName: 'Mona Adel', email: 'mona@example.com', phone: '01012345678', studentId: 'GU-2024-8841', createdAt: '2026-01-05T00:00:00Z' }, mock: false, stats: { trips: 2, spent: 360 },
  filter: 'all', onFilter: vi.fn(), bookings: [booking(), booking({ id: 'b2', status: 'cancellation_requested', cancellationReason: 'Exam moved' }), booking({ id: 'b3', status: 'boarded' })],
  trips: INITIAL_TRIPS, routes: INITIAL_ROUTES, stops: INITIAL_STOPS, loading: false, companyOf: () => undefined, onBrowse: vi.fn(), onViewTicket: vi.fn(), onAskCancel: vi.fn(),
  profile: { name: 'Mona Adel', phone: '01012345678', studentId: 'GU-2024-8841', university: 'CS', saving: false, saved: false, onName: vi.fn(), onPhone: vi.fn(), onStudentId: vi.fn(), onUniversity: vi.fn(), onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()) },
  companions: [{ id: 'c1', name: 'Sara Hany', phone: '01099999999', relationship: 'Roommate' }], onRemoveCompanion: vi.fn(), onOpenAddCompanion: vi.fn(), onSignOut: vi.fn(),
  cancel: { booking: null, reason: '', loading: false, error: null, onReason: vi.fn(), onClose: vi.fn(), onConfirm: vi.fn() },
  add: { open: false, name: '', phone: '', studentId: '', relationship: '', saving: false, onName: vi.fn(), onPhone: vi.fn(), onStudentId: vi.fn(), onRelationship: vi.fn(), onClose: vi.fn(), onSubmit: vi.fn((e: { preventDefault: () => void }) => e.preventDefault()) }, ...o,
});

describe('passenger portal', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: bookings are accessible and use no raw colour classes`, async () => {
      const { container } = render(wrap(lang, <CustomerPortalMasarView {...portal()} />));
      expect(await bad(container)).toEqual([]);
      expect(rawClasses(container.innerHTML)).toEqual([]);
    });
  }
  it('real mode: cancel is offered only while the server allows it, and asks for the booking', async () => {
    const p = portal({ bookings: [booking(), booking({ id: 'late', canCancel: false })] });
    render(wrap('en', <CustomerPortalMasarView {...p} />));
    const cancels = screen.getAllByRole('button', { name: /^cancel booking$/i });
    expect(cancels).toHaveLength(1);
    await userEvent.click(cancels[0]!);
    expect(p.onAskCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
    expect(screen.getByText(/cancellation period has ended/i)).not.toBeNull();
  });
  it('mock mode: the demo request flow keeps its wording', () => {
    render(wrap('en', <CustomerPortalMasarView {...portal({ mock: true })} />));
    expect(screen.getAllByRole('button', { name: /request cancellation/i }).length).toBeGreaterThan(0);
  });
  it('status and request notice are visible, and a ticket opens for the booking', async () => {
    const p = portal();
    const { container } = render(wrap('en', <CustomerPortalMasarView {...p} />));
    expect(container.textContent).toContain('Cancellation requested');
    expect(container.textContent).toContain('Exam moved');
    await userEvent.click(screen.getAllByRole('button', { name: /view ticket/i })[0]!);
    expect(p.onViewTicket).toHaveBeenCalledTimes(1);
  });
  it('filter buttons report which is pressed and call back', async () => {
    const p = portal({ filter: 'upcoming' });
    render(wrap('en', <CustomerPortalMasarView {...p} />));
    expect(screen.getByRole('button', { name: /^upcoming$/i }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /^past$/i }));
    expect(p.onFilter).toHaveBeenCalledWith('completed');
  });
  it('empty and loading states render', () => {
    const r = render(wrap('en', <CustomerPortalMasarView {...portal({ bookings: [] })} />));
    expect(r.container.textContent).toMatch(/no bookings here/i);
    r.unmount();
    const l = render(wrap('en', <CustomerPortalMasarView {...portal({ loading: true })} />));
    expect(l.container.querySelector('[role="status"]')).not.toBeNull();
  });
  it('profile tab saves through the same handler; companions can be removed; sign out fires', async () => {
    const p = portal();
    render(wrap('en', <CustomerPortalMasarView {...p} />));
    await userEvent.click(screen.getByRole('tab', { name: /profile/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(p.profile.onSubmit).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('tab', { name: /saved passengers/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove: sara hany/i }));
    expect(p.onRemoveCompanion).toHaveBeenCalledWith('c1');
    await userEvent.click(screen.getByRole('tab', { name: /security/i }));
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });
  it('cancel dialog: real mode confirms right away; mock mode needs a reason first', async () => {
    const real = portal({ cancel: { ...portal().cancel, booking: booking() } });
    const r = render(wrap('en', <CustomerPortalMasarView {...real} />));
    expect(await bad(document.querySelector('dialog') as HTMLElement)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: /cancel booking now/i }));
    expect(real.cancel.onConfirm).toHaveBeenCalledTimes(1);
    r.unmount();
    const mock = portal({ mock: true, cancel: { ...portal().cancel, booking: booking() } });
    render(wrap('en', <CustomerPortalMasarView {...mock} />));
    expect((screen.getByRole('button', { name: /send request/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('the server error from a failed cancellation is shown in the dialog', () => {
    render(wrap('en', <CustomerPortalMasarView {...portal({ cancel: { ...portal().cancel, booking: booking(), error: 'Too late to cancel' } })} />));
    expect(screen.getByText('Too late to cancel')).not.toBeNull();
  });
});
