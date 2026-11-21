import type { PublicSite, SitePage } from '@/features/site/schema';
import type { EditorBlock } from '@/features/site/editor-markup';
import { SECTION_LABELS } from './section-fields';
import type { DraftPage, DraftSection } from './pages-types';
import type { WebsiteSettings } from './types';

/**
 * The draft as the visual editor draws it: the same PublicSite shape the public renderer reads, but for ONE selected page and with
 * every section kept (hidden ones too, flagged), so a hidden section can still be clicked and shown again. Unlike the
 * publish-time preview this never fails on "not publishable yet": half-built drafts are exactly what the editor is for.
 * Pure. Reads nothing; the caller passes what the signed-in company's own RLS-bound reads returned.
 */
export function buildCanvasSite(input: {
  companyName: string; companySlug: string; settings: WebsiteSettings; pages: DraftPage[]; selected: DraftPage; sections: DraftSection[]; logoPath: string | null;
  /** Own images used by the sections (media id -> path + MIME), from a company-filtered read. Anything else a section names is simply not drawn. */
  images?: Record<string, { path: string; mime: string }>;
}): { data: PublicSite; page: SitePage; blocks: EditorBlock[] } {
  const { settings: s, selected } = input;
  const ordered = [...input.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const page: SitePage = {
    slug: selected.slug, title: selected.title, is_home: selected.isHome, seo_title: selected.seoTitle, seo_description: selected.seoDescription,
    sections: ordered.map((x) => ({ type: x.type, content: x.content })),
  };
  const nav: SitePage[] = input.pages.filter((p) => !p.isHome && p.isPublished && p.id !== selected.id).map((p) => ({ slug: p.slug, title: p.title, is_home: false, sections: [] }));
  const pages = [...(selected.isHome ? [page] : []), ...nav, ...(selected.isHome ? [] : [page])].sort((a, b) => Number(b.is_home) - Number(a.is_home));
  const data: PublicSite = {
    company: { name: input.companyName, slug: input.companySlug },
    version: 0,
    published_at: new Date(0).toISOString(),
    site: {
      schema_version: 1,
      settings: {
        site_title: s.siteTitle, meta_description: s.metaDescription, logo_media_id: input.logoPath ? 'logo' : null, favicon_media_id: null,
        primary_color: s.primaryColor, secondary_color: s.secondaryColor,
        contact_email: s.contactEmail, contact_phone: s.contactPhone, contact_whatsapp: s.contactWhatsapp, contact_address: s.contactAddress,
        social_links: s.socialLinks as Record<string, string>, footer_text: s.footerText,
      },
      pages,
      media: { ...(input.images ?? {}), ...(input.logoPath ? { logo: { path: input.logoPath, mime: 'image/png' } } : {}) },
    },
  };
  const blocks: EditorBlock[] = ordered.map((x) => ({ id: x.id, type: x.type, enabled: x.isEnabled, label: `${SECTION_LABELS[x.type].en} · ${SECTION_LABELS[x.type].ar}` }));
  return { data, page, blocks };
}
