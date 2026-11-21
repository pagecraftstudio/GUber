import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { getEnv } from '@/lib/env';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { wizardService } from '@/features/website/wizard-service';
import { WIZARD_STEPS, type WizardStep } from '@/features/website/wizard-state';
import { toSectionShape } from '@/features/website/wizard-content';
import { mediaUrl } from '@/features/site/text';
import { getSiteTrips, type SiteTrip } from '@/features/site/trips-data';
import { EditLayout } from '@/features/dashboard/website-wizard/EditLayout';
import type { LiveDraft } from '@/features/website/preview-site';
import { Stepper } from '@/features/dashboard/website-wizard/Stepper';
import { STEP_TEXT } from '@/features/dashboard/website-wizard/copy';
import { IdentityStep } from '@/features/dashboard/website-wizard/IdentityStep';
import { LogoCard } from '@/features/dashboard/website-wizard/LogoCard';
import { ContentStep } from '@/features/dashboard/website-wizard/ContentStep';
import { ContactStep } from '@/features/dashboard/website-wizard/ContactStep';
import { PreviewStep } from '@/features/dashboard/website-wizard/PreviewStep';
import { PublishStep } from '@/features/dashboard/website-wizard/PublishStep';

export const metadata: Metadata = { robots: { index: false, follow: false } };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function WebsiteWizardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [auth, sp] = await Promise.all([requireTenant('website.read'), searchParams]);
  const canWrite = can(auth, PERMISSIONS.websiteWrite);
  const ctx = createTenantServiceContext(await createClient(), auth);
  // Opening the wizard creates the starter content (idempotent, draft only) for someone who may write; read-only staff just see the state.
  const state = canWrite ? (await wizardService.open(ctx)).state : await wizardService.state(ctx);
  const asked = first(sp.step) as WizardStep | undefined;
  const step: WizardStep = asked && WIZARD_STEPS.includes(asked) ? asked : state.current;
  const idx = WIZARD_STEPS.indexOf(step);
  const backHref = idx > 0 ? `/dashboard/website?step=${WIZARD_STEPS[idx - 1]}` : null;
  const forwardHref = idx < WIZARD_STEPS.length - 1 ? `/dashboard/website?step=${WIZARD_STEPS[idx + 1]}` : null;
  const draft = step === 'identity' || step === 'content' || step === 'contact' ? await wizardService.read(ctx) : null;
  const text = STEP_TEXT[step];
  let trips: SiteTrip[] = [];
  if (draft) { try { trips = await getSiteTrips(ctx.companyId); } catch { trips = []; } } // a trips outage must not break the editor
  const st = draft?.settings;
  const initial: LiveDraft | null = draft && st ? {
    titleEn: st.siteTitle?.en ?? '', titleAr: st.siteTitle?.ar ?? '', primaryColor: st.primaryColor, secondaryColor: st.secondaryColor,
    email: st.contactEmail ?? '', phone: st.contactPhone ?? '', whatsapp: st.contactWhatsapp ?? '',
    addressEn: st.contactAddress?.en ?? '', addressAr: st.contactAddress?.ar ?? '', footerEn: st.footerText?.en ?? '', footerAr: st.footerText?.ar ?? '',
    content: toSectionShape(draft.content),
  } : null;
  const logoUrl = draft?.logoPath ? mediaUrl(getEnv().NEXT_PUBLIC_SUPABASE_URL, { path: draft.logoPath, mime: 'image/png' } as Parameters<typeof mediaUrl>[1]) : null;
  const common = { canWrite, backHref, forwardHref };
  return (
    <>
      <PageHeader title="Website" description={<Bi en="Set up your public website in a few steps." ar="جهّز موقعك العام في بضع خطوات." />} action={<Link href="/dashboard/website/design" className="text-sm font-semibold underline"><Bi en="Customize visually" ar="تخصيص مرئي" /></Link>} />
      <div className="space-y-6">
        <Stepper steps={state.steps} active={step} />
        <section aria-labelledby="wiz-h" className="min-w-0 space-y-5">
          <div>
            <h2 id="wiz-h" className="text-lg font-medium"><Bi en={text.title.en} ar={text.title.ar} /></h2>
            <p className="mt-1 text-sm text-ink-secondary"><Bi en={text.hint.en} ar={text.hint.ar} /></p>
          </div>
          {draft ? (
            <EditLayout initial={initial!} companyName={auth.membership.companyName} companySlug={auth.membership.companySlug} logoPath={draft.logoPath} supabaseUrl={getEnv().NEXT_PUBLIC_SUPABASE_URL} trips={trips}>
              {step === 'identity' && (<><LogoCard logoUrl={logoUrl} canWrite={canWrite} /><IdentityStep settings={draft.settings} {...common} /></>)}
              {step === 'content' && <ContentStep initial={toSectionShape(draft.content)} {...common} />}
              {step === 'contact' && <ContactStep settings={draft.settings} {...common} />}
            </EditLayout>
          ) : null}
          {step === 'preview' && (<><PreviewStep ctx={ctx} lang={first(sp.lang)} /><div className="flex justify-between border-t border-line-default pt-4">{backHref && <a href={backHref} className="text-sm underline"><Bi en="Back" ar="رجوع" /></a>}{forwardHref && <a href={forwardHref} className="text-sm font-medium underline"><Bi en="Continue" ar="متابعة" /></a>}</div></>)}
          {step === 'publish' && <PublishStep ctx={ctx} />}
        </section>
      </div>
    </>
  );
}
