// @vitest-environment jsdom
import axe, { type AxeResults } from 'axe-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardingStats, DriverTrip, ScanCard, ScanVerdict } from '../driverApi';

const api = { myTrips: vi.fn(), stats: vi.fn(), scanIdentity: vi.fn(), confirmBoarding: vi.fn() };
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({}) }));
vi.mock('../driverApi', async (orig) => ({ ...(await orig<typeof import('../driverApi')>()), createDriverApi: () => api }));
vi.mock('../QrScanner', () => ({ QrScanner: ({ active, onToken }: { active: boolean; onToken: (t: string) => void }) => (active ? <button onClick={() => onToken('SCANNED')}>fake-camera-hit</button> : null) }));

import { DriverBoarding } from '../DriverBoarding';
import { BoardError } from '../driverApi';
import { VERDICT_TEXT } from '../scan-card';

const trip = (n: number, over: Partial<DriverTrip> = {}): DriverTrip => ({ trip_id: `t${n}`, company_name: 'Delta Express', origin_name: n === 1 ? 'Cairo' : 'Tanta', destination_name: 'Alexandria', departure_at: '2026-11-09T06:30:00Z', arrival_at: '2026-11-09T10:00:00Z', status: 'boarding', expected: 10, boarded: 2, remaining: 8, ...over });
const stats = (b: number): BoardingStats => ({ expected: 10, boarded: b, remaining: 10 - b });
const ok = (i: number, b: number) => ({ result: 'boarded' as const, ticket_index: i, boarded_at: '2026-11-09T06:40:00Z', ...stats(b) });
const card = (over: Partial<ScanCard> = {}): ScanCard => ({
  verdict: 'ok_not_yet_boarded', can_board: true, kind: 'ticket', verified: true, student: null, subscription: null, has_other_company_subscription: false,
  booking: { reference: 'BK-100', seats: 1, seats_boarded: 0, status: 'confirmed', payment_status: 'paid', ticket_id: 'tk1', boarded: false, is_subscriber_booking: false }, ...over,
});
const mount = () => render(<DriverBoarding />);
const enter = async (code: string) => { await userEvent.type(await screen.findByLabelText('Or enter the ticket code or MASAR ID'), code); await userEvent.click(screen.getByRole('button', { name: 'Check passenger' })); };
const boardNow = async () => userEvent.click(await screen.findByRole('button', { name: 'Board now' }));
const scanAndBoard = async (code: string) => { await enter(code); await boardNow(); };

beforeEach(() => {
  api.myTrips.mockReset().mockResolvedValue([trip(1), trip(2)]);
  api.stats.mockReset().mockImplementation(async (id: string) => (id === 't1' ? stats(2) : stats(5)));
  api.scanIdentity.mockReset().mockResolvedValue(card());
  api.confirmBoarding.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true });
});
afterEach(cleanup);

