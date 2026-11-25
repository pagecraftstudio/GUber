// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { submit, enforced } = vi.hoisted(() => ({ submit: vi.fn(), enforced: vi.fn() }));
vi.mock('./actions', () => ({ submitRatingAction: submit }));
vi.mock('@/features/captcha/actions', () => ({ captchaEnforcedAction: enforced }));

import { ratingsService } from './service';
import { ratingErrorKey, RATING_TEXT } from './text';
import { toCompanyRating, toDriverRating, toRateable } from './types';
import { RatingsPanel } from './ui/RatingsPanel';
import { DriverRatingsPanel } from './ui/DriverRatingsPanel';
import { DsLangProvider } from '@/ds/lang';
import { mapDbError } from '@/lib/db/map-error';
import type { RateableBooking } from './types';

const item = (over: Partial<RateableBooking> = {}): RateableBooking => ({
  bookingId: '11111111-1111-4111-8111-111111111111', tripId: '22222222-2222-4222-8222-222222222222', companyName: 'Delta Bus', originName: 'Cairo', destinationName: 'Alexandria',
  departureAt: '2026-11-24T08:00:00Z', endedAt: '2026-11-24T10:00:00Z', state: 'open', opensAt: '2026-11-24T11:00:00Z', closesAt: '2026-12-08T10:00:00Z', myTripStars: null, myDriverStars: null, ...over,
});

beforeEach(() => { submit.mockReset().mockResolvedValue({ ok: true }); enforced.mockReset().mockResolvedValue(false); });
afterEach(cleanup);

