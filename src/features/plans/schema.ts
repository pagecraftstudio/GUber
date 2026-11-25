import { z } from 'zod';
import { optionalText, text } from '@/lib/validation/common';

// P8 inputs for the admin_*plan* RPCs (migration 0064). No role, actor or company authority is ever an input; ids are targets
// that Postgres authorises (super_admin only). The database repeats every rule here.

export const PLAN_CODE = /^[a-z][a-z0-9_]{1,31}$/;
export const ENTITLEMENT_KEY = /^(max|feature)_[a-z][a-z0-9_]{1,47}$/;

/** z.coerce.number() turns '' into 0, which would silently make a blank price a FREE plan. A blank is "missing" and is refused. */
const blankIsMissing = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const num = <T extends z.ZodType>(schema: T) => z.preprocess(blankIsMissing, schema);
const money = (max: number) => num(z.coerce.number().min(0).max(max).multipleOf(0.01));
/** Forms post '' for "not set": a yearly price of '' means none, never 0. */
const blankToNull = (v: unknown) => (v === '' || v === undefined || v === null ? null : v);
const yesNo = z.enum(['yes', 'no']).transform((v) => v === 'yes');

const editable = {
  name: text(1, 80),
  description: optionalText(500),
  priceMonthly: money(10_000_000),
  priceYearly: z.preprocess(blankToNull, money(100_000_000).nullable()),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  trialDays: num(z.coerce.number().int().min(0).max(365)),
  isPublic: yesNo,
  sortOrder: num(z.coerce.number().int().min(0).max(1000)),
};

export const createPlanSchema = z.strictObject({ code: z.string().trim().regex(PLAN_CODE), ...editable });
export type CreatePlanInput = z.output<typeof createPlanSchema>;

/** The edit form always sends every editable field; `code` is deliberately absent (immutable) and the strict object refuses it. */
export const updatePlanSchema = z.strictObject(editable);
export type UpdatePlanInput = z.output<typeof updatePlanSchema>;

export const setPlanActiveSchema = z
  .strictObject({ active: z.enum(['true', 'false']).transform((v) => v === 'true'), reason: optionalText(500) })
  .refine((v) => v.active || (v.reason != null && v.reason.length >= 3), { path: ['reason'], message: 'reason_required' });
export type SetPlanActiveInput = z.output<typeof setPlanActiveSchema>;

/** One text box for both kinds: a whole number, `unlimited`, or `on` / `off`. Postgres checks it against the key's type. */
export const setEntitlementSchema = z
  .strictObject({ key: z.string().regex(ENTITLEMENT_KEY), value: z.string().trim().toLowerCase().max(12) })
  .transform((v, ctx) => {
    if (v.value === 'unlimited') return { key: v.key, int: null, bool: null, unlimited: true };
    if (v.value === 'on' || v.value === 'off') return { key: v.key, int: null, bool: v.value === 'on', unlimited: false };
    if (/^\d{1,9}$/.test(v.value)) return { key: v.key, int: Number(v.value), bool: null, unlimited: false };
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'invalid_entitlement_value' });
    return z.NEVER;
  });
export type SetEntitlementInput = z.output<typeof setEntitlementSchema>;

export const createDefinitionSchema = z.strictObject({
  key: z.string().trim().regex(ENTITLEMENT_KEY),
  valueType: z.enum(['integer', 'boolean']),
  description: optionalText(200),
});
export type CreateDefinitionInput = z.output<typeof createDefinitionSchema>;
