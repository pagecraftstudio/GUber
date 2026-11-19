import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/errors';
import { tenantCtx, COMPANY_A } from '@/test/helpers';
import { makeSubscriptionReportService } from './service';
import type { SubscriptionReportRepository } from './repository';
import { rangeSchema } from './schema';
import { toPlanReport } from './types';

const repo = () => ({ report: vi.fn(async (_c: unknown, r: { from: string; to: string }) => ({ ...r, plans: [], days: [], demand: [] })) }) as unknown as SubscriptionReportRepository & { report: ReturnType<typeof vi.fn> };
const range = { from: '2026-11-01', to: '2026-11-30' };

describe('rangeSchema', () => {
  it('accepts an ordered range up to 366 days', () => {
    expect(rangeSchema.safeParse(range).success).toBe(true);
    expect(rangeSchema.safeParse({ from: '2026-01-01', to: '2027-01-02' }).success).toBe(true);
  });
  it('refuses reversed, too long, malformed and extra fields', () => {
    expect(rangeSchema.safeParse({ from: '2026-11-30', to: '2026-11-01' }).success).toBe(false);
    expect(rangeSchema.safeParse({ from: '2026-01-01', to: '2027-01-03' }).success).toBe(false);
    expect(rangeSchema.safeParse({ from: '2026-13-01', to: '2026-13-02' }).success).toBe(false);
    expect(rangeSchema.safeParse({ from: 'x', to: 'y' }).success).toBe(false);
    expect(rangeSchema.safeParse({ ...range, companyId: COMPANY_A }).success).toBe(false);
  });
});

describe('subscription report service', () => {
  it('needs analytics.read before touching the repository', async () => {
    const r = repo();
    const svc = makeSubscriptionReportService(r);
    await expect(svc.report(tenantCtx(['bookings.read']), range)).rejects.toBeInstanceOf(AppError);
    expect(r.report).not.toHaveBeenCalled();
  });
  it('validates input after authorizing', async () => {
    const r = repo();
    const svc = makeSubscriptionReportService(r);
    await expect(svc.report(tenantCtx(['analytics.read']), { from: 'bad', to: 'bad' })).rejects.toBeInstanceOf(AppError);
    expect(r.report).not.toHaveBeenCalled();
  });
  it('passes a valid range through', async () => {
    const r = repo();
    const out = await makeSubscriptionReportService(r).report(tenantCtx(['analytics.read']), range);
    expect(r.report).toHaveBeenCalledOnce();
    expect(out.from).toBe(range.from);
  });
});

describe('row mapping', () => {
  it('turns numeric strings into numbers and defaults the currency', () => {
    const p = toPlanReport({ plan_id: 'p', plan_name: 'M', route_name: 'R', is_active: true, active_now: 2, pending_now: 1, new_in_range: 3, revenue_in_range: '1800.50', currency: null });
    expect(p.revenue).toBe(1800.5);
    expect(p.currency).toBe('EGP');
  });
});
