import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { wizardService } from '@/features/website/wizard-service';
import { CanvasStep } from '@/features/dashboard/website-flow/CanvasStep';
import { FLOW_STEPS, FlowButtons, FlowProgress, type FlowStep } from '@/features/dashboard/website-flow/FlowNav';
import { PreviewStep } from '@/features/dashboard/website-wizard/PreviewStep';
import { PublishStep } from '@/features/dashboard/website-wizard/PublishStep';

export const metadata: Metadata = { robots: { index: false, follow: false } };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * The website in three steps: customize (pages, sections, look, details) -> preview -> publish. Moving between them is Back and Next only.
 * The step lives in the URL and is checked against the fixed list; it never grants anything (each step's service re-checks permissions).
 */
export default async function WebsiteFlowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [auth, sp] = await Promise.all([requireTenant('website.read'), searchParams]);
  const asked = first(sp.step) as FlowStep | undefined;
  const step: FlowStep = asked && FLOW_STEPS.includes(asked) ? asked : 'design';
  const ctx = createTenantServiceContext(await createClient(), auth);
  // Opening creates the starter site (home page with sections) once, as a draft, for someone who may write. Idempotent; never overwrites.
  if (can(auth, PERMISSIONS.websiteWrite)) await wizardService.open(ctx);
  return (
    <>
      <PageHeader title="Website" description={<Bi en="Customize your pages, check the preview, then publish." ar="خصّص صفحاتك، راجع المعاينة، ثم انشر." />} />
      <div className="mb-6"><FlowProgress active={step} /></div>
      {step === 'design' && <CanvasStep ctx={ctx} auth={auth} sp={sp} />}
      {step === 'preview' && <PreviewStep ctx={ctx} lang={first(sp.lang)} pageSlug={first(sp.page)} />}
      {step === 'publish' && <PublishStep ctx={ctx} />}
      <FlowButtons active={step} />
    </>
  );
}
