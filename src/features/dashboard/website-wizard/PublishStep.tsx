import Link from 'next/link';
import type { TenantServiceContext } from '@/lib/service/context';
import { can } from '@/lib/auth/permissions';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { readTenantConfig } from '@/lib/tenant/config';
import { tenantUrl } from '@/lib/tenant/url';
import { Bi, Dt } from '@/components/dashboard/T';
import { previewService } from '@/features/website/preview-service';
import { publishService } from '@/features/website/publish-service';
import { PublishForm, RollbackForm, UnpublishForm } from '../website-editor/PublishForms';
import { ISSUE_FIX } from './PreviewStep';

const card = 'space-y-3 rounded-ds-lg border border-line-default bg-surface-card p-5';

export async function PublishStep({ ctx }: { ctx: TenantServiceContext }) {
  const canPublish = can(ctx.auth, PERMISSIONS.websitePublish);
  const [state, draft] = await Promise.all([publishService.getState(ctx), previewService.getDraft(ctx)]);
  const current = state.versions.find((v) => v.isCurrent);
  const liveUrl = state.isPublished && current ? tenantUrl(readTenantConfig(process.env), ctx.auth.membership.companySlug, '/') : null;
  const tips: Array<{ en: string; ar: string; step: string }> = [];
  if (draft.ok) {
    const st = draft.data.site.settings;
    if (!st.logo_media_id) tips.push({ step: 'identity', en: 'No logo yet. Add one on the brand step.', ar: 'لا يوجد شعار بعد. أضفه في خطوة العلامة.' });
  }
  return (
    <div className="space-y-5">
      <section className={card} aria-labelledby="st">
        <h3 id="st" className="text-sm font-medium"><Bi en="Status" ar="الحالة" /></h3>
        {state.isPublished && current ? (
          <p className="text-sm"><Bi en={`Live: version ${current.version}, since `} ar={`منشور: النسخة ${current.version}، منذ `} /><Dt value={current.publishedAt} time />.
            {liveUrl && <> <a href={liveUrl} dir="ltr" className="font-medium underline" rel="noopener">{liveUrl}</a></>}</p>
        ) : <p className="text-sm"><Bi en="Not published. Riders cannot see your website yet." ar="غير منشور. لا يستطيع الركاب رؤية موقعك بعد." /></p>}
      </section>
      <section className={card} aria-labelledby="rd">
        <h3 id="rd" className="text-sm font-medium"><Bi en="Before you publish" ar="قبل النشر" /></h3>
        {draft.ok
          ? <p className="text-sm"><Bi en="Everything required is filled in." ar="كل ما هو مطلوب مكتمل." /></p>
          : <p role="alert" className="text-sm text-status-error-fg"><Bi en={ISSUE_FIX[draft.issue].en} ar={ISSUE_FIX[draft.issue].ar} />{' '}<Link href={`/dashboard/website?step=${ISSUE_FIX[draft.issue].step}`} className="font-medium underline"><Bi en="Fix it" ar="أصلحه" /></Link></p>}
        {tips.length > 0 && <ul className="list-disc space-y-1 ps-5 text-sm text-ink-secondary">{tips.map((t) => <li key={t.en}><Link href={`/dashboard/website?step=${t.step}`} className="underline"><Bi en={t.en} ar={t.ar} /></Link></li>)}</ul>}
        {canPublish
          ? <PublishForm ready={draft.ok} isPublished={state.isPublished} />
          : <p className="text-xs text-ink-muted"><Bi en="Only an owner or manager can publish." ar="النشر للمالك أو المدير فقط." /></p>}
      </section>
      {state.versions.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium"><Bi en="Earlier versions" ar="النسخ السابقة" /></summary>
          <ul className="mt-3 divide-y divide-line-default">
            {state.versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><strong>v{v.version}</strong>{v.isCurrent && <span className="ms-2 text-xs font-medium text-status-success-fg"><Bi en="live" ar="منشورة" /></span>} <span className="text-ink-secondary"><Dt value={v.publishedAt} time />{v.note ? ` · ${v.note}` : ''}</span></span>
                {canPublish && !(v.isCurrent && state.isPublished) && <RollbackForm version={v.version} />}
              </li>
            ))}
          </ul>
          {canPublish && state.isPublished && <div className="mt-3 border-t border-line-default pt-3"><UnpublishForm /></div>}
        </details>
      )}
    </div>
  );
}
