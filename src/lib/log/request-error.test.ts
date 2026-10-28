import { beforeEach, describe, expect, it } from 'vitest';
import { setLogSink } from './index';
import { logRequestError } from './request-error';
import { GET, HEAD } from '@/app/api/health/route';

let lines: string[] = [];
beforeEach(() => { lines = []; setLogSink((l) => lines.push(l)); });

describe('logRequestError', () => {
  it('writes one error record with route context and digest', () => {
    const err = Object.assign(new Error('boom'), { digest: 'abc123' });
    logRequestError(err, { path: '/dashboard/trips', method: 'GET' }, { routePath: '/dashboard/trips', routeType: 'render', routerKind: 'App Router' });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'error', event: 'request.unhandled_error', method: 'GET', path: '/dashboard/trips', digest: 'abc123', error: { name: 'Error', message: 'boom' } });
  });
  it('drops the query string (auth callback tokens) and never logs a stack', () => {
    logRequestError(new Error('x'), { path: '/auth/confirm?token_hash=SECRETSECRETSECRETSECRETSECRET12&type=recovery', method: 'GET' }, {});
    expect(lines[0]).not.toContain('SECRET');
    expect(lines[0]).not.toContain('token_hash');
    expect(lines[0]).not.toContain(' at ');
  });
  it('scrubs secrets inside the error message', () => {
    logRequestError(new Error('failed for a@b.com with MALAKY:TICKET:abcDEF123 and eyJhbGciOi.eyJzdWIiOi.sig'), { path: '/', method: 'POST' }, {});
    const l = lines[0]!;
    expect(l).not.toContain('a@b.com');
    expect(l).not.toContain('abcDEF123');
    expect(l).not.toContain('eyJhbGciOi');
  });
  it('never throws, even for hostile input', () => {
    expect(() => logRequestError(null, { path: undefined as unknown as string, method: undefined as unknown as string }, {})).not.toThrow();
  });
});

describe('/api/health', () => {
  it('GET answers ok with no-store and no config', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(Object.keys(body).every((k) => ['status', 'release'].includes(k))).toBe(true);
  });
  it('HEAD answers 200', () => { expect(HEAD().status).toBe(200); });
});
