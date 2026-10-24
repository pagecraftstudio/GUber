import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { setLogSink } from '@/lib/log';
import { POST } from './route';

let lines: string[] = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(l)); });
const send = (body: string) => POST(new NextRequest('https://app.example.test/api/csp-report', { method: 'POST', body, headers: { 'content-type': 'application/csp-report' } }));

describe('POST /api/csp-report', () => {
  it('logs only whitelisted, query-free fields', async () => {
    const res = await send(JSON.stringify({ 'csp-report': { 'effective-directive': 'img-src', 'blocked-uri': 'https://cdn.evil.test/a.png?token=SECRET123', 'document-uri': 'https://app.example.test/my-bookings?x=1#frag', 'script-sample': 'alert(document.cookie)', 'original-policy': 'x' } }));
    expect(res.status).toBe(204);
    const rec = JSON.parse(lines[0]!);
    expect(rec).toMatchObject({ event: 'csp.violation', directive: 'img-src', blocked: 'https://cdn.evil.test/a.png', document: 'https://app.example.test/my-bookings' });
    expect(lines[0]).not.toMatch(/SECRET123|alert|frag|x=1/);
  });
  it('ignores garbage and oversized bodies, always 204', async () => {
    expect((await send('{nope')).status).toBe(204);
    expect((await send('x'.repeat(10_000))).status).toBe(204);
    expect(lines).toHaveLength(0);
  });
});
