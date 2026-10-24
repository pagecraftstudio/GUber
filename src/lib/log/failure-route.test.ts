import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { setLogSink } from './index';
import { failureReportSchema } from './report-schema';

const getUser = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ NEXT_PUBLIC_SITE_URL: 'https://app.example.test' }) }));
import { POST, GET } from '@/app/api/telemetry/failure/route';

let lines: string[] = [];
const TRIP = '00000000-0000-4000-8000-000000000981';
const USER = '00000000-0000-4000-8000-000000000085';
const post = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  POST(new NextRequest('https://app.example.test/api/telemetry/failure', {
    method: 'POST', body: raw ?? JSON.stringify(body),
    headers: { origin: 'https://app.example.test', 'content-type': 'application/json', ...headers },
  }));

beforeEach(() => { lines = []; setLogSink((l) => lines.push(l)); getUser.mockReset(); getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null }); });

describe('POST /api/telemetry/failure', () => {
  it('accepts a valid report, logs ONE record with the verified user id, answers 204', async () => {
    const res = await post({ op: 'booking.create', outcome: 'rate_limited', pgCode: 'PT429', httpStatus: 429, tripId: TRIP, seats: 2 });
    expect(res.status).toBe(204);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ event: 'operation.failed', op: 'booking.create', outcome: 'rate_limited', userId: USER, source: 'client_report', tripId: TRIP });
  });
  it('the user id comes from the session, never from the body (a forged userId is rejected by the strict schema)', async () => {
    const res = await post({ op: 'ticket.qr', outcome: 'unknown', userId: '00000000-0000-4000-8000-000000000001' });
    expect(res.status).toBe(422);
    expect(lines).toHaveLength(0);
  });
  it.each([
    ['unknown key (token smuggling)', { op: 'ticket.board', outcome: 'unknown', token: 'MALAKY:TICKET:abc' }],
    ['free-text message', { op: 'ticket.board', outcome: 'unknown', message: 'hello' }],
    ['unknown operation', { op: 'admin.delete_everything', outcome: 'unknown' }],
    ['unknown outcome', { op: 'ticket.board', outcome: 'pwned' }],
    ['non-uuid trip id', { op: 'ticket.board', outcome: 'unknown', tripId: '<script>' }],
    ['bad pgCode', { op: 'ticket.board', outcome: 'unknown', pgCode: 'a b c' }],
    ['seats out of range', { op: 'booking.create', outcome: 'unknown', seats: 9999 }],
  ])('rejects %s with 422 and logs nothing', async (_n, body) => {
    expect((await post(body)).status).toBe(422);
    expect(lines).toHaveLength(0);
  });
  it('rejects a foreign Origin (403) and a missing Origin (403) before touching auth', async () => {
    expect((await post({ op: 'ticket.qr', outcome: 'unknown' }, { origin: 'https://evil.test' })).status).toBe(403);
    const noOrigin = await POST(new NextRequest('https://app.example.test/api/telemetry/failure', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }));
    expect(noOrigin.status).toBe(403);
    expect(getUser).not.toHaveBeenCalled();
  });
  it('requires JSON (415), caps the body (413), rejects malformed JSON (400)', async () => {
    expect((await post({}, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await post(null, {}, 'x'.repeat(2000))).status).toBe(413);
    expect((await post(null, {}, '{not json')).status).toBe(400);
  });
  it('requires a verified session (401) and logs nothing for anonymous callers', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
    expect((await post({ op: 'ticket.qr', outcome: 'unknown' })).status).toBe(401);
    expect(lines).toHaveLength(0);
  });
  it('GET is not part of the endpoint (405)', () => { expect(GET().status).toBe(405); });
  it('schema is strict', () => {
    expect(failureReportSchema.safeParse({ op: 'ticket.qr', outcome: 'unknown', extra: 1 }).success).toBe(false);
    expect(failureReportSchema.safeParse({ op: 'ticket.qr', outcome: 'unknown' }).success).toBe(true);
  });
});
