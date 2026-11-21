// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({ rpc }) }));
vi.mock('@/ui/components/public/TicketQrImage', () => ({ TicketQrImage: ({ payload, label }: { payload: string; label: string }) => <img alt={label} data-payload={payload} src="data:," /> }));
import { MasarQr } from './MasarQr';

const ok = (n: number) => ({ data: { token: `MQ1.1.MSR-ABCD-EFGH.17000000${n}.sig`, ttl_seconds: 90 }, error: null });
beforeEach(() => { rpc.mockReset().mockResolvedValue(ok(1)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MasarQr', () => {
  it('asks the server for a token and draws it as the QR; the token text is never printed', async () => {
    const { container } = render(<MasarQr lang="en" />);
    const img = await screen.findByAltText('Your MASAR QR code');
    expect(rpc).toHaveBeenCalledWith('my_masar_qr');
    expect(img.getAttribute('data-payload')).toContain('MQ1.1.MSR-ABCD-EFGH');
    expect(container.textContent).not.toContain('MQ1.');
    expect(container.textContent).toContain('refreshes by itself every minute');
  });
  it('redraws with a fresh token every 50 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    rpc.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    render(<MasarQr lang="en" />);
    await screen.findByAltText('Your MASAR QR code');
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    await waitFor(() => expect(screen.getByAltText('Your MASAR QR code').getAttribute('data-payload')).toContain('170000002'));
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('a failure says so, offers Try again, and recovers', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT429', message: 'rate limit exceeded' } }).mockResolvedValueOnce(ok(3));
    render(<MasarQr lang="en" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load your QR');
    expect(alert.textContent).not.toContain('rate limit');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByAltText('Your MASAR QR code')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('Arabic copy', async () => {
    render(<MasarQr lang="ar" />);
    expect(await screen.findByAltText('رمز مسار الخاص بك')).toBeTruthy();
  });
});
