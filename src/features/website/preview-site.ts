import type { PublicSite } from '@/features/site/schema';
import type { SectionShape } from './wizard-content';

/** Everything the wizard form can change, as the browser holds it while typing (nothing here is saved yet). */
export type LiveDraft = {
  titleEn: string; titleAr: string; primaryColor: string; secondaryColor: string;
  email: string; phone: string; whatsapp: string; addressEn: string; addressAr: string; footerEn: string; footerAr: string;
  content: SectionShape;
};

const hasText = (v: unknown): boolean => !!v && typeof v === 'object' && Object.values(v as Record<string, unknown>).some((x) => typeof x === 'string' && x.trim() !== '');
const loc = (en: string, ar: string) => ({ ...(en.trim() ? { en } : {}), ...(ar.trim() ? { ar } : {}) });

/**
 * The same site shape the public renderer reads (PublicSite), built from what is on screen right now. Pure: the live preview
 * calls it on every keystroke. Empty parts are left out, as they would be on the published site. Nothing is read from or written
 * to the database, so this can never show (or leak) anything the signed-in company does not already see in the form.
 */
export function buildPreviewSite(input: { companyName: string; companySlug: string; draft: LiveDraft; logoPath: string | null }): PublicSite {
  const { draft: d } = input;
  const c = d.content;
  const sections: Array<{ type: string; content: unknown }> = [{ type: 'hero', content: c.hero }];
  if (c.showRoutes) sections.push({ type: 'routes', content: {} });
  if (c.showTrips) sections.push({ type: 'trips', content: {} });
  if (hasText(c.about.title) || hasText(c.about.body)) sections.push({ type: 'about', content: c.about });
  const items = Array.isArray(c.faq.items) ? c.faq.items : [];
  if (items.length > 0) sections.push({ type: 'faq', content: c.faq });
  sections.push({ type: 'contact', content: {} });
  return {
    company: { name: input.companyName, slug: input.companySlug },
    version: 0,
    published_at: new Date(0).toISOString(),
    site: {
      schema_version: 1,
      settings: {
        site_title: loc(d.titleEn, d.titleAr), primary_color: d.primaryColor, secondary_color: d.secondaryColor,
        logo_media_id: input.logoPath ? 'logo' : null,
        contact_email: d.email.trim() || null, contact_phone: d.phone.trim() || null, contact_whatsapp: d.whatsapp.trim() || null,
        contact_address: loc(d.addressEn, d.addressAr), footer_text: loc(d.footerEn, d.footerAr), social_links: {},
      },
      pages: [{ slug: 'home', title: {}, is_home: true, sections }],
      media: input.logoPath ? { logo: { path: input.logoPath, mime: 'image/png' } } : {},
    },
  };
}
