'use client';
import { useId } from 'react';
import { Bi } from '@/components/dashboard/T';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { inputClass } from '@/components/dashboard/FormParts';
import { publishWebsiteFormAction, rollbackWebsiteFormAction, unpublishWebsiteFormAction } from '../website-actions';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { MiniActionForm } from './MiniActionForm';

export function PublishForm({ ready, isPublished }: { ready: boolean; isPublished: boolean }) {
  const id = useId();
  const lang = useDashLang();
  const { state, pending, ref, onSubmit } = useActionForm(publishWebsiteFormAction, { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={(e) => { if (!window.confirm(lang === 'ar' ? 'نشر المسودة الآن؟ ستظهر للعامة.' : 'Publish the draft now? It will be public.')) { e.preventDefault(); return; } onSubmit(e); }} className="space-y-3">
      <label htmlFor={id} className="block text-xs font-semibold text-ink-secondary"><Bi en="Note (optional, only your team sees it)" ar="ملاحظة (اختيارية، يراها فريقك فقط)" />
        <textarea id={id} name="note" rows={2} maxLength={500} className={`mt-1.5 ${inputClass(false)}`} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !ready} className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-ink-on-brand disabled:opacity-60">{isPublished ? <Bi en="Publish changes" ar="نشر التغييرات" /> : <Bi en="Publish website" ar="نشر الموقع" />}</button>
        <SaveStatus view={viewOfForm(state, pending)} />
      </div>
    </form>
  );
}

export function RollbackForm({ version }: { version: number }) {
  const lang = useDashLang();
  return <MiniActionForm action={rollbackWebsiteFormAction} fields={{ version: String(version) }} confirmText={lang === 'ar' ? `استعادة النسخة ${version} ونشرها الآن؟` : `Restore version ${version} and publish it now?`}><Bi en="Restore" ar="استعادة" /></MiniActionForm>;
}

export function UnpublishForm() {
  const lang = useDashLang();
  return <MiniActionForm action={unpublishWebsiteFormAction} fields={{}} className="text-status-error-fg" confirmText={lang === 'ar' ? 'إيقاف الموقع؟ سيختفي عن العامة ويتوقف الحجز عبره.' : 'Take the site offline? Visitors will no longer see it or book through it.'}><Bi en="Unpublish (take offline)" ar="إيقاف النشر" /></MiniActionForm>;
}
