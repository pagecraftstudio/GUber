import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { AppError } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { pagesService } from '@/features/website/pages-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { AddSectionForm, DeletePageForm, PageMetaForm } from '@/features/dashboard/website-editor/PageForms';
import { SectionCard } from '@/features/dashboard/website-editor/SectionCard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WebsitePageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const auth = await requireTenant('website.read'), canWrite = can(auth, PERMISSIONS.websiteWrite);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const data = await pagesService.getPageWithSections(ctx, id).catch((e) => { if (e instanceof AppError && e.code === 'not_found') notFound(); throw e; });
  const { page, sections } = data;
  return (
    <>
      <PageHeader eyebrow="Brand presence" title={page.title.en || page.title.ar || 'Page'} description="Draft content. Save each section; changes go public only when you publish."
        action={<Link href="/dashboard/website/pages" className="text-sm font-semibold underline"><Bi en="All pages" ar="كل الصفحات" /></Link>} />
      <div className="space-y-6">
        <PageMetaForm page={page} canWrite={canWrite} />
        {sections.length === 0 && <p className="text-sm text-ink-secondary"><Bi en="This page has no sections yet." ar="لا توجد أقسام في هذه الصفحة بعد." /></p>}
        {sections.map((s, i) => <SectionCard key={`${s.id}:${s.updatedAt}`} section={s} index={i} count={sections.length} canWrite={canWrite} />)}
        {canWrite && <AddSectionForm pageId={page.id} />}
        {canWrite && !page.isHome && <div className="border-t border-line-default pt-4"><DeletePageForm pageId={page.id} /></div>}
      </div>
    </>
  );
}
