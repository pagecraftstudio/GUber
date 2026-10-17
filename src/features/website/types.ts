export type Localized = { ar?: string; en?: string } | null;
export type SocialLinks = Partial<Record<'facebook' | 'instagram' | 'x' | 'tiktok' | 'youtube' | 'linkedin' | 'telegram', string>>;

export type WebsiteSettingsRow = {
  is_published: boolean;
  site_title: Localized;
  meta_description: Localized;
  logo_media_id: string | null;
  favicon_media_id: string | null;
  primary_color: string;
  secondary_color: string;
  font_heading: string;
  font_body: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_address: Localized;
  social_links: SocialLinks;
  footer_text: Localized;
  updated_at: string;
};

export type WebsiteSettings = {
  /** False until the company publishes (Phase 7 snapshot RPC). Not writable here. */
  isPublished: boolean;
  siteTitle: Localized;
  metaDescription: Localized;
  logoMediaId: string | null;
  faviconMediaId: string | null;
  primaryColor: string;
  secondaryColor: string;
  fontHeading: string;
  fontBody: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactWhatsapp: string | null;
  contactAddress: Localized;
  socialLinks: SocialLinks;
  footerText: Localized;
  /** null when the row has never been saved (the values above are then the database defaults). */
  updatedAt: string | null;
};

export const WEBSITE_SELECT =
  'is_published,site_title,meta_description,logo_media_id,favicon_media_id,primary_color,secondary_color,font_heading,font_body,contact_email,contact_phone,contact_whatsapp,contact_address,social_links,footer_text,updated_at';

/** Mirrors the column defaults in migration 0003 for a company that has not saved settings yet. */
export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  isPublished: false,
  siteTitle: null,
  metaDescription: null,
  logoMediaId: null,
  faviconMediaId: null,
  primaryColor: '#1d4ed8',
  secondaryColor: '#0f172a',
  fontHeading: 'cairo',
  fontBody: 'cairo',
  contactEmail: null,
  contactPhone: null,
  contactWhatsapp: null,
  contactAddress: null,
  socialLinks: {},
  footerText: null,
  updatedAt: null,
};

export const toWebsiteSettings = (r: WebsiteSettingsRow): WebsiteSettings => ({
  isPublished: r.is_published,
  siteTitle: r.site_title,
  metaDescription: r.meta_description,
  logoMediaId: r.logo_media_id,
  faviconMediaId: r.favicon_media_id,
  primaryColor: r.primary_color,
  secondaryColor: r.secondary_color,
  fontHeading: r.font_heading,
  fontBody: r.font_body,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  contactWhatsapp: r.contact_whatsapp,
  contactAddress: r.contact_address,
  socialLinks: r.social_links ?? {},
  footerText: r.footer_text,
  updatedAt: r.updated_at,
});
