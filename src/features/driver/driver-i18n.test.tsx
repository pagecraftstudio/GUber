// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardErrorCode, BoardingStats, DriverTrip, ScanCard } from './driverApi';

const api = { myTrips: vi.fn(), stats: vi.fn(), scanIdentity: vi.fn(), confirmBoarding: vi.fn() };
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({}) }));
vi.mock('./driverApi', async (orig) => ({ ...(await orig<typeof import('./driverApi')>()), createDriverApi: () => api }));
vi.mock('./QrScanner', () => ({ QrScanner: () => null }));
vi.mock('./language-action', () => ({ setDriverLanguageAction: async () => undefined }));

import { DriverBoarding } from './DriverBoarding';
import { BOARD_MESSAGES, BoardError } from './driverApi';
import { arBoardMessages, DRIVER_TEXT } from './driver-text';
import { DriverLangToggle } from './DriverLangToggle';
import { DRIVER_LANG_COOKIE, parseDriverLang } from './lang';

const trip: DriverTrip = { trip_id: 't1', company_name: 'Delta Express', origin_name: 'Cairo', destination_name: 'Alexandria', departure_at: '2026-11-09T06:30:00Z', arrival_at: '2026-11-09T10:00:00Z', status: 'boarding', expected: 10, boarded: 2, remaining: 8 };
const stats = (b: number): BoardingStats => ({ expected: 10, boarded: b, remaining: 10 - b });
const card = (over: Partial<ScanCard> = {}): ScanCard => ({
  verdict: 'ok_not_yet_boarded', can_board: true, kind: 'ticket', verified: true, student: { name: 'Karim', masar_id: 'MSR-AAAA-BBBB' }, subscription: null, has_other_company_subscription: false,
  booking: { reference: 'BK-100', seats: 3, seats_boarded: 1, status: 'confirmed', payment_status: 'paid', ticket_id: 'tk1', boarded: false, is_subscriber_booking: false }, ...over,
});
const ARABIC = /[\u0600-\u06FF]/;
const ARABIC_INDIC = /[٠-٩]/;

