import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
async function load() { vi.resetModules(); return (await import('./reportFailure')).reportOperationFailure; }

beforeEach(() => { fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('reportOperationFailure (browser)', () => {
  it('is a no-op outside a browser (SSR / unit tests)', async () => {
    const report = await load();
    report('ticket.board', { pgCode: 'P0002' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  describe('in a browser', () => {
    beforeEach(() => { vi.stubGlobal('window', {}); });
    it('sends only enums, numbers and ids - never a token or free text', async () => {
      const report = await load();
      report('ticket.board', { pgCode: 'P0002', httpStatus: 400 }, { tripId: '00000000-0000-4000-8000-000000000981' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('/api/telemetry/failure');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('same-origin');
      expect(JSON.parse(init.body as string)).toEqual({ op: 'ticket.board', outcome: 'not_found', pgCode: 'P0002', httpStatus: 400, tripId: '00000000-0000-4000-8000-000000000981' });
    });
    it('classifies PT429 as rate_limited and network errors as network', async () => {
      const report = await load();
      report('booking.create', { pgCode: 'PT429' });
      report('ticket.qr', { network: true });
      expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).outcome).toBe('rate_limited');
      expect(JSON.parse((fetchMock.mock.calls[1] as any)[1].body).outcome).toBe('network');
    });
    it('drops an invalid pgCode instead of sending it', async () => {
      const report = await load();
      report('ticket.qr', { pgCode: 'drop table; --' });
      expect(JSON.parse((fetchMock.mock.calls[0] as any)[1].body).pgCode).toBeUndefined();
    });
    it('has a client-side budget (8 per minute) so a broken page cannot flood the endpoint', async () => {
      const report = await load();
      for (let i = 0; i < 30; i++) report('ticket.qr', { pgCode: 'P0002' });
      expect(fetchMock).toHaveBeenCalledTimes(8);
    });
    it('never throws, even when fetch throws synchronously or rejects', async () => {
      const report = await load();
      fetchMock.mockImplementationOnce(() => { throw new Error('boom'); });
      expect(() => report('ticket.qr', {})).not.toThrow();
      fetchMock.mockImplementationOnce(async () => { throw new Error('offline'); });
      expect(() => report('ticket.qr', {})).not.toThrow();
    });
  });
});
