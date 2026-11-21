import { SECTION_FIELDS, compactContent } from '@/features/website/section-fields';
import { parseSection, type SectionType } from '@/features/site/sections';
import type { PublicSite, SitePage } from '@/features/site/schema';

/** What the text fields of the details panel show; mirrors SiteDetails (kept here so this module stays plain and testable). */
export type DetailsDraft = { titleEn: string; titleAr: string; email: string; phone: string; whatsapp: string; addressEn: string; addressAr: string; footerEn: string; footerAr: string };
export type SectionDrafts = Record<string, Record<string, unknown>>;

const isType = (t: string): t is SectionType => t in SECTION_FIELDS;

/**
 * The saved sections with what is being typed laid over them. Only keys the text form owns (SECTION_FIELDS) are replaced, so a style or
 * image change saved meanwhile is never reverted. A draft that does not parse yet (a half-typed question, a bad link) keeps the saved
 * content for that section: the preview never flashes "cannot be shown" while someone is typing.
 */
export function overlaySections(sections: SitePage['sections'], ids: string[], drafts: SectionDrafts): SitePage['sections'] {
  return sections.map((s, i) => {
    const draft = drafts[ids[i] ?? ''];
    if (!draft || !isType(s.type)) return s;
    const content: Record<string, unknown> = { ...(s.content as Record<string, unknown>) };
    for (const def of SECTION_FIELDS[s.type]) {
      const v = compactContent(draft[def.key]);
      if (v === undefined) delete content[def.key]; else content[def.key] = v;
    }
    return parseSection({ type: s.type, content }) ? { ...s, content } : s;
  });
}

const loc = (en: string, ar: string) => ({ en, ar });
const orNull = (v: string) => v.trim() || null;

/** The site settings with the details panel's current text laid over them. */
export function overlayDetails(settings: PublicSite['site']['settings'], d: DetailsDraft | null): PublicSite['site']['settings'] {
  if (!d) return settings;
  return {
    ...settings,
    site_title: loc(d.titleEn, d.titleAr), contact_email: orNull(d.email), contact_phone: orNull(d.phone), contact_whatsapp: orNull(d.whatsapp),
    contact_address: loc(d.addressEn, d.addressAr), footer_text: loc(d.footerEn, d.footerAr),
  };
}
