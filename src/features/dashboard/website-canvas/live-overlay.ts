import { SECTION_DEFAULTS, SECTION_FIELDS, compactContent } from '@/features/website/section-fields';
import { parseSection, type SectionType } from '@/features/site/sections';
import type { PublicSite, SitePage } from '@/features/site/schema';

/** What the text fields of the details panel show; mirrors SiteDetails (kept here so this module stays plain and testable). */
export type DetailsDraft = { titleEn: string; titleAr: string; email: string; phone: string; whatsapp: string; addressEn: string; addressAr: string; footerEn: string; footerAr: string };
export type SectionDrafts = Record<string, Record<string, unknown>>;
/** Style choices made but maybe not yet confirmed by the server (section id -> changed keys). */
export type StyleDrafts = Record<string, Record<string, string>>;
/** A section added in the canvas whose real row is still being created. */
export type PendingSection = { tempId: string; type: SectionType; index: number; base: number };

const isType = (t: string): t is SectionType => t in SECTION_FIELDS;

/**
 * The saved sections with what is being typed laid over them. Only keys the text form owns (SECTION_FIELDS) are replaced, so a style or
 * image change saved meanwhile is never reverted. A draft that does not parse yet (a half-typed question, a bad link) keeps the saved
 * content for that section: the preview never flashes "cannot be shown" while someone is typing.
 */
export function overlaySections(sections: SitePage['sections'], ids: string[], drafts: SectionDrafts, styles: StyleDrafts = {}): SitePage['sections'] {
  return sections.map((s, i) => {
    const id = ids[i] ?? '';
    const draft = drafts[id], style = styles[id];
    if ((!draft && !style) || !isType(s.type)) return s;
    const content: Record<string, unknown> = { ...(s.content as Record<string, unknown>) };
    if (draft) for (const def of SECTION_FIELDS[s.type]) {
      const v = compactContent(draft[def.key]);
      if (v === undefined) delete content[def.key]; else content[def.key] = v;
    }
    if (style) content.style = { ...((content.style as Record<string, unknown> | undefined) ?? {}), ...style };
    return parseSection({ type: s.type, content }) ? { ...s, content } : s;
  });
}

/** Pending (just added) sections drawn at their position with the type's starter content, ahead of the server's answer. */
export function withPending<B extends { id: string }>(sections: SitePage['sections'], blocks: B[], pending: PendingSection[], mkBlock: (p: PendingSection) => B): { sections: SitePage['sections']; blocks: B[] } {
  const outS = [...sections], outB = [...blocks];
  [...pending].sort((a, b) => a.index - b.index).forEach((p) => {
    const at = Math.min(p.index, outS.length);
    outS.splice(at, 0, { type: p.type, content: SECTION_DEFAULTS[p.type] ?? {} } as never);
    outB.splice(at, 0, mkBlock(p));
  });
  return { sections: outS, blocks: outB };
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
