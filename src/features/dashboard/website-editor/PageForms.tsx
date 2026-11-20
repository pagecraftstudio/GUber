'use client';
import { useId } from 'react';
import { Bi } from '@/components/dashboard/T';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { inputClass } from '@/components/dashboard/FormParts';
import { ADDABLE_SECTIONS, SECTION_LABELS } from '@/features/website/section-fields';
import type { DraftPage } from '@/features/website/pages-types';
import { addSectionFormAction, createPageFormAction, deletePageFormAction, savePageMetaFormAction } from '../website-actions';
import { fieldErr } from '../CreateForms';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { MiniActionForm } from './MiniActionForm';

const card = 'space-y-4 rounded-2xl border border-line-default bg-surface-card p-5';
const btn = 'rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-ink-on-brand disabled:opacity-60';

function Txt({ name, label, defaultValue = '', dir, err }: { name: string; label: React.ReactNode; defaultValue?: string; dir?: 'ltr' | 'rtl'; err?: string | null }) {
  return (
    <label className="block text-xs font-semibold text-ink-secondary">{label}
      <input name={name} defaultValue={defaultValue} dir={dir} aria-invalid={err ? true : undefined} className={`mt-1.5 ${inputClass(false)}`} />
      {err && <span className="mt-1 block text-xs font-semibold text-status-error-fg">{err}</span>}
    </label>
  );
}

export function PageCreateForm() {
  const lang = useDashLang();
  const { state, pending, ref, onSubmit } = useActionForm(createPageFormAction, { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className={card}>
      <h2 className="font-bold"><Bi en="New page" ar="صفحة جديدة" /></h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Txt name="titleEn" label="Title (English)" err={fieldErr(state, lang, 'title')} />
        <Txt name="titleAr" label="العنوان (العربية)" dir="rtl" />
        <Txt name="slug" dir="ltr" label={<Bi en="Address (a-z, 0-9, -)" ar="العنوان (a-z و 0-9 و -)" />} err={fieldErr(state, lang, 'slug')} />
      </div>
      <div className="flex items-center gap-3"><button type="submit" disabled={pending} className={btn}><Bi en="Create page" ar="إنشاء صفحة" /></button><SaveStatus view={viewOfForm(state, pending)} /></div>
    </form>
  );
}

export function PageMetaForm({ page, canWrite }: { page: DraftPage; canWrite: boolean }) {
  const lang = useDashLang();
  const { state, pending, ref, onSubmit } = useActionForm(savePageMetaFormAction);
  return (
    <form ref={ref} onSubmit={onSubmit} className={card}>
      <h2 className="font-bold"><Bi en="Page details" ar="تفاصيل الصفحة" /></h2>
      <input type="hidden" name="pageId" value={page.id} />
      <fieldset disabled={!canWrite} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Txt name="titleEn" label="Title (English)" defaultValue={page.title.en} err={fieldErr(state, lang, 'title')} />
          <Txt name="titleAr" label="العنوان (العربية)" defaultValue={page.title.ar} dir="rtl" />
          <Txt name="seoTitleEn" label="Search title (English)" defaultValue={page.seoTitle?.en} />
          <Txt name="seoTitleAr" label="عنوان محركات البحث (العربية)" defaultValue={page.seoTitle?.ar} dir="rtl" />
          <Txt name="seoDescEn" label="Search description (English)" defaultValue={page.seoDescription?.en} />
          <Txt name="seoDescAr" label="وصف محركات البحث (العربية)" defaultValue={page.seoDescription?.ar} dir="rtl" />
        </div>
        {!page.isHome && (
          <label className="flex items-center gap-2 text-sm"><input type="hidden" name="isPublished" value="0" />
            <input type="checkbox" name="isPublished" value="1" defaultChecked={page.isPublished} onChange={() => {}} />
            <Bi en="Include this page when publishing" ar="تضمين هذه الصفحة عند النشر" /></label>
        )}
      </fieldset>
      {canWrite && <div className="flex items-center gap-3"><button type="submit" disabled={pending} className={btn}><Bi en="Save details" ar="حفظ التفاصيل" /></button><SaveStatus view={viewOfForm(state, pending)} /></div>}
    </form>
  );
}

export function AddSectionForm({ pageId }: { pageId: string }) {
  const lang = useDashLang();
  const id = useId();
  const { state, pending, ref, onSubmit } = useActionForm(addSectionFormAction);
  return (
    <form ref={ref} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pageId" value={pageId} />
      <label htmlFor={id} className="text-xs font-semibold text-ink-secondary"><Bi en="Add a section" ar="إضافة قسم" />
        <select id={id} name="type" className={`mt-1.5 ${inputClass(false)}`} defaultValue="about">{ADDABLE_SECTIONS.map((t) => <option key={t} value={t}>{SECTION_LABELS[t][lang]}</option>)}</select>
      </label>
      <button type="submit" disabled={pending} className={btn}><Bi en="Add" ar="إضافة" /></button>
      <SaveStatus view={viewOfForm(state, pending)} />
    </form>
  );
}

export function DeletePageForm({ pageId }: { pageId: string }) {
  const lang = useDashLang();
  return <MiniActionForm action={deletePageFormAction} fields={{ pageId }} className="text-status-error-fg" confirmText={lang === 'ar' ? 'حذف هذه الصفحة وكل أقسامها؟' : 'Delete this page and all its sections?'}><Bi en="Delete page" ar="حذف الصفحة" /></MiniActionForm>;
}
