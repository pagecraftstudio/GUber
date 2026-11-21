import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createTenantServiceContext } from '@/lib/service/context';
import { pagesService } from '@/features/website/pages-service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi } from '@/components/dashboard/T';
import { PageCreateForm } from '@/features/dashboard/website-editor/PageForms';

export default async function WebsitePagesPage() {
  const auth = await requireTenant('website.read'), canWrite = can(auth, PERMISSIONS.websiteWrite);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const pages = canWrite ? await pagesService.ensureHomePage(ctx) : await pagesService.listPages(ctx);
  return (
    <>
      <PageHeader eyebrow="Brand presence" title="Website pages" description="Edit the draft of your website. Nothing here is public until you publish." action={<Link href="/dashboard/website" className="text-sm font-semibold underline"><Bi en="Back to website" ar="العودة إلى الموقع" /></Link>} />
      <div className="space-y-6">
        <ul className="divide-y divide-line-default rounded-2xl border border-line-default bg-surface-card">
          {pages.length === 0 && <li className="p-5 text-sm text-ink-secondary"><Bi en="No pages yet." ar="لا توجد صفحات بعد." /></li>}
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-4">
              <Link href={`/dashboard/website/pages/${p.id}`} className="font-semibold underline-offset-2 hover:underline">{p.title.en || p.title.ar || p.slug}</Link>
              <span dir="ltr" className="text-xs text-ink-muted">{p.isHome ? '/' : `/${p.slug}`}{!p.isHome && !p.isPublished ? ' · excluded' : ''}</span>
            </li>
          ))}
        </ul>
        {canWrite && <PageCreateForm />}
      </div>
    </>
  );
}
