// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriverTrip } from './driverApi';
import type { ManifestPassenger } from './driverScreensApi';

const { trips, screens, auth } = vi.hoisted(() => ({
  trips: { myTrips: vi.fn() },
  screens: { manifest: vi.fn(), endTrip: vi.fn() },
  auth: { getSession: vi.fn() },
}));
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({ auth }) }));
vi.mock('./driverApi', async (orig) => ({ ...(await orig<typeof import('./driverApi')>()), createDriverApi: () => trips }));
vi.mock('./driverScreensApi', async (orig) => ({ ...(await orig<typeof import('./driverScreensApi')>()), createDriverScreensApi: () => screens }));

import { DsLangProvider } from '@/ds/lang';
import type { Lang } from '@/ds/format';
import { DriverTripManifest } from './DriverTripManifest';
import { ClearOfflineOnSignOut } from './ClearOfflineOnSignOut';
import { MANIFEST_CACHE_KEY, MANIFEST_CACHE_MAX_AGE_MS, loadManifest } from './manifest-cache';
import { ScreenError } from './driverScreensApi';

const ARABIC_INDIC = /[٠-٩]/;
const renderIn = (lang: Lang, ui: ReactElement) => render(<DsLangProvider value={lang}>{ui}</DsLangProvider>);
const trip = (over: Partial<DriverTrip> = {}): DriverTrip => ({ trip_id: 't1', company_name: 'Delta Express', origin_name: 'Cairo', destination_name: 'Alexandria', departure_at: '2020-01-01T06:00:00Z', arrival_at: '2020-01-01T09:00:00Z', status: 'in_progress', expected: 4, boarded: 3, remaining: 1, ...over });
const pax = (over: Partial<ManifestPassenger> = {}): ManifestPassenger => ({ booking_id: 'b1', reference: 'BK-100', passenger_name: 'Karim Adel', seats: 3, seats_boarded: 1, is_subscriber: false, pickup_stop: 'Maadi', dropoff_stop: 'Smouha', ...over });
const session = (id: string | null) => auth.getSession.mockResolvedValue({ data: { session: id ? { user: { id } } : null } });
const stored = () => localStorage.getItem(MANIFEST_CACHE_KEY);
const seed = (userId: string, tripId = 't1', savedAt = new Date().toISOString()) =>
  localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ tripId, userId, savedAt, trip: { origin_name: 'Cairo', destination_name: 'Alexandria', departure_at: '2020-01-01T06:00:00Z', arrival_at: '2020-01-01T09:00:00Z', status: 'in_progress' }, rows: [pax({ passenger_name: 'Saved Sara' })] }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => {
  localStorage.clear();
  session('u1');
  trips.myTrips.mockReset().mockResolvedValue([trip()]);
  screens.manifest.mockReset().mockResolvedValue([pax(), pax({ booking_id: 'b2', reference: 'BK-101', passenger_name: 'Nour Samir', seats: 1, seats_boarded: 1 })]);
  screens.endTrip.mockReset();
});
afterEach(cleanup);

