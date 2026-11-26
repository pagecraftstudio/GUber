// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics/events', () => ({ track }));
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({}) }));
const api = vi.hoisted(() => ({ myTrips: vi.fn(), stats: vi.fn(), scanIdentity: vi.fn(), confirmBoarding: vi.fn() }));
vi.mock('./driverApi', async (orig) => ({ ...(await orig<typeof import('./driverApi')>()), createDriverApi: () => api }));
import { BoardError } from './driverApi';
import { DriverBoarding } from './DriverBoarding';

const TRIP = { trip_id: '00000000-0000-4000-8000-0000000000a1', company_name: 'Nile Bus', origin_name: 'Cairo', destination_name: 'Galala', departure_at: '2027-02-01T07:00:00Z', arrival_at: '2027-02-01T09:00:00Z', status: 'scheduled', expected: 3, boarded: 0, remaining: 3 };
const CARD = { verdict: 'no_booking', can_board: false, kind: 'masar_id', verified: false, student: { name: 'Secret Student', masar_id: 'MSR-AAAA-BBBB' }, subscription: null, has_other_company_subscription: false, booking: null };

beforeEach(() => { track.mockClear(); Object.values(api).forEach((f) => f.mockReset()); api.myTrips.mockResolvedValue([TRIP]); api.stats.mockResolvedValue({ expected: 3, boarded: 0, remaining: 3 }); });
afterEach(cleanup);

async function scanTyped(code: string) {
  render(<DriverBoarding lang="en" />);
  const input = await screen.findByRole('textbox');
  fireEvent.change(input, { target: { value: code } });
  fireEvent.submit(input.closest('form')!);
}

describe('driver scan analytics', () => {
  it('records the verdict only, never the code, name or MASAR id', async () => {
    api.scanIdentity.mockResolvedValue(CARD);
    await scanTyped('MSR-AAAA-BBBB');
    await waitFor(() => expect(track).toHaveBeenCalledWith('en', 'scan_outcome', { verdict: 'no_booking' }));
    const json = JSON.stringify(track.mock.calls);
    expect(json).not.toContain('Secret');
    expect(json).not.toContain('MSR-');
  });
  it('a lost connection is scan_offline; any other failure is an error verdict, not a crash', async () => {
    api.scanIdentity.mockRejectedValueOnce(new BoardError('network'));
    await scanTyped('MSR-AAAA-BBBB');
    await waitFor(() => expect(track).toHaveBeenCalledWith('en', 'scan_offline'));
    cleanup(); track.mockClear();
    api.scanIdentity.mockRejectedValueOnce(new BoardError('rate_limited'));
    await scanTyped('MSR-AAAA-BBBB');
    await waitFor(() => expect(track).toHaveBeenCalledWith('en', 'scan_outcome', { verdict: 'error:rate_limited' }));
  });
});
