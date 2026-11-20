import { z } from 'zod';

/**
 * Contract of get_public_site() (migration 0046), parsed at the boundary. The database validates content on write; this is the
 * second check, on read, so a malformed or future-shaped snapshot degrades to "skip that part" instead of breaking the page or
 * reaching the DOM unchecked. Section CONTENT is parsed per section type (see sections.ts), never as one big object, so one bad
 * section cannot take the whole site down.
 */
export const localizedSchema = z.object({ ar: z.string().optional(), en: z.string().optional() }).catch({});
export type Localized = z.infer<typeof localizedSchema>;

const mediaEntrySchema = z.object({
  path: z.string(), alt: z.string().nullable().optional(), width: z.number().nullable().optional(),
  height: z.number().nullable().optional(), mime: z.string().optional(),
});

const settingsSchema = z.object({
  site_title: localizedSchema.nullable().optional(),
  meta_description: localizedSchema.nullable().optional(),
  logo_media_id: z.string().nullable().optional(),
  favicon_media_id: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_whatsapp: z.string().nullable().optional(),
  contact_address: localizedSchema.nullable().optional(),
  social_links: z.record(z.string(), z.string()).nullable().optional().catch(null),
  footer_text: localizedSchema.nullable().optional(),
});

const pageSchema = z.object({
  slug: z.string(), title: localizedSchema.nullable().optional(), is_home: z.boolean(),
  seo_title: localizedSchema.nullable().optional(), seo_description: localizedSchema.nullable().optional(),
  sections: z.array(z.object({ type: z.string(), content: z.unknown() })),
});

export const publicSiteSchema = z.object({
  company: z.object({ name: z.string(), slug: z.string() }),
  version: z.number().int(),
  published_at: z.string(),
  site: z.object({
    schema_version: z.number().int(),
    settings: settingsSchema,
    pages: z.array(pageSchema),
    media: z.record(z.string(), mediaEntrySchema).catch({}),
  }),
});
export type PublicSite = z.infer<typeof publicSiteSchema>;
export type SitePage = PublicSite['site']['pages'][number];
export type SiteSettings = PublicSite['site']['settings'];
export type MediaEntry = z.infer<typeof mediaEntrySchema>;
/** Snapshot schema versions this renderer understands. A newer one renders as "unavailable", never as a guess. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];