describe('offline copy of the passenger list', () => {
  it('a successful load of an open trip saves a copy for this user (names and stops, nothing else)', async () => {
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByText('Karim Adel');
    await vi.waitFor(() => expect(stored()).not.toBeNull());
    const saved = JSON.parse(stored()!);
    expect(saved).toMatchObject({ tripId: 't1', userId: 'u1' });
    expect(saved.rows.map((r: ManifestPassenger) => r.passenger_name)).toEqual(['Karim Adel', 'Nour Samir']);
    expect(stored()).not.toMatch(/phone|email|price|payment/);
  });
  it('no signal + a saved copy: the list shows with an Arabic banner, Arabic-Indic time, and End is disabled with the reason', async () => {
    seed('u1');
    trips.myTrips.mockRejectedValue(new TypeError('Failed to fetch'));
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    expect(await screen.findByText('Saved Sara')).toBeTruthy();
    const banner = screen.getByText('نسخة غير متصلة');
    expect(banner).toBeTruthy();
    expect(banner.closest('[role]')?.textContent).toMatch(ARABIC_INDIC);
    expect((screen.getByTestId('end-trip') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('إنهاء الرحلة يحتاج إلى اتصال.')).toBeTruthy();
    expect(screens.endTrip).not.toHaveBeenCalled();
  });
  it('no signal and NO saved copy: the normal error state, no invented list', async () => {
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    expect(await screen.findByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy();
    expect(screen.queryByText('Saved Sara')).toBeNull();
  });
  it('another user\'s copy is never shown, and not deleted by looking', async () => {
    seed('someone-else');
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByRole('button', { name: 'حاول مرة أخرى' });
    expect(screen.queryByText('Saved Sara')).toBeNull();
    expect(stored()).not.toBeNull();
  });
  it('a copy older than 12 hours is not shown', async () => {
    seed('u1', 't1', new Date(Date.now() - MANIFEST_CACHE_MAX_AGE_MS - 60_000).toISOString());
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByRole('button', { name: 'حاول مرة أخرى' });
    expect(screen.queryByText('Saved Sara')).toBeNull();
  });
  it('a copy of another trip is not shown', async () => {
    seed('u1', 'other-trip');
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByRole('button', { name: 'حاول مرة أخرى' });
    expect(screen.queryByText('Saved Sara')).toBeNull();
  });
  it('a server refusal (not your trip) never falls back to a copy', async () => {
    seed('u1');
    screens.manifest.mockRejectedValue(new ScreenError('trip_not_found'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByRole('button', { name: 'حاول مرة أخرى' });
    expect(screen.queryByText('Saved Sara')).toBeNull();
  });
  it('without a local session nothing is saved and nothing is read', async () => {
    session(null);
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByText('Karim Adel');
    expect(stored()).toBeNull();
    seed('u1');
    cleanup();
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByRole('button', { name: 'حاول مرة أخرى' });
    expect(screen.queryByText('Saved Sara')).toBeNull();
  });
  it('a broken session lookup is harmless: the live list still shows', async () => {
    auth.getSession.mockRejectedValue(new Error('boom'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    expect(await screen.findByText('Karim Adel')).toBeTruthy();
    expect(stored()).toBeNull();
  });
  it('ending the trip wipes the copy', async () => {
    screens.endTrip.mockResolvedValue({ trip_id: 't1', status: 'completed', ended_at: '2026-11-24T10:00:00Z', changed: true, expected: 4, boarded: 3, remaining: 1 });
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await vi.waitFor(() => expect(stored()).not.toBeNull());
    await userEvent.click(await screen.findByTestId('end-trip'));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إنهاء الرحلة' }));
    await screen.findByText('تم إنهاء الرحلة');
    expect(stored()).toBeNull();
  });
  it('a trip that is already finished is not cached, and an old copy is removed', async () => {
    seed('u1');
    trips.myTrips.mockResolvedValue([trip({ status: 'completed' })]);
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByText('Karim Adel');
    await vi.waitFor(() => expect(stored()).toBeNull());
  });
  it('English wording, and the live list replaces the copy banner once the signal is back', async () => {
    seed('u1');
    screens.manifest.mockRejectedValueOnce(new ScreenError('network'));
    renderIn('en', <DriverTripManifest tripId="t1" lang="en" />);
    expect(await screen.findByText('Offline copy')).toBeTruthy();
    expect(screen.getByText('Ending the trip needs a connection.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Karim Adel')).toBeTruthy();
    expect(screen.queryByText('Offline copy')).toBeNull();
    expect((screen.getByTestId('end-trip') as HTMLButtonElement).disabled).toBe(false);
  });
  it('has no axe violations while showing the offline copy', async () => {
    seed('u1');
    screens.manifest.mockRejectedValue(new ScreenError('network'));
    const { container } = renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByText('Saved Sara');
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('sign-out wipes the offline copy', () => {
  it('submitting the sign-out form removes it; other localStorage keys stay', () => {
    seed('u1'); localStorage.setItem('unrelated', 'keep');
    const { container } = render(<form action="/x" onSubmit={(e) => e.preventDefault()}><ClearOfflineOnSignOut /><button type="submit">out</button></form>);
    expect(loadManifest(localStorage, 't1', 'u1')).not.toBeNull();
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(stored()).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