describe('driver boarding (MASAR look)', () => {
  it('shows a skeleton, then assigned trips as big cards with the first one selected', async () => {
    mount();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    const list = await screen.findByRole('region', { name: 'Assigned trips' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false');
    expect(buttons[0]!.className).toContain('min-h-16');
    await waitFor(() => expect(screen.getByTestId('stat-expected').textContent).toBe('10'));
    expect(screen.getByTestId('stat-boarded').textContent).toBe('2');
    expect(screen.getByTestId('stat-remaining').textContent).toBe('8');
  });

  it('a single trip skips the picker and goes straight to its details', async () => {
    api.myTrips.mockResolvedValue([trip(1)]);
    mount();
    expect(await screen.findByRole('region', { name: 'Selected trip' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Assigned trips' })).toBeNull();
    expect(screen.getByText('Delta Express')).toBeTruthy();
    await waitFor(() => expect(api.stats).toHaveBeenCalledWith('t1'));
  });

  it('exactly one heading', async () => {
    mount();
    await screen.findByRole('region', { name: 'Assigned trips' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('choosing another trip loads its figures and clears the last result', async () => {
    api.confirmBoarding.mockResolvedValue(ok(1, 3));
    mount();
    await scanAndBoard('A');
    await screen.findByText('Boarded: ticket 1');
    await userEvent.click(within(screen.getByRole('region', { name: 'Assigned trips' })).getAllByRole('button')[1]!);
    expect(api.stats).toHaveBeenLastCalledWith('t2');
    await waitFor(() => expect(screen.getByTestId('stat-boarded').textContent).toBe('5'));
    expect(screen.queryByTestId('scan-outcome')).toBeNull();
  });

  it('scanning shows the card and boards NOBODY: only "Board now" does (D2)', async () => {
    mount();
    await enter('MALAKY:TICKET:abc');
    expect(api.scanIdentity).toHaveBeenCalledWith('t1', 'MALAKY:TICKET:abc');
    const c = await screen.findByTestId('scan-card');
    expect(c.getAttribute('data-verdict')).toBe('ok_not_yet_boarded');
    expect(api.confirmBoarding).not.toHaveBeenCalled();
    expect(screen.getByTestId('stat-boarded').textContent).toBe('2');
    expect((screen.getByLabelText('Or enter the ticket code or MASAR ID') as HTMLInputElement).value).toBe('');
  });

  it('a good confirmation: success message, figures and meter update, short vibration, card closes', async () => {
    api.confirmBoarding.mockResolvedValue(ok(3, 3));
    mount();
    await scanAndBoard('MALAKY:TICKET:abc');
    expect(api.confirmBoarding).toHaveBeenCalledWith('t1', 'tk1');          // the ticket id from the card, never a company or driver id
    const out = await screen.findByTestId('scan-outcome');
    expect(within(out).getByRole('status').textContent).toBe('Boarded: ticket 3');
    expect(screen.getByTestId('stat-boarded').textContent).toBe('3');
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('3');
    expect(navigator.vibrate).toHaveBeenCalledWith(60);
    expect(screen.queryByTestId('scan-card')).toBeNull();
  });

  it('a subscriber card names the student, plan and today\'s use; the outcome names the direction', async () => {
    api.scanIdentity.mockResolvedValue(card({ kind: 'qr', student: { name: 'Mona Ali', masar_id: 'MSR-AB23-XY9Z' },
      subscription: { state: 'valid', plan_name: 'Term plan', valid_to: '2026-12-31', days_left: 52, direction: 'go', go_used: false, return_used: false },
      booking: { reference: 'BK-7', seats: 1, seats_boarded: 0, status: 'confirmed', payment_status: 'paid', ticket_id: 'tk7', boarded: false, is_subscriber_booking: true } }));
    api.confirmBoarding.mockResolvedValue({ ...ok(1, 3), subscriber: { direction: 'go', member_name: 'Mona Ali', masar_id: 'MSR-AB23-XY9Z' } });
    mount();
    await enter('MQ1.x');
    const c = await screen.findByTestId('scan-card');
    expect(within(c).getByText('Mona Ali')).toBeTruthy();
    expect(within(c).getByText('MSR-AB23-XY9Z')).toBeTruthy();
    expect(within(c).getByText('Term plan')).toBeTruthy();
    expect(c.textContent).toMatch(/52 days left/);
    expect(c.textContent).toMatch(/Go not used · Return not used/);
    await boardNow();
    expect((await screen.findByTestId('scan-outcome')).textContent).toMatch(/Boarded: Mona Ali \(Subscriber, go\)/);
  });

  it('a typed MASAR ID is sent as typed (the server normalises it) and the card says UNVERIFIED in both languages', async () => {
    api.scanIdentity.mockResolvedValue(card({ kind: 'masar_id', verified: false, student: { name: 'Mona Ali', masar_id: 'MSR-AB23-XY9Z' } }));
    mount();
    await enter('msr-ab23-xy9z');
    expect(api.scanIdentity).toHaveBeenCalledWith('t1', 'msr-ab23-xy9z');
    const c = await screen.findByTestId('scan-card');
    expect(c.textContent).toContain('غير موثّق: اطلب إثبات هوية');
    expect(c.textContent).toContain('Unverified: ask for a photo ID');
  });

  it('"Not now" closes the card without boarding anyone', async () => {
    mount();
    await enter('A');
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('scan-card')).toBeNull();
    expect(api.confirmBoarding).not.toHaveBeenCalled();
  });

  it.each(Object.keys(VERDICT_TEXT).filter((v) => v !== 'ok_not_yet_boarded') as ScanVerdict[])('verdict %s: written in Arabic and English, and boarding is NOT offered', async (verdict) => {
    api.scanIdentity.mockResolvedValue(card({ verdict, can_board: false }));
    mount();
    await enter('A');
    const c = await screen.findByTestId('scan-card');
    expect(c.getAttribute('data-verdict')).toBe(verdict);
    expect(c.textContent).toContain(VERDICT_TEXT[verdict].ar);
    expect(c.textContent).toContain(VERDICT_TEXT[verdict].en);
    expect(screen.queryByRole('button', { name: 'Board now' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('someone with no tie to the company: only the MASAR ID, no name; another-company subscriber is a bare yes', async () => {
    api.scanIdentity.mockResolvedValue(card({ verdict: 'no_subscription', can_board: false, kind: 'qr', booking: null, has_other_company_subscription: true, student: { name: null, masar_id: 'MSR-AB23-XY9Z' } }));
    mount();
    await enter('A');
    const c = await screen.findByTestId('scan-card');
    expect(within(c).getByText('MSR-AB23-XY9Z')).toBeTruthy();
    expect(c.textContent).toContain('Subscribed with another company only');
    expect(c.textContent).toContain('لديه اشتراك مع شركة أخرى فقط');
  });

  it('an already-boarded ticket is a warning, not a success', async () => {
    api.confirmBoarding.mockResolvedValue({ ...ok(2, 2), result: 'already_boarded' });
    mount();
    await scanAndBoard('X');
    const out = await screen.findByTestId('scan-outcome');
    expect(out.textContent).toMatch(/Already boarded \(ticket 2,/);
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('a refusal at confirmation (the server checks again) shows its wording and closes the card', async () => {
    api.confirmBoarding.mockRejectedValue(new BoardError('subscription_invalid'));
    mount();
    await scanAndBoard('X');
    expect((await screen.findByRole('alert')).textContent).toContain('not active today');
    expect(screen.queryByTestId('scan-card')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('an unrecognised code is an assertive error with the server wording and no retry button', async () => {
    api.scanIdentity.mockRejectedValue(new BoardError('invalid_code'));
    mount();
    await enter('X');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Code not recognised');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('an invalid ticket is an assertive error with no retry button', async () => {
    api.scanIdentity.mockRejectedValue(new BoardError('invalid_ticket'));
    mount();
    await enter('X');
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid ticket.');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('no signal: says the scan was not recorded and Try again re-sends the same code', async () => {
    api.scanIdentity.mockRejectedValueOnce(new BoardError('network')).mockResolvedValueOnce(card());
    mount();
    await enter('MALAKY:TICKET:xyz');
    expect((await screen.findByRole('alert')).textContent).toContain('not recorded');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('scan-card');
    expect(api.scanIdentity).toHaveBeenCalledTimes(2);
    expect(api.scanIdentity).toHaveBeenLastCalledWith('t1', 'MALAKY:TICKET:xyz');
  });

  it('cannot double-submit while a scan is in flight', async () => {
    let done!: (v: ScanCard) => void;
    api.scanIdentity.mockImplementation(() => new Promise((r) => { done = r; }));
    mount();
    await userEvent.type(await screen.findByLabelText('Or enter the ticket code or MASAR ID'), 'A');
    const btn = screen.getByRole('button', { name: 'Check passenger' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(btn);
    fireEvent.submit(btn.closest('form')!);
    expect(api.scanIdentity).toHaveBeenCalledTimes(1);
    await act(async () => { done(card()); });
  });

  it('cannot double-confirm while the confirmation is in flight', async () => {
    let done!: (v: ReturnType<typeof ok>) => void;
    api.confirmBoarding.mockImplementation(() => new Promise((r) => { done = r; }));
    mount();
    await enter('A');
    const btn = await screen.findByRole('button', { name: 'Board now' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(btn);
    expect(api.confirmBoarding).toHaveBeenCalledTimes(1);
    await act(async () => { done(ok(1, 3)); });
  });

  it('the camera button toggles and a camera hit goes through the same two steps', async () => {
    api.confirmBoarding.mockResolvedValue(ok(4, 4));
    mount();
    const scan = await screen.findByRole('button', { name: 'Scan QR with camera' });
    expect(scan.className).toContain('h-14');
    await userEvent.click(scan);
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeTruthy();
    await userEvent.click(screen.getByText('fake-camera-hit'));
    await boardNow();
    await screen.findByText('Boarded: ticket 4');
    expect(api.scanIdentity).toHaveBeenCalledWith('t1', 'SCANNED');
  });

  it('shows an offline notice when the phone loses signal and hides it when it returns', async () => {
    mount();
    await screen.findByRole('region', { name: 'Assigned trips' });
    expect(screen.queryByText('You are offline')).toBeNull();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('You are offline')).toBeTruthy();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByText('You are offline')).toBeNull();
  });

  it('load failure offers Try again that reloads; empty list explains itself', async () => {
    api.myTrips.mockRejectedValueOnce(new BoardError('network')).mockResolvedValueOnce([]);
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain('No connection');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No trips are assigned to you right now')).toBeTruthy();
    expect(api.myTrips).toHaveBeenCalledTimes(2);
  });

  it('keeps the hooks the browser tests rely on (manual-code id, stat and outcome test ids)', async () => {
    api.confirmBoarding.mockResolvedValue(ok(1, 3));
    const { container } = mount();
    await scanAndBoard('A');
    await screen.findByTestId('scan-outcome');
    expect(container.querySelector('#manual-code')).toBeTruthy();
    for (const id of ['stat-expected', 'stat-boarded', 'stat-remaining']) expect(screen.getByTestId(id)).toBeTruthy();
  });

  const serious = (r: AxeResults) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  const axeOpts = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations' as const] };

  it('axe: no serious or critical violations with a result on screen, and while offline', async () => {
    api.confirmBoarding.mockResolvedValue(ok(1, 3));
    const { container } = mount();
    await scanAndBoard('A');
    await screen.findByTestId('scan-outcome');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(serious(await axe.run(container, axeOpts))).toEqual([]);
  });

  it.each(['ok_not_yet_boarded', 'no_subscription', 'qr_expired'] as ScanVerdict[])('axe: the scan card (%s) has no serious or critical violations', async (verdict) => {
    api.scanIdentity.mockResolvedValue(card({ verdict, can_board: verdict === 'ok_not_yet_boarded', verified: false, student: { name: 'Mona Ali', masar_id: 'MSR-AB23-XY9Z' } }));
    const { container } = mount();
    await enter('A');
    await screen.findByTestId('scan-card');
    expect(serious(await axe.run(container, axeOpts))).toEqual([]);
  });
});
