// @vitest-environment jsdom
// P7b slice C. NOT RUN when written: run `npx vitest run src/features/driver` before approving.
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriverTrip } from './driverApi';
import type { DriverProfile as Profile, ManifestPassenger } from './driverScreensApi';

// vi.mock factories are hoisted above everything else, so the fakes they close over must be hoisted too
const { trips, screens, inbox, nav } = vi.hoisted(() => ({
  trips: { myTrips: vi.fn() },
  screens: { manifest: vi.fn(), endTrip: vi.fn(), myProfile: vi.fn() },
  inbox: { fetchInbox: vi.fn(), markRead: vi.fn() },
  nav: { path: '/driver' },
}));
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({}) }));
vi.mock('./driverApi', async (orig) => ({ ...(await orig<typeof import('./driverApi')>()), createDriverApi: () => trips }));
vi.mock('./driverScreensApi', async (orig) => ({ ...(await orig<typeof import('./driverScreensApi')>()), createDriverScreensApi: () => screens }));
vi.mock('@/features/notifications/api', async (orig) => ({ ...(await orig<typeof import('@/features/notifications/api')>()), fetchInbox: inbox.fetchInbox, markRead: inbox.markRead }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.path }));

import { DsLangProvider } from '@/ds/lang';
import type { Lang } from '@/ds/format';
import { DriverInbox } from './DriverInbox';
import { DriverNav } from './DriverNav';
import { DriverProfile } from './DriverProfile';
import { DriverToday } from './DriverToday';
import { DriverTripManifest } from './DriverTripManifest';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';
import { classifyScreenError, licenseState, ScreenError } from './driverScreensApi';
import { groupTrips } from './trip-groups';

const ARABIC = /[\u0600-\u06FF]/;
const ARABIC_INDIC = /[٠-٩]/;
const renderIn = (lang: Lang, ui: ReactElement) => render(<DsLangProvider value={lang}>{ui}</DsLangProvider>);

/** local-time instant `days` from today at `hour` o'clock: the Today screen groups by the device's own calendar day */
const at = (days: number, hour: number): string => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, hour, 0, 0).toISOString(); };
const trip = (over: Partial<DriverTrip> = {}): DriverTrip => ({
  trip_id: 't1', company_name: 'Delta Express', origin_name: 'Cairo', destination_name: 'Alexandria',
  departure_at: '2020-01-01T06:00:00Z', arrival_at: '2020-01-01T09:00:00Z', status: 'in_progress', expected: 4, boarded: 3, remaining: 1, ...over,
});
const pax = (over: Partial<ManifestPassenger> = {}): ManifestPassenger => ({
  booking_id: 'b1', reference: 'BK-100', passenger_name: 'Karim Adel', seats: 3, seats_boarded: 1, is_subscriber: false, pickup_stop: 'Maadi', dropoff_stop: 'Smouha', ...over,
});
const profile = (over: Partial<Profile> = {}): Profile => ({
  company_name: 'Delta Express', full_name: 'Hassan Ali', phone: '+201000056001', license_number: 'LIC-56-1', license_expiry: '2027-03-01', license_days_left: 90, photo_media_id: null, trips_completed: 12, ...over,
});

