import { z } from 'zod';
import { normalizePhone } from './phone';

/** Shared field builders. Business schemas are strict objects built from these. */

export const idSchema = z.guid();

const NUL = /\u0000/;

/** Required trimmed text. */
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !NUL.test(v), 'invalid_characters');

/** Optional text. Empty string clears the value (null); undefined means "not provided". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !NUL.test(v), 'invalid_characters')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.email().max(254).nullable())
  .nullable()
  .optional();

/**
 * Phone: any valid international number, or a local number read as Egyptian (see phone.ts). The parsed value is
 * E.164. A nonsense value is rejected here AND by the DB (migration 0009), so neither layer can be skipped.
 */
export const phoneSchema = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const normalised = normalizePhone(value);
    if (normalised === null) {
      ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
      return z.NEVER;
    }
    return normalised;
  });

/** Money with at most two decimals, never negative. Stored as numeric(12,2). */
export const moneySchema = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'max_two_decimals');

/** ISO-8601 instant with an explicit offset or Z. Normalised to UTC. */
export const instantSchema = z.iso
  .datetime({ offset: true })
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid_date')
  .transform((v) => new Date(v).toISOString());

export const dateOnlySchema = z.iso.date();

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'invalid_color')
  .transform((v) => v.toLowerCase());

/** Only https links: blocks javascript:, data: and http: values that would later be rendered as hrefs. */
export const httpsUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((v) => !NUL.test(v), 'invalid_characters');

/** Bilingual content stored as jsonb: { ar?, en? }. */
export const localizedTextSchema = (max: number) =>
  z
    .object({ ar: z.string().trim().max(max).optional(), en: z.string().trim().max(max).optional() })
    .strict();

/** Ensures a PATCH object carries at least one change. */
export function atLeastOneField<T extends z.ZodObject>(schema: T) {
  return schema.refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'no_changes' });
}

/** Next.js searchParams values may be string | string[] | undefined: keep the first value only. */
export function firstParams(
  input: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(input)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

/** Form/URL booleans: 'true' | 'false'. Anything else fails validation instead of becoming `true`. */
export const boolParam = z.enum(['true', 'false']).transform((v) => v === 'true');
