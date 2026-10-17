import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, fromZod, httpStatusFor, parseInput, toClientError } from './errors';

describe('AppError / toClientError', () => {
  it('exposes code, detail and fields but never the cause', () => {
    const e = new AppError('conflict', { detail: 'bus_conflict', cause: new Error('SELECT secret FROM tenants_b') });
    const c = toClientError(e);
    expect(c).toEqual({ code: 'conflict', message: expect.any(String), detail: 'bus_conflict' });
    expect(JSON.stringify(c)).not.toMatch(/secret|SELECT/);
  });
  it('collapses unknown errors to a generic internal error', () => {
    const c = toClientError(new Error('connection to db.internal:5432 refused'));
    expect(c.code).toBe('internal');
    expect(c.message).not.toMatch(/db\.internal/);
    expect(toClientError('boom').code).toBe('internal');
  });
  it('maps every code to an HTTP status', () => {
    expect(httpStatusFor('forbidden')).toBe(403);
    expect(httpStatusFor('not_found')).toBe(404);
    expect(httpStatusFor('validation')).toBe(422);
    expect(httpStatusFor('plan_limit')).toBe(402);
    expect(httpStatusFor('internal')).toBe(500);
  });
});

describe('parseInput / fromZod', () => {
  const schema = z.strictObject({ name: z.string().min(3) });
  it('returns parsed data', () => expect(parseInput(schema, { name: 'abc' })).toEqual({ name: 'abc' }));
  it('throws AppError(validation) with per-field messages and no input echo', () => {
    try {
      parseInput(schema, { name: 'x', secret: 'hunter2' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const ce = toClientError(e);
      expect(ce.code).toBe('validation');
      expect(JSON.stringify(ce)).not.toContain('hunter2');
      expect(ce.fields).toBeDefined();
    }
  });
  it('fromZod keys by path', () => {
    const r = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    if (r.success) throw new Error('expected failure');
    expect(Object.keys(fromZod(r.error).fields ?? {})).toEqual(['a.b']);
  });
});
