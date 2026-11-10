// @vitest-environment jsdom
import axe from 'axe-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DsFlagProvider } from '@/ds/shell/flag';
import type { BoardingStats, DriverTrip } from '../driverApi';

const api = { myTrips: vi.fn(), stats: vi.fn(), board: vi.fn() };
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({}) }));
vi.mock('../driverApi', async (orig) => ({ ...(await orig<typeof import('../driverApi')>()), createDriverApi: () => api }));
vi.mock('../QrScanner', () => ({ QrScanner: ({ active, onToken }: { active: boolean; onToken: (t: string) => void }) => (active ? <button onClick={() => onToken('SCANNED')}>fake-camera-hit</button> : null) }));

import { DriverBoarding } from '../DriverBoarding';
import { PageTitle } from '../PageTitle';
import { BoardError } from '../driverApi';

const trip = (n: number, over: Partial<DriverTrip> = {}): DriverTrip => ({ trip_id: `t${n}`, company_name: 'Delta Express', origin_name: n === 1 ? 'Cairo' : 'Tanta', destination_name: 'Alexandria', departure_at: '2026-11-09T06:30:00Z', arrival_at: '2026-11-09T10:00:00Z', status: 'boarding', expected: 10, boarded: 2, remaining: 8, ...over });
const stats = (b: number): BoardingStats => ({ expected: 10, boarded: b, remaining: 10 - b });
const ok = (i: number, b: number) => ({ result: 'boarded' as const, ticket_index: i, boarded_at: '2026-11-09T06:40:00Z', ...stats(b) });
const mount = (flipped = true) => render(<DsFlagProvider value={flipped}><PageTitle /><DriverBoarding /></DsFlagProvider>);
const enter = async (code: string) => { await userEvent.type(await screen.findByLabelText('Or enter the code'), code); await userEvent.click(screen.getByRole('button', { name: 'Board passenger' })); };

beforeEach(() => {
  api.myTrips.mockReset().mockResolvedValue([trip(1), trip(2)]);
  api.stats.mockReset().mockImplementation(async (id: string) => (id === 't1' ? stats(2) : stats(5)));
  api.board.mockReset();
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

  it('exactly one heading, and the old screen is untouched when the surface is not flipped', async () => {
    mount();
    await screen.findByRole('region', { name: 'Assigned trips' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    cleanup();
    mount(false);
    expect(await screen.findByRole('combobox')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scan ticket with camera' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('choosing another trip loads its figures and clears the last result', async () => {
    api.board.mockResolvedValue(ok(1, 3));
    mount();
    await enter('A');
    await screen.findByText('Boarded: ticket 1');
    await userEvent.click(within(screen.getByRole('region', { name: 'Assigned trips' })).getAllByRole('button')[1]!);
    expect(api.stats).toHaveBeenLastCalledWith('t2');
    await waitFor(() => expect(screen.getByTestId('stat-boarded').textContent).toBe('5'));
    expect(screen.queryByTestId('scan-outcome')).toBeNull();
  });

  it('a good scan: success message, figures and meter update, short vibration, input cleared', async () => {
    api.board.mockResolvedValue(ok(3, 3));
    mount();
    await enter('MALAKY:TICKET:abc');
    expect(api.board).toHaveBeenCalledWith('t1', 'MALAKY:TICKET:abc');
    const out = await screen.findByTestId('scan-outcome');
    expect(within(out).getByRole('status').textContent).toBe('Boarded: ticket 3');
    expect(screen.getByTestId('stat-boarded').textContent).toBe('3');
    expect(screen.getByRole('meter').getAttribute('aria-valuenow')).toBe('3');
    expect(navigator.vibrate).toHaveBeenCalledWith(60);
    expect((screen.getByLabelText('Or enter the code') as HTMLInputElement).value).toBe('');
  });

  it('an already-boarded ticket is a warning, not a success', async () => {
    api.board.mockResolvedValue({ ...ok(2, 2), result: 'already_boarded' });
    mount();
    await enter('X');
    const out = await screen.findByTestId('scan-outcome');
    expect(out.textContent).toMatch(/Already boarded \(ticket 2,/);
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 60, 80]);
  });

  it('an invalid ticket is an assertive error with the server wording and no retry button', async () => {
    api.board.mockRejectedValue(new BoardError('invalid_ticket'));
    mount();
    await enter('X');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid ticket.');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('no signal: says the scan was not recorded and Try again re-sends the same code', async () => {
    api.board.mockRejectedValueOnce(new BoardError('network')).mockResolvedValueOnce(ok(1, 3));
    mount();
    await enter('MALAKY:TICKET:xyz');
    expect((await screen.findByRole('alert')).textContent).toContain('not recorded');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Boarded: ticket 1');
    expect(api.board).toHaveBeenCalledTimes(2);
    expect(api.board).toHaveBeenLastCalledWith('t1', 'MALAKY:TICKET:xyz');
  });

  it('cannot double-submit while a scan is in flight', async () => {
    let done!: (v: ReturnType<typeof ok>) => void;
    api.board.mockImplementation(() => new Promise((r) => { done = r; }));
    mount();
    await userEvent.type(await screen.findByLabelText('Or enter the code'), 'A');
    const btn = screen.getByRole('button', { name: 'Board passenger' });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute('aria-busy')).toBe('true'));
    fireEvent.click(btn);
    fireEvent.submit(btn.closest('form')!);
    expect(api.board).toHaveBeenCalledTimes(1);
    await act(async () => { done(ok(1, 3)); });
  });

  it('the camera button toggles and a camera hit boards through the same path', async () => {
    api.board.mockResolvedValue(ok(4, 4));
    mount();
    const scan = await screen.findByRole('button', { name: 'Scan ticket with camera' });
    expect(scan.className).toContain('h-14');
    await userEvent.click(scan);
    expect(screen.getByRole('button', { name: 'Stop camera' })).toBeTruthy();
    await userEvent.click(screen.getByText('fake-camera-hit'));
    await screen.findByText('Boarded: ticket 4');
    expect(api.board).toHaveBeenCalledWith('t1', 'SCANNED');
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
    api.board.mockResolvedValue(ok(1, 3));
    const { container } = mount();
    await enter('A');
    await screen.findByTestId('scan-outcome');
    expect(container.querySelector('#manual-code')).toBeTruthy();
    for (const id of ['stat-expected', 'stat-boarded', 'stat-remaining']) expect(screen.getByTestId(id)).toBeTruthy();
  });

  it('axe: no serious or critical violations with a result on screen, and while offline', async () => {
    api.board.mockResolvedValue(ok(1, 3));
    const { container } = mount();
    await enter('A');
    await screen.findByTestId('scan-outcome');
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    act(() => { window.dispatchEvent(new Event('offline')); });
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});