beforeAll(() => {
  // jsdom has no <dialog>.showModal: same polyfill idea as the shell tests
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => {
  trips.myTrips.mockReset().mockResolvedValue([trip()]);
  screens.manifest.mockReset().mockResolvedValue([pax(), pax({ booking_id: 'b2', reference: 'BK-101', passenger_name: 'Nour Samir', seats: 1, seats_boarded: 1, is_subscriber: true, pickup_stop: null, dropoff_stop: null })]);
  screens.endTrip.mockReset();
  screens.myProfile.mockReset().mockResolvedValue(profile());
  inbox.fetchInbox.mockReset().mockResolvedValue([]);
  inbox.markRead.mockReset().mockResolvedValue(1);
  nav.path = '/driver';
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(cleanup);

describe('copy file', () => {
  const leaves = (o: unknown, prefix = ''): Array<[string, unknown]> =>
    o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => leaves(v, `${prefix}${k}.`)) : [[prefix.slice(0, -1), o]];
  it('Arabic and English define exactly the same keys, and every Arabic string contains Arabic script', () => {
    const en = leaves(DRIVER_SCREENS_TEXT.en).map(([k]) => k).sort();
    const ar = leaves(DRIVER_SCREENS_TEXT.ar).map(([k]) => k).sort();
    expect(ar).toEqual(en);
    for (const [k, v] of leaves(DRIVER_SCREENS_TEXT.ar)) if (typeof v === 'string') expect(v, k).toMatch(ARABIC);
  });
  it('every screen error code has a message in both languages', () => {
    expect(Object.keys(DRIVER_SCREENS_TEXT.ar.errors).sort()).toEqual(Object.keys(DRIVER_SCREENS_TEXT.en.errors).sort());
  });
  it('dynamic Arabic sentences use Arabic-Indic digits and the dual / plural forms', () => {
    const t = DRIVER_SCREENS_TEXT.ar;
    expect(t.today.boardedOf(3, 10, 'ar')).toMatch(ARABIC_INDIC);
    expect(t.profile.expiredBody('2026-03-01', 2, 'ar')).toContain('منذ يومين');
    expect(t.profile.soonBody('2026-03-01', 1, 'ar')).toContain('بعد يوم واحد');
    expect(t.profile.soonBody('2026-03-01', 0, 'ar')).toContain('اليوم');
    expect(t.manifest.confirmRemaining(1, 'ar')).toContain('راكب واحد');
    expect(t.manifest.confirmRemaining(2, 'ar')).toContain('راكبان');
    expect(t.manifest.confirmRemaining(5, 'ar')).toContain('ركاب');
    expect(DRIVER_SCREENS_TEXT.en.today.boardedOf(3, 10, 'en')).not.toMatch(ARABIC_INDIC);
  });
});

describe('pure helpers', () => {
  it('licenseState: unknown / expired / soon (0..30 days) / ok', () => {
    expect(licenseState(null)).toBe('unknown');
    expect(licenseState(undefined)).toBe('unknown');
    expect(licenseState(-1)).toBe('expired');
    expect(licenseState(0)).toBe('soon');
    expect(licenseState(30)).toBe('soon');
    expect(licenseState(31)).toBe('ok');
  });
  it('classifyScreenError maps the database answers to codes, never to raw text', () => {
    expect(classifyScreenError('P0002', 'trip not found')).toBe('trip_not_found');
    expect(classifyScreenError('P0002', 'driver not found')).toBe('driver_not_found');
    expect(classifyScreenError('23514', 'trip has not started')).toBe('not_started');
    expect(classifyScreenError('23514', 'trip cannot be ended')).toBe('cannot_end');
    expect(classifyScreenError('PT429', 'x')).toBe('rate_limited');
    expect(classifyScreenError('28000', 'not authenticated')).toBe('not_signed_in');
    expect(classifyScreenError(undefined, 'Failed to fetch')).toBe('network');
    expect(classifyScreenError('XX000', 'boom')).toBe('unknown');
  });
  it('groupTrips: still-open past trips, today, upcoming; a finished past trip is not listed', () => {
    const now = new Date(2026, 10, 24, 12, 0, 0);
    const d = (day: number, h: number) => new Date(2026, 10, day, h, 0, 0).toISOString();
    const g = groupTrips([
      trip({ trip_id: 'up', departure_at: d(26, 8) }), trip({ trip_id: 'old-open', departure_at: d(22, 8), status: 'in_progress' }),
      trip({ trip_id: 'old-done', departure_at: d(22, 9), status: 'completed' }), trip({ trip_id: 'today-late', departure_at: d(24, 18), status: 'scheduled' }),
      trip({ trip_id: 'today-early', departure_at: d(24, 6), status: 'completed' }),
    ], now);
    expect(g.earlier.map((t) => t.trip_id)).toEqual(['old-open']);
    expect(g.today.map((t) => t.trip_id)).toEqual(['today-early', 'today-late']);
    expect(g.upcoming.map((t) => t.trip_id)).toEqual(['up']);
  });
});

describe('tab bar', () => {
  it('Arabic labels, four sections, the manifest keeps "Today" marked as the current section', () => {
    nav.path = '/driver/trips/abc';
    renderIn('ar', <DriverNav lang="ar" />);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'اليوم' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'الصعود' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'أقسام السائق' })).toBeTruthy();
  });
  it('the boarding tab is current on /driver/boarding and Today is not', () => {
    nav.path = '/driver/boarding';
    renderIn('en', <DriverNav lang="en" />);
    expect(screen.getByRole('link', { name: 'Boarding' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('Today', () => {
  it('groups the trips, links each to its manifest, and shows Arabic-Indic digits', async () => {
    trips.myTrips.mockResolvedValue([
      trip({ trip_id: 'open-old', departure_at: at(-1, 8), arrival_at: at(-1, 11), status: 'in_progress' }),
      trip({ trip_id: 'today', departure_at: at(0, 14), arrival_at: at(0, 17), status: 'scheduled', boarded: 0, expected: 12 }),
      trip({ trip_id: 'later', departure_at: at(2, 8), arrival_at: at(2, 11), status: 'scheduled' }),
    ]);
    renderIn('ar', <DriverToday lang="ar" />);
    expect(await screen.findByRole('heading', { name: 'رحلات لم تنتهِ' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'القادمة' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'اليوم' })).toHaveLength(2); // page title + group
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/driver/trips/open-old', '/driver/trips/today', '/driver/trips/later']);
    expect(screen.getAllByRole('link', { name: /^فتح الرحلة من Cairo إلى Alexandria/ })).toHaveLength(3); // the fixture trips share one route
    expect(document.body.textContent).toMatch(ARABIC_INDIC);
  });
  it('empty list -> the empty state, in Arabic', async () => {
    trips.myTrips.mockResolvedValue([]);
    renderIn('ar', <DriverToday lang="ar" />);
    expect(await screen.findByText('لا توجد رحلات مسندة إليك الآن')).toBeTruthy();
  });
  it('a failed load shows the ARABIC message for the code and a retry that reloads', async () => {
    const { BoardError } = await import('./driverApi');
    trips.myTrips.mockRejectedValueOnce(new BoardError('network')).mockResolvedValueOnce([]);
    renderIn('ar', <DriverToday lang="ar" />);
    expect(await screen.findByText(/لا يوجد اتصال/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'حاول مرة أخرى' }));
    expect(await screen.findByText('لا توجد رحلات مسندة إليك الآن')).toBeTruthy();
    expect(trips.myTrips).toHaveBeenCalledTimes(2);
  });
});

describe('Trip manifest and End trip', () => {
  it('lists passengers with seats, boarded count, subscriber marker, stops and reference; no phone is on the screen', async () => {
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    expect(await screen.findByText('Karim Adel')).toBeTruthy();
    expect(screen.getByText('Nour Samir')).toBeTruthy();
    expect(screen.getByText('مشترك')).toBeTruthy();
    expect(screen.getByText('Maadi')).toBeTruthy();
    expect(screen.getByText('BK-100')).toBeTruthy();
    expect(screen.getByTestId('manifest-summary').textContent).toMatch(ARABIC_INDIC);
    expect(document.body.textContent).not.toMatch(/\+20|01\d{9}/);
    expect(screens.manifest).toHaveBeenCalledWith('t1');
  });
  it('the scan link carries the trip id', async () => {
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    expect((await screen.findByRole('link', { name: 'مسح الركاب' })).getAttribute('href')).toBe('/driver/boarding?trip=t1');
  });
  it('end trip: confirm dialog states the counts, then ONE call, then the done message and no more End button', async () => {
    screens.endTrip.mockResolvedValue({ trip_id: 't1', status: 'completed', ended_at: '2026-11-24T10:00:00Z', changed: true, expected: 4, boarded: 3, remaining: 1 });
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await userEvent.click(await screen.findByTestId('end-trip'));
    const dialog = screen.getByRole('dialog', { name: 'إنهاء هذه الرحلة؟' });
    expect(dialog.textContent).toContain('لا يمكن التراجع');
    expect(dialog.textContent).toContain('لم يصعد'); // 4 seats expected, 2 boarded: some are still on the pavement
    expect(screens.endTrip).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'إنهاء الرحلة' }));
    expect(await screen.findByText('تم إنهاء الرحلة')).toBeTruthy();
    expect(screens.endTrip).toHaveBeenCalledTimes(1);
    expect(screens.endTrip).toHaveBeenCalledWith('t1');
    expect(screen.queryByTestId('end-trip')).toBeNull();
    expect(screen.queryByRole('link', { name: 'مسح الركاب' })).toBeNull();
  });
  it('cancelling the dialog ends nothing', async () => {
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await userEvent.click(await screen.findByTestId('end-trip'));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'إنهاء هذه الرحلة؟' })).getByRole('button', { name: 'ليس الآن' }));
    expect(screens.endTrip).not.toHaveBeenCalled();
  });
  it('a server refusal is shown in the driver language and the trip stays open', async () => {
    const { ScreenError: SE } = await import('./driverScreensApi');
    screens.endTrip.mockRejectedValue(new SE('not_started'));
    renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await userEvent.click(await screen.findByTestId('end-trip'));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'إنهاء هذه الرحلة؟' })).getByRole('button', { name: 'إنهاء الرحلة' }));
    expect(await screen.findByText('لم تبدأ هذه الرحلة بعد.')).toBeTruthy();
    expect(screen.getByTestId('end-trip')).toBeTruthy();
  });
  it('before departure the End button is disabled and says why', async () => {
    trips.myTrips.mockResolvedValue([trip({ status: 'scheduled', departure_at: '2099-01-01T06:00:00Z', arrival_at: '2099-01-01T09:00:00Z' })]);
    renderIn('en', <DriverTripManifest tripId="t1" lang="en" />);
    const end = await screen.findByTestId('end-trip');
    expect((end as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You can end the trip after its departure time.')).toBeTruthy();
  });
  it('a finished trip has no End button and no scan link', async () => {
    trips.myTrips.mockResolvedValue([trip({ status: 'completed' })]);
    renderIn('en', <DriverTripManifest tripId="t1" lang="en" />);
    await screen.findByText('Karim Adel');
    expect(screen.queryByTestId('end-trip')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Scan passengers' })).toBeNull();
  });
  it('a trip that is not yours shows the error state, not a passenger list', async () => {
    screens.manifest.mockRejectedValue(new ScreenError('trip_not_found'));
    renderIn('ar', <DriverTripManifest tripId="t9" lang="ar" />);
    expect(await screen.findByText('هذه الرحلة غير مسندة إليك.')).toBeTruthy();
    expect(screen.queryByText('Karim Adel')).toBeNull();
  });
  it('has no axe violations in Arabic', async () => {
    const { container } = renderIn('ar', <DriverTripManifest tripId="t1" lang="ar" />);
    await screen.findByText('Karim Adel');
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('My profile', () => {
  it('expired licence -> an error alert in Arabic with the day count', async () => {
    screens.myProfile.mockResolvedValue(profile({ license_expiry: '2026-11-01', license_days_left: -23 }));
    renderIn('ar', <DriverProfile lang="ar" />);
    expect(await screen.findByText('رخصتك منتهية')).toBeTruthy();
    expect(document.body.textContent).toContain('منذ');
  });
  it('licence within 30 days -> the warning', async () => {
    screens.myProfile.mockResolvedValue(profile({ license_expiry: '2026-12-10', license_days_left: 16 }));
    renderIn('en', <DriverProfile lang="en" />);
    expect(await screen.findByText('Your licence expires soon')).toBeTruthy();
    expect(screen.queryByText('Your licence has expired')).toBeNull();
  });
  it('licence far away -> no warning, a quiet "days left" hint, and the Arabic-Indic trip count', async () => {
    renderIn('ar', <DriverProfile lang="ar" />);
    expect(await screen.findByText('Hassan Ali')).toBeTruthy();
    expect(screen.queryByText('رخصتك منتهية')).toBeNull();
    expect(screen.queryByText('رخصتك على وشك الانتهاء')).toBeNull();
    expect(screen.getByTestId('license-expiry').textContent).toMatch(/متبقي/);
    expect(screen.getByText('١٢')).toBeTruthy();
  });
  it('no licence on file -> says so, and asks the company to add it', async () => {
    screens.myProfile.mockResolvedValue(profile({ license_number: null, license_expiry: null, license_days_left: null }));
    renderIn('en', <DriverProfile lang="en" />);
    expect(await screen.findByText('No licence expiry on file')).toBeTruthy();
    expect(screen.getAllByText('Not on file').length).toBeGreaterThanOrEqual(2);
  });
  it('a failed load shows the Arabic error and retries', async () => {
    screens.myProfile.mockRejectedValueOnce(new ScreenError('driver_not_found')).mockResolvedValueOnce(profile());
    renderIn('ar', <DriverProfile lang="ar" />);
    expect(await screen.findByText(/تعذّر العثور على سجل السائق/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'حاول مرة أخرى' }));
    expect(await screen.findByText('Hassan Ali')).toBeTruthy();
  });
});

describe('Inbox tab', () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({ id, event_key: null, subject: `S${id}`, body: `B${id}`, link: null, created_at: '2026-11-24T08:00:00Z', is_read: false, company_name: 'Delta Express', ...over });
  it('empty -> Arabic empty state', async () => {
    renderIn('ar', <DriverInbox lang="ar" />);
    expect(await screen.findByText('لا توجد إشعارات بعد.')).toBeTruthy();
  });
  it('lists notices, opening one marks only that one read, "mark all" marks everything', async () => {
    inbox.fetchInbox.mockResolvedValue([item('1'), item('2', { is_read: true })]);
    renderIn('ar', <DriverInbox lang="ar" />);
    await userEvent.click(await screen.findByRole('button', { name: /S1/ }));
    expect(inbox.markRead).toHaveBeenCalledWith(expect.anything(), ['1']);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
    inbox.fetchInbox.mockResolvedValue([item('3')]);
    await userEvent.click(screen.getByRole('button', { name: 'تحديث' }));
    await userEvent.click(await screen.findByRole('button', { name: 'تحديد الكل كمقروء' }));
    expect(inbox.markRead).toHaveBeenLastCalledWith(expect.anything());
  });
  it('a failed first load shows the error state', async () => {
    inbox.fetchInbox.mockRejectedValue(new Error('x'));
    renderIn('ar', <DriverInbox lang="ar" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'حاول مرة أخرى' })).toBeTruthy();
  });
});
