import Link from 'next/link';
import { requireTenant } from '@/lib/auth/guards';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { readTenantConfig } from '@/lib/tenant/config';
import { tenantUrl } from '@/lib/tenant/url';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Bi, Dt } from '@/components/dashboard/T';
import { previewService, type PreviewIssue } from '@/features/website/preview-service';
import { publishService } from '@/features/website/publish-service';
import { PublishForm, RollbackForm, UnpublishForm } from '@/features/dashboard/website-editor/PublishForms';

const REQUIRED: Record<PreviewIssue, { en: string; ar: string }> = {
  settings_missing: { en: 'Save the website settings first.', ar: 'احفظ إعدادات الموقع أولًا.' },
  title_required: { en: 'Add a website title in Website settings.', ar: 'أضف عنوان الموقع في إعدادات الموقع.' },
  home_page_required: { en: 'The home page must be included when publishing.', ar: 'يجب تضمين الصفحة الرئيسية عند النشر.' },
  home_section_required: { en: 'The home page needs at least one visible section.', ar: 'تحتاج الصفحة الرئيسية إلى قسم واحد ظاهر على الأقل.' },
  too_large: { en: 'The site is too large. Remove some content.', ar: 'الموقع كبير جدًا. احذف بعض المحتوى.' },
  invalid_content: { en: 'Some content is not allowed (HTML or an unsafe link). Check your sections.', ar: 'بعض المحتوى غير مسموح (HTML أو رابط غير آمن). راجع أقسامك.' },
};
const card = 'space-y-3 rounded-2xl border border-line-default bg-surface-card p-5';

export default async function WebsitePublishPage() {
  const auth = await requireTenant('website.read'), canPublish = can(auth, PERMISSIONS.websitePublish);
  const ctx = createTenantServiceContext(await createClient(), auth);
  const [state, draft] = await Promise.all([publishService.getState(ctx), previewService.getDraft(ctx)]);
  const current = state.versions.find((v) => v.isCurrent);
  const liveUrl = state.isPublished && current ? tenantUrl(readTenantConfig(process.env), auth.membership.companySlug, '/') : null;

  // Recommendations never block publishing (the database checklist does); they only point at what a visitor would miss.
  const tips: Array<{ en: string; ar: string }> = [];
  if (draft.ok) {
    const st = draft.data.site.settings;
    if (!st.logo_media_id) tips.push({ en: 'No logo yet.', ar: 'لا يوجد شعار بعد.' });
    if (!st.contact_email && !st.contact_phone && !st.contact_whatsapp) tips.push({ en: 'No contact details yet (email, phone or WhatsApp).', ar: 'لا توجد بيانات تواصل (بريد أو هاتف أو واتساب).' });
    if (!draft.data.site.pages.some((p) => p.sections.some((s) => s.type === 'routes' || s.type === 'trips'))) tips.push({ en: 'No routes or trips section, so visitors cannot see your trips.', ar: 'لا يوجد قسم للخطوط أو الرحلات، فلن يرى الزوار رحلاتك.' });
  }

  return (
    <>
      <PageHeader eyebrow="Brand presence" title="Publish website" description="Make your draft public, go back to an earlier version, or take the site offline."
        action={<span className="flex gap-4 text-sm font-semibold"><Link href="/dashboard/website/preview" className="underline"><Bi en="Preview draft" ar="معاينة المسودة" /></Link><Link href="/dashboard/website/pages" className="underline"><Bi en="Edit pages" ar="تحرير الصفحات" /></Link></span>} />
      <div className="space-y-6">
        <section className={card} aria-labelledby="st">
          <h2 id="st" className="font-bold"><Bi en="Status" ar="الحالة" /></h2>
          {state.isPublished && current ? (
            <p className="text-sm"><Bi en={`Published: version ${current.version}, since `} ar={`منشور: النسخة ${current.version}، منذ `} /><Dt value={current.publishedAt} time />.
              {liveUrl && <> <a href={liveUrl} dir="ltr" className="font-semibold underline" rel="noopener">{liveUrl}</a></>}</p>
          ) : <p className="text-sm"><Bi en="Not published. Visitors cannot see your website." ar="غير منشور. لا يستطيع الزوار رؤية موقعك." /></p>}
        </section>

        <section className={card} aria-labelledby="rd">
          <h2 id="rd" className="font-bold"><Bi en="Before you publish" ar="قبل النشر" /></h2>
          {draft.ok
            ? <p className="text-sm"><Bi en="The draft is ready to publish." ar="المسودة جاهزة للنشر." /></p>
            : <p role="alert" className="text-sm font-semibold text-status-error-fg"><Bi en={REQUIRED[draft.issue].en} ar={REQUIRED[draft.issue].ar} /></p>}
          {tips.length > 0 && <ul className="list-disc space-y-1 ps-5 text-sm text-ink-secondary">{tips.map((t) => <li key={t.en}><Bi en={t.en} ar={t.ar} /></li>)}</ul>}
          {canPublish
            ? <PublishForm ready={draft.ok} isPublished={state.isPublished} />
            : <p className="text-xs text-ink-muted"><Bi en="You can edit the draft, but only an owner or manager can publish." ar="يمكنك تحرير المسودة، لكن النشر للمالك أو المدير فقط." /></p>}
        </section>

        <section className={card} aria-labelledby="hs">
          <h2 id="hs" className="font-bold"><Bi en="Versions" ar="النسخ" /></h2>
          {state.versions.length === 0 ? <p className="text-sm text-ink-secondary"><Bi en="Nothing published yet." ar="لم يُنشر شيء بعد." /></p> : (
            <ul className="divide-y divide-line-default">
              {state.versions.map((v) => (
                <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span><strong>v{v.version}</strong>{v.isCurrent && <span className="ms-2 text-xs font-semibold text-status-success-fg"><Bi en="live" ar="منشورة" /></span>} · <Dt value={v.publishedAt} time />{v.note ? <> · <span className="text-ink-secondary">{v.note}</span></> : null}</span>
                  {canPublish && !(v.isCurrent && state.isPublished) && <RollbackForm version={v.version} />}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-muted"><Bi en="Showing the latest 20 versions." ar="يعرض آخر 20 نسخة." /></p>
          {canPublish && state.isPublished && <div className="border-t border-line-default pt-3"><UnpublishForm /></div>}
        </section>
      </div>
    </>
  );
}
