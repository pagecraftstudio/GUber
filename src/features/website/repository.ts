import { mapColumns } from '@/lib/db/columns';
import { expectMaybe, expectOne } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import type { WebsiteSettingsUpdate } from './schema';
import { WEBSITE_SELECT, toWebsiteSettings, type WebsiteSettings, type WebsiteSettingsRow } from './types';

export type WebsiteRepository = {
  get(ctx: TenantServiceContext): Promise<WebsiteSettings | null>;
  save(ctx: TenantServiceContext, patch: WebsiteSettingsUpdate): Promise<WebsiteSettings>;
};

const COLUMNS = {
  siteTitle: 'site_title',
  metaDescription: 'meta_description',
  primaryColor: 'primary_color',
  secondaryColor: 'secondary_color',
  fontHeading: 'font_heading',
  fontBody: 'font_body',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  contactWhatsapp: 'contact_whatsapp',
  contactAddress: 'contact_address',
  socialLinks: 'social_links',
  footerText: 'footer_text',
} as const;

export const websiteRepository: WebsiteRepository = {
  async get(ctx) {
    return expectMaybe<WebsiteSettingsRow, WebsiteSettings>(
      await ctx.db.from('website_settings').select(WEBSITE_SELECT).eq('company_id', ctx.companyId).maybeSingle(),
      toWebsiteSettings,
    );
  },

  /** The row is created lazily (company creation only makes company_settings), so saving is an upsert. */
  async save(ctx, patch) {
    const row = { company_id: ctx.companyId, ...mapColumns(patch, COLUMNS) };
    return expectOne<WebsiteSettingsRow, WebsiteSettings>(
      await ctx.db.from('website_settings').upsert(row, { onConflict: 'company_id' }).select(WEBSITE_SELECT).single(),
      toWebsiteSettings,
    );
  },
};
