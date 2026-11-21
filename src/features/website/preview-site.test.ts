import { describe, expect, it } from 'vitest';
import { publicSiteSchema } from '@/features/site/schema';
import { buildPreviewSite, type LiveDraft } from './preview-site';

const base: LiveDraft = {
  titleEn: 'Nile Buses', titleAr: '', primaryColor: '#006644', secondaryColor: '#112233', email: 'a@b.co', phone: '', whatsapp: '',
  addressEn: '', addressAr: '', footerEn: '', footerAr: '',
  content: { hero: { title: { en: 'Ride' } }, about: {}, faq: { items: [] }, showRoutes: true, showTrips: false },
};
describe('buildPreviewSite', () => {
  it('produces a site the public renderer accepts, leaving empty parts out', () => {
    const s = buildPreviewSite({ companyName: 'Nile', companySlug: 'nile', draft: base, logoPath: null });
    expect(publicSiteSchema.safeParse(s).success).toBe(true);
    expect(s.site.pages[0]!.sections.map((x) => x.type)).toEqual(['hero', 'routes', 'contact']);
    expect(s.site.settings.contact_phone).toBeNull();
  });
  it('adds about/faq/trips when they have content and wires the logo', () => {
    const d = { ...base, content: { ...base.content, showTrips: true, about: { body: { en: 'Hi' } }, faq: { items: [{ question: { en: 'Q' } }] } } };
    const s = buildPreviewSite({ companyName: 'Nile', companySlug: 'nile', draft: d, logoPath: 'c/logo/x.png' });
    expect(s.site.pages[0]!.sections.map((x) => x.type)).toEqual(['hero', 'routes', 'trips', 'about', 'faq', 'contact']);
    expect(s.site.settings.logo_media_id).toBe('logo');
    expect(s.site.media.logo!.path).toBe('c/logo/x.png');
  });
});
