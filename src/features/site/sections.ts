import { z } from 'zod';
import { sectionStyleRead } from './section-style';
import { localizedSchema } from './schema';

/**
 * Section content shapes. This is the CONTRACT the M3E editor must write (it also follows the database convention from 0046:
 * a URL sits under a key ending url/href/link, a media reference under *_media_id). Every field is optional: a half-filled
 * section renders what it has. A section whose content does not parse is skipped, not fatal.
 */
const L = localizedSchema;
const item = z.object({ title: L.optional(), body: L.optional() });
const qa = z.object({ question: L.optional(), answer: L.optional() });

export const sectionSchemas = {
  hero: z.object({ style: sectionStyleRead, title: L.optional(), subtitle: L.optional(), cta_label: L.optional(), cta_href: z.string().optional(), image_media_id: z.string().optional(), image_position: z.string().optional() }),
  about: z.object({ style: sectionStyleRead, title: L.optional(), body: L.optional() }),
  features: z.object({ style: sectionStyleRead, title: L.optional(), items: z.array(item).max(24).optional() }),
  routes: z.object({ style: sectionStyleRead, title: L.optional() }),
  trips: z.object({ style: sectionStyleRead, title: L.optional(), limit: z.number().int().min(1).max(20).optional() }),
  faq: z.object({ style: sectionStyleRead, title: L.optional(), items: z.array(qa).max(40).optional() }),
  contact: z.object({ style: sectionStyleRead, title: L.optional() }),
  subscriptions: z.object({ style: sectionStyleRead, title: L.optional() }),
  rich_text: z.object({ style: sectionStyleRead, body: L.optional() }),
  image: z.object({ style: sectionStyleRead, image_media_id: z.string().optional(), caption: L.optional() }),
  footer: z.object({}),
} as const;

export type SectionType = keyof typeof sectionSchemas;
export type SectionOf<T extends SectionType> = { type: T; content: z.infer<(typeof sectionSchemas)[T]> };
export type ParsedSection = { [T in SectionType]: SectionOf<T> }[SectionType];

const isType = (t: string): t is SectionType => Object.hasOwn(sectionSchemas, t);

/** Unknown type or invalid content -> null (skipped by the renderer). */
export function parseSection(raw: { type: string; content: unknown }): ParsedSection | null {
  if (!isType(raw.type)) return null;
  const r = sectionSchemas[raw.type].safeParse(raw.content ?? {});
  return r.success ? ({ type: raw.type, content: r.data } as ParsedSection) : null;
}