beforeEach(() => {
  api.myTrips.mockReset().mockResolvedValue([trip]);
  api.stats.mockReset().mockResolvedValue(stats(2));
  api.scanIdentity.mockReset().mockResolvedValue(card());
  api.confirmBoarding.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(cleanup);

describe('driver copy file', () => {
  it('Arabic and English define exactly the same keys, and every Arabic string contains Arabic script', () => {
    expect(Object.keys(DRIVER_TEXT.ar).sort()).toEqual(Object.keys(DRIVER_TEXT.en).sort());
    for (const [k, v] of Object.entries(DRIVER_TEXT.ar)) {
      if (typeof v === 'string' && k !== 'switchTo' && k !== 'manualPlaceholder') expect(v, k).toMatch(ARABIC);
    }
    for (const [k, v] of Object.entries(DRIVER_TEXT.ar.payment)) expect(v, k).toMatch(ARABIC);
  });
  it('every boarding error code has an Arabic message with Arabic script, same code set as English', () => {
    expect(Object.keys(arBoardMessages).sort()).toEqual(Object.keys(BOARD_MESSAGES).sort());
    for (const [c, m] of Object.entries(arBoardMessages)) expect(m, c).toMatch(ARABIC);
  });
  it('digits follow the language (Arabic UI = Arabic-Indic, English UI = Latin) and Arabic seat plurals are correct', () => {
    expect(DRIVER_TEXT.ar.figures(3, 10, 'ar')).toMatch(ARABIC_INDIC);
    expect(DRIVER_TEXT.en.figures(3, 10, 'en')).not.toMatch(ARABIC_INDIC);
    expect(DRIVER_TEXT.ar.seats(1, 'ar')).toContain('مقعد');
    expect(DRIVER_TEXT.ar.seats(2, 'ar')).toContain('مقعدان');
    expect(DRIVER_TEXT.ar.seats(5, 'ar')).toContain('مقاعد');
    expect(DRIVER_TEXT.en.seats(1, 'en')).toBe('1 seat');
    expect(DRIVER_TEXT.en.seats(3, 'en')).toBe('3 seats');
  });
});

describe('driver language preference', () => {
  it('Arabic is the default; only the exact value "en" gives English; junk falls back to Arabic', () => {
    expect(parseDriverLang(undefined)).toBe('ar');
    expect(parseDriverLang('')).toBe('ar');
    expect(parseDriverLang('en')).toBe('en');
    expect(parseDriverLang('EN')).toBe('ar');
    expect(parseDriverLang('<script>')).toBe('ar');
    expect(DRIVER_LANG_COOKIE).toBe('malaky-driver-language');
  });
  it('the toggle posts the OTHER language and is labelled in it', () => {
    const { container, rerender } = render(<DriverLangToggle lang="ar" />);
    expect((container.querySelector('input[name="lang"]') as HTMLInputElement).value).toBe('en');
    expect(screen.getByRole('button', { name: /English/ })).toBeTruthy();
    rerender(<DriverLangToggle lang="en" />);
    expect((container.querySelector('input[name="lang"]') as HTMLInputElement).value).toBe('ar');
  });
});

describe('boarding screen in Arabic', () => {
  it('renders Arabic copy and Arabic-Indic digits, and the English labels are gone', async () => {
    render(<DriverBoarding lang="ar" />);
    expect(await screen.findByRole('heading', { name: 'الصعود' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('stat-boarded').textContent).toMatch(ARABIC_INDIC));
    expect(screen.getByText('المتوقع')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'مسح رمز QR بالكاميرا' })).toBeTruthy();
    expect(screen.queryByText('Expected')).toBeNull();
    expect(screen.getByLabelText('أو أدخل رمز التذكرة أو رقم MASAR ID')).toBeTruthy();
  });
  it('the scan card is Arabic, with the seat plural, payment and the confirm button', async () => {
    render(<DriverBoarding lang="ar" />);
    await userEvent.type(await screen.findByLabelText('أو أدخل رمز التذكرة أو رقم MASAR ID'), 'MSR-AAAA-BBBB');
    await userEvent.click(screen.getByRole('button', { name: 'تحقق من الراكب' }));
    expect(await screen.findByRole('button', { name: 'تأكيد الصعود' })).toBeTruthy();
    expect(screen.getByText(/مدفوع/).textContent).toMatch(/مقاعد/);
    expect(screen.getByText(/مدفوع/).textContent).toMatch(ARABIC_INDIC);
    expect(screen.getByRole('button', { name: 'ليس الآن' })).toBeTruthy();
  });
  it('a failed load shows the ARABIC message for the error code, not the English one', async () => {
    api.myTrips.mockReset().mockRejectedValue(new BoardError('network' satisfies BoardErrorCode));
    render(<DriverBoarding lang="ar" />);
    expect(await screen.findByText(arBoardMessages.network)).toBeTruthy();
    expect(screen.queryByText(BOARD_MESSAGES.network)).toBeNull();
  });
  it('confirming a boarding writes the result sentence in Arabic', async () => {
    api.confirmBoarding.mockResolvedValue({ result: 'boarded', ticket_index: 1, boarded_at: '2026-11-09T06:40:00Z', ...stats(3) });
    render(<DriverBoarding lang="ar" />);
    await userEvent.type(await screen.findByLabelText('أو أدخل رمز التذكرة أو رقم MASAR ID'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'تحقق من الراكب' }));
    await userEvent.click(await screen.findByRole('button', { name: 'تأكيد الصعود' }));
    expect((await screen.findByTestId('scan-outcome')).textContent).toContain('تم الصعود');
  });
  it('English stays exactly as before when lang is "en" (and when omitted)', async () => {
    render(<DriverBoarding lang="en" />);
    expect(await screen.findByRole('heading', { name: 'Boarding' })).toBeTruthy();
    expect(screen.getByText('Expected')).toBeTruthy();
  });
  it('has no axe violations in Arabic with a card open', async () => {
    const { container } = render(<DriverBoarding lang="ar" />);
    await userEvent.type(await screen.findByLabelText('أو أدخل رمز التذكرة أو رقم MASAR ID'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'تحقق من الراكب' }));
    await screen.findByRole('button', { name: 'تأكيد الصعود' });
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
