import { describe, expect, it } from 'vitest';
import { fakeDb, opsOf, tenantCtx } from '@/test/helpers';
import { proofWhatsappUrl } from '@/features/trip-booking/types';
import { makePaymentSettingsService } from './service';
import { paymentSettingsRepository } from './repository';
import { paymentSettingsSchema } from './schema';

const OK = { requirePrepayment: true, vodafoneCashNumber: '+201001234567', instapayAddress: 'shop@instapay', paymentWhatsapp: '+201001234567', paymentDeadlineHours: 2 };

describe('paymentSettingsSchema', () => {
  it('accepts valid input and drops empty strings', () => {
    const r = paymentSettingsSchema.parse({ ...OK, noteEn: '' });
    expect(r.noteEn).toBeUndefined();
  });
  it('refuses a company id, bad deadline and bad phone', () => {
    expect(paymentSettingsSchema.safeParse({ ...OK, companyId: 'x' }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...OK, paymentDeadlineHours: 0 }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...OK, paymentDeadlineHours: 49 }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...OK, vodafoneCashNumber: '0100' }).success).toBe(false);
  });
});

describe('paymentSettingsService', () => {
  const svc = makePaymentSettingsService(paymentSettingsRepository);
  it('needs settings.write to save', async () => {
    const { db, calls } = fakeDb();
    await expect(svc.save(tenantCtx(['settings.read'], { db }), OK)).rejects.toBeTruthy();
    expect(calls).toHaveLength(0);
  });
  it('needs settings.read to read', () => {
    expect(() => svc.get(tenantCtx([]))).toThrow();
  });
  it('saves through the RPC without sending a company id', async () => {
    const { db, calls } = fakeDb();
    await svc.save(tenantCtx(['settings.write'], { db }), OK);
    const rec = calls.find((c) => c.target === 'rpc:save_company_payment_settings')!;
    const args = opsOf(rec, 'args')[0]![0] as Record<string, unknown>;
    expect(args.p_require).toBe(true);
    expect(args.p_deadline_hours).toBe(2);
    expect(Object.keys(args).some((k) => k.includes('company'))).toBe(false);
  });
  it('returns defaults when the company has no row', async () => {
    const { db } = fakeDb({ data: null });
    const s = await svc.get(tenantCtx(['settings.read'], { db }));
    expect(s.requirePrepayment).toBe(false);
    expect(s.paymentDeadlineHours).toBe(2);
  });
});

describe('proofWhatsappUrl', () => {
  it('builds a wa.me link with digits only and encoded text', () => {
    expect(proofWhatsappUrl('+201001234567', 'Hi & bye')).toBe('https://wa.me/201001234567?text=Hi%20%26%20bye');
  });
});
