import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { websiteService } from '@/features/website/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { WebsiteForm } from '@/features/dashboard/WebsiteForm';

export default async function WebsitePage() {
  const auth = await requireTenant('website.read'), ctx = createTenantServiceContext(await createClient(), auth), s = await websiteService.getSettings(ctx);
  return (
    <>
      <PageHeader eyebrow="Brand presence" title="Website settings" description="Configure your operator website identity, brand colours and customer contact details." />
      <WebsiteForm v={{ titleEn: s.siteTitle?.en || '', titleAr: s.siteTitle?.ar || '', primaryColor: s.primaryColor, secondaryColor: s.secondaryColor, footerEn: s.footerText?.en || '', footerAr: s.footerText?.ar || '', contactEmail: s.contactEmail || '', contactPhone: s.contactPhone || '', contactWhatsapp: s.contactWhatsapp || '' }} />
    </>
  );
}
