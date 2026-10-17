import { z } from 'zod';
import { atLeastOneField, hexColorSchema, httpsUrlSchema, localizedTextSchema, optionalEmail, phoneSchema } from '@/lib/validation/common';

const font = z.string().regex(/^[a-z0-9-]{2,40}$/, 'invalid_font');
const nullablePhone = z.union([z.literal('').transform(() => null), phoneSchema]).nullable().optional();

// Only known networks, only https URLs: these values end up as <a href> on the public site (XSS / phishing).
const socialLinksSchema = z.strictObject({
  facebook: httpsUrlSchema.optional(),
  instagram: httpsUrlSchema.optional(),
  x: httpsUrlSchema.optional(),
  tiktok: httpsUrlSchema.optional(),
  youtube: httpsUrlSchema.optional(),
  linkedin: httpsUrlSchema.optional(),
  telegram: httpsUrlSchema.optional(),
});

/**
 * Not writable here: `isPublished` (publishing is a Phase 7 snapshot RPC), `logoMediaId` / `faviconMediaId`
 * (Phase 13 storage must first verify bucket + kind, otherwise a private file could be pointed at by the public
 * site). Brand colours are validated hex, never free CSS.
 */
export const websiteSettingsUpdateSchema = atLeastOneField(
  z.strictObject({
    siteTitle: localizedTextSchema(120).nullable().optional(),
    metaDescription: localizedTextSchema(300).nullable().optional(),
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    fontHeading: font.optional(),
    fontBody: font.optional(),
    contactEmail: optionalEmail,
    contactPhone: nullablePhone,
    contactWhatsapp: nullablePhone,
    contactAddress: localizedTextSchema(300).nullable().optional(),
    socialLinks: socialLinksSchema.optional(), // replaces the whole object
    footerText: localizedTextSchema(500).nullable().optional(),
  }),
);
export type WebsiteSettingsUpdate = z.output<typeof websiteSettingsUpdateSchema>;