describe('mapping and validation', () => {
  it('maps the database rows', () => {
    expect(toRateable({ booking_id: 'b', trip_id: 't', company_name: 'C', origin_name: 'A', destination_name: 'B', departure_at: 'd', ended_at: 'e', state: 'open', opens_at: 'o', closes_at: 'c', my_trip_stars: null, my_driver_stars: null }).bookingId).toBe('b');
    expect(toCompanyRating({ company_id: 'c', ratings: 7, average: '4.3' })).toEqual({ companyId: 'c', ratings: 7, average: 4.3 });
    expect(toCompanyRating({ company_id: 'c', ratings: 2, average: null }).average).toBeNull();
    expect(toDriverRating({ driver_id: 'd', full_name: 'N', ratings: 1, average: '5.0', distribution: [0, 0, 0, 0, 1] }).average).toBe(5);
  });
  it('the service rejects stars outside 1..5 and a non-uuid booking before any call', async () => {
    const rpc = vi.fn();
    const c = { db: { rpc } } as never;
    for (const bad of [{ bookingId: 'x', tripStars: 3, driverStars: 3 }, { bookingId: item().bookingId, tripStars: 0, driverStars: 3 }, { bookingId: item().bookingId, tripStars: 3, driverStars: 6 }, { bookingId: item().bookingId, tripStars: 2.5, driverStars: 3 }, null]) {
      await expect(ratingsService.submit(c, bad)).rejects.toMatchObject({ code: 'validation' });
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it('the service sends exactly the three values the RPC takes (no company, no driver, no user)', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await ratingsService.submit({ db: { rpc } } as never, { bookingId: item().bookingId, tripStars: 5, driverStars: 4, companyId: 'evil', driverId: 'evil' });
    expect(rpc).toHaveBeenCalledWith('submit_trip_rating', { p_booking_id: item().bookingId, p_trip_stars: 5, p_driver_stars: 4 });
  });
  it('database messages become stable details and then message keys', () => {
    const cases: [string, string, string, string][] = [['23514', 'not boarded', 'rating_not_boarded', 'not_boarded'], ['23514', 'rating not open yet', 'rating_not_open', 'not_open'], ['23514', 'rating window closed', 'rating_closed', 'closed'], ['23514', 'trip not rateable', 'rating_not_rateable', 'not_rateable'], ['23505', 'already rated', 'already_rated', 'already_rated'], ['22023', 'invalid stars', 'invalid_stars', 'invalid_stars']];
    for (const [code, msg, detail, key] of cases) {
      const e = mapDbError({ code, message: msg });
      expect(e.detail, msg).toBe(detail);
      expect(ratingErrorKey(e.code, e.detail)).toBe(key);
    }
    expect(ratingErrorKey('forbidden', 'captcha_required')).toBe('captcha');
    expect(ratingErrorKey('internal')).toBe('unknown');
  });
  it('both languages have the same error keys', () => {
    expect(Object.keys(RATING_TEXT.ar.errors).sort()).toEqual(Object.keys(RATING_TEXT.en.errors).sort());
  });
});

describe('RatingsPanel', () => {
  it('shows nothing when there is nothing to rate', () => {
    const { container } = render(<RatingsPanel items={[item({ state: 'rated' }), item({ state: 'closed' })]} />);
    expect(container.textContent).toBe('');
  });
  it('an open trip: two star groups, send is disabled until both are chosen, then it submits the three values', async () => {
    render(<RatingsPanel items={[item()]} />);
    const send = screen.getByRole('button', { name: 'Send rating' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText('5 stars out of 5')[0]!);
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getAllByLabelText('4 stars out of 5')[1]!);
    await waitFor(() => expect(send.disabled).toBe(false));
    fireEvent.click(send);
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ bookingId: item().bookingId, tripStars: 5, driverStars: 4 }, null));
    await waitFor(() => expect(screen.getByText('Thanks, your rating was saved.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull();
  });
  it('a refusal from the server is shown in words and the card stays', async () => {
    submit.mockResolvedValue({ ok: false, code: 'conflict', detail: 'already_rated' });
    render(<RatingsPanel items={[item()]} />);
    fireEvent.click(screen.getAllByLabelText('3 stars out of 5')[0]!);
    fireEvent.click(screen.getAllByLabelText('3 stars out of 5')[1]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Send rating' }));
    await waitFor(() => expect(screen.getByText('You already rated this trip.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Send rating' })).toBeTruthy();
  });
  it('a trip that opens later shows when, and no stars', () => {
    render(<RatingsPanel items={[item({ state: 'not_open_yet' })]} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText(/^Opens /)).toBeTruthy();
  });
  it('Arabic: right to left, Arabic labels, one tap switches back', () => {
    const { container } = render(<RatingsPanel items={[item()]} initialLang="ar" />);
    expect(container.querySelector('section')?.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('button', { name: 'أرسل التقييم' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('button', { name: 'Send rating' })).toBeTruthy();
  });
  it('captcha enforced: the send button waits for a token (fails closed without a site key)', async () => {
    enforced.mockResolvedValue(true);
    render(<RatingsPanel items={[item()]} />);
    fireEvent.click(screen.getAllByLabelText('5 stars out of 5')[0]!);
    fireEvent.click(screen.getAllByLabelText('5 stars out of 5')[1]!);
    await waitFor(() => expect(screen.getByText('The check is not available right now. Try again later.')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Send rating' }) as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('DriverRatingsPanel (managers)', () => {
  const rows = [{ driverId: 'd1', fullName: 'Omar', ratings: 4, average: 4.5, distribution: [0, 0, 1, 1, 2] }, { driverId: 'd2', fullName: 'Salma', ratings: 0, average: null, distribution: [0, 0, 0, 0, 0] }];
  it('lists average, count and distribution, and says so when a driver has none', () => {
    render(<DsLangProvider value="en"><DriverRatingsPanel rows={rows} /></DsLangProvider>);
    expect(screen.getByRole('row', { name: /Omar/ }).textContent).toContain('4.5');
    expect(screen.getByRole('row', { name: /Omar/ }).textContent).toContain('2 · 1 · 1 · 0 · 0');
    expect(screen.getByText('No ratings yet')).toBeTruthy();
  });
  it('Arabic uses Arabic-Indic digits', () => {
    render(<DsLangProvider value="ar"><DriverRatingsPanel rows={rows} /></DsLangProvider>);
    expect(screen.getByRole('row', { name: /Omar/ }).textContent).toMatch(/[٠-٩]/);
  });
  it('renders nothing without drivers', () => {
    const { container } = render(<DsLangProvider value="en"><DriverRatingsPanel rows={[]} /></DsLangProvider>);
    expect(container.textContent).toBe('');
  });
});
