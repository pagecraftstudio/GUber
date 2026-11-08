import { describe, expect, it } from 'vitest';
import { generateSchema, templateCreateSchema } from './schema';

const ID = '00000000-0000-4000-8000-000000000201';
const ok = { name: 'Morning', routeId: ID, departureTime: '07:30', durationMinutes: 120, daysOfWeek: [3, 1, 1], startDate: '2026-11-09', price: 50, capacity: 40 };

describe('trip template schema', () => {
  it('accepts a valid template and normalises the days (unique, sorted)', () => {
    const r = templateCreateSchema.parse(ok);
    expect(r.daysOfWeek).toEqual([1, 3]);
  });
  it('rejects no days, bad weekday, bad time, end before start', () => {
    for (const bad of [{ daysOfWeek: [] }, { daysOfWeek: [0] }, { daysOfWeek: [8] }, { departureTime: '7:30' }, { departureTime: '24:00' }, { endDate: '2026-11-01' }])
      expect(templateCreateSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
  });
  it('never accepts a company id, status or generated_through from the client', () => {
    for (const extra of [{ companyId: ID }, { isActive: false }, { generatedThrough: '2026-12-01' }])
      expect(templateCreateSchema.safeParse({ ...ok, ...extra }).success).toBe(false);
  });
  it('generate: horizon 1..60, default 28', () => {
    expect(generateSchema.parse({ templateId: ID }).days).toBe(28);
    expect(generateSchema.safeParse({ templateId: ID, days: 61 }).success).toBe(false);
  });
});
