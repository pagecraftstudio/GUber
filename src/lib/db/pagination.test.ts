import { describe, expect, it } from 'vitest';
import { MAX_PAGE_SIZE, pageQuerySchema, rangeFor, toPage } from './pagination';

describe('pagination', () => {
  it('defaults', () => expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 }));
  it('coerces URL strings', () => expect(pageQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 }));
  it('rejects unbounded or nonsense values', () => {
    expect(pageQuerySchema.safeParse({ pageSize: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ pageSize: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: 'abc' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });
  it('computes inclusive ranges', () => {
    expect(rangeFor({ page: 1, pageSize: 25 })).toEqual({ from: 0, to: 24 });
    expect(rangeFor({ page: 3, pageSize: 10 })).toEqual({ from: 20, to: 29 });
  });
  it('hasMore', () => {
    expect(toPage([1, 2], 5, { page: 1, pageSize: 2 }).hasMore).toBe(true);
    expect(toPage([5], 5, { page: 3, pageSize: 2 }).hasMore).toBe(false);
    expect(toPage([1], null, { page: 1, pageSize: 2 }).total).toBe(1);
  });
});
