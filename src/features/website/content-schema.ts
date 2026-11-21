import { z } from 'zod';
import { sectionStyleWrite } from '@/features/site/section-style';
import { localizedTextSchema } from '@/lib/validation/common';
import { sectionSchemas, type SectionType } from '@/features/site/sections';

/**
 * WRITE contract for website sections (M3E). The read contract (features/site/sections.ts) is lenient on purpose: the renderer
 * skips what it cannot parse. This one is strict: unknown keys are refused, URLs are limited to what the database trigger
 * (0046 validate_site_json) accepts, and media references are UUIDs. The database re-checks everything; this gives
 * field-level errors before the round trip. Keys follow the 0046 convention: *_href for URLs, *_media_id for media.
 */
const loc = (max: number) => localizedTextSchema(max);
const hrefSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => /^(https:\/\/|mailto:|tel:|#|\/(?!\/))/i.test(v), 'invalid_url')
  .refine((v) => !/[\u0000-\u001f<>"']/.test(v), 'invalid_characters');
const mediaId = z.uuid();
const item = z.strictObject({ title: loc(120).optional(), body: loc(600).optional() });
const qa = z.strictObject({ question: loc(200).optional(), answer: loc(1200).optional() });

export const HERO_IMAGE_POSITIONS = ['beside', 'full'] as const;
export type HeroImagePosition = (typeof HERO_IMAGE_POSITIONS)[number];
/**
 * Keys of a section's content that are NOT edited through the text form: they change only through the image upload actions
 * (which upload, validate and discard files). A text save keeps whatever is stored for these keys, so a stale form can never put
 * back an old image id, and a client can never point a section at an arbitrary media id through the save action.
 */
const MANAGED_EXTRA: Partial<Record<SectionType, readonly string[]>> = { hero: ['image_media_id', 'image_position'] };
/** `style` (E4) is managed for every type: it changes only through its own action, so a stale text form can never put an old look back. */
export const managedKeys = (type: SectionType): readonly string[] => ['style', ...(MANAGED_EXTRA[type] ?? [])];

export const sectionWriteSchemas = {
  hero: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional(), subtitle: loc(300).optional(), cta_label: loc(40).optional(), cta_href: hrefSchema.optional(), image_media_id: mediaId.optional(), image_position: z.enum(HERO_IMAGE_POSITIONS).optional() }),
  about: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional(), body: loc(4000).optional() }),
  features: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional(), items: z.array(item).max(24).optional() }),
  routes: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional() }),
  trips: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional(), limit: z.number().int().min(1).max(20).optional() }),
  faq: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional(), items: z.array(qa).max(40).optional() }),
  contact: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional() }),
  subscriptions: z.strictObject({ style: sectionStyleWrite.optional(), title: loc(120).optional() }),
  rich_text: z.strictObject({ style: sectionStyleWrite.optional(), body: loc(8000).optional() }),
  image: z.strictObject({ style: sectionStyleWrite.optional(), image_media_id: mediaId.optional(), caption: loc(200).optional() }),
  footer: z.strictObject({}),
} as const satisfies Record<SectionType, z.ZodType>;

export const SECTION_TYPES = Object.keys(sectionSchemas) as SectionType[];
export const sectionTypeSchema = z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]);

/** Validates content against the schema of the section's own type. */
export function parseSectionContent(type: SectionType, content: unknown): z.ZodSafeParseResult<Record<string, unknown>> {
  return sectionWriteSchemas[type].safeParse(content ?? {}) as z.ZodSafeParseResult<Record<string, unknown>>;
}

const pageSlug = z.union([z.literal(''), z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'invalid_slug').max(60)]);

export const pageCreateSchema = z.strictObject({
  slug: pageSlug.refine((s) => s !== '', 'slug_required'), // the home page is created once, never via this form
  title: loc(120).refine((t) => !!(t.ar || t.en), 'title_required'),
  seoTitle: loc(70).nullable().optional(),
  seoDescription: loc(300).nullable().optional(),
});
export const pageUpdateSchema = z
  .strictObject({
    title: loc(120).refine((t) => !!(t.ar || t.en), 'title_required').optional(),
    seoTitle: loc(70).nullable().optional(),
    seoDescription: loc(300).nullable().optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'no_changes' });

export const sectionCreateSchema = z.strictObject({ type: sectionTypeSchema, content: z.unknown().optional() });
export const sectionUpdateSchema = z
  .strictObject({ content: z.unknown().optional(), isEnabled: z.boolean().optional() })
  .refine((v) => v.content !== undefined || v.isEnabled !== undefined, { message: 'no_changes' });
/** Insert at a position: index 0 = top, n = bottom (clamped to the current length by the service). */
export const sectionInsertSchema = z.strictObject({ type: sectionTypeSchema, index: z.number().int().min(0).max(60) });
export const sectionReorderSchema = z.strictObject({ orderedIds: z.array(z.uuid()).min(1).max(60) });

export type PageCreate = z.output<typeof pageCreateSchema>;
export type PageUpdate = z.output<typeof pageUpdateSchema>;
