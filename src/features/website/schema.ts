import { z } from 'zod';
import { atLeastOneField, hexColorSchema, httpsUrlSchema, localizedTextSchema, optionalEmail, phoneSchema } from '@/lib/validation/common';

import { BUTTON_STYLES, FONT_KEYS } from '@/features/site/theme';

const font = z.enum(FONT_KEYS, { error: 'invalid_font' });
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
 * Not writable here: `isPublished` (only publish_website / unpublish_website), `faviconMediaId`. `logoMediaId` is writable since
 * 0048: media rows are created only by reserve_media (public bucket, PNG/JPEG/WebP), the composite FK pins the image to THIS company,
 * and the 0046 snapshot drops anything private, deleted or SVG. Brand colours are validated hex, never free CSS.
 */
export const websiteSettingsUpdateSchema = atLeastOneField(
  z.strictObject({
    siteTitle: localizedTextSchema(120).nullable().optional(),
    metaDescription: localizedTextSchema(300).nullable().optional(),
    logoMediaId: z.uuid().nullable().optional(),
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    fontHeading: font.optional(),
    fontBody: font.optional(),
    buttonStyle: z.enum(BUTTON_STYLES, { error: 'invalid_button_style' }).optional(),
    contactEmail: optionalEmail,
    contactPhone: nullablePhone,
    contactWhatsapp: nullablePhone,
    contactAddress: localizedTextSchema(300).nullable().optional(),
    socialLinks: socialLinksSchema.optional(), // replaces the whole object
    footerText: localizedTextSchema(500).nullable().optional(),
  }),
);
export type WebsiteSettingsUpdate = z.output<typeof websiteSettingsUpdateSchema>;
