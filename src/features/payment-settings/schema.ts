import { z } from 'zod';
import { phoneSchema } from '@/lib/validation/common';

const text = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const phone = z.string().trim().max(40).optional().transform((v, ctx) => {
  if (!v) return undefined;
  const r = phoneSchema.safeParse(v);
  if (!r.success) { ctx.addIssue({ code: 'custom', message: 'invalid_phone' }); return z.NEVER; }
  return r.data;
});

/** What a manager saves. NO company id: it comes from the session (save_company_payment_settings derives it from the caller's membership). */
export const paymentSettingsSchema = z.strictObject({
  requirePrepayment: z.boolean(),
  vodafoneCashNumber: phone,
  vodafoneCashHolder: text(100),
  instapayAddress: text(100),
  instapayHolder: text(100),
  paymentWhatsapp: phone,
  paymentDeadlineHours: z.number().int().min(1).max(48),
  noteEn: text(500),
  noteAr: text(500),
});
export type PaymentSettingsInput = z.output<typeof paymentSettingsSchema>;
export type PaymentSettings = {
  requirePrepayment: boolean; vodafoneCashNumber: string; vodafoneCashHolder: string; instapayAddress: string; instapayHolder: string;
  paymentWhatsapp: string; paymentDeadlineHours: number; noteEn: string; noteAr: string;
};
export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = { requirePrepayment: false, vodafoneCashNumber: '', vodafoneCashHolder: '', instapayAddress: '', instapayHolder: '', paymentWhatsapp: '', paymentDeadlineHours: 2, noteEn: '', noteAr: '' };
