'use client';
import { useId } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { controlClass } from '@/ds/primitives/Input';
import { buttonClass } from '@/ds/primitives/button-class';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { addPageFormAction } from '../website-actions';

/** "Add page" in the canvas: a name in either language is all it needs. The address is made from it and the page starts with one section. */
export function AddPage() {
  const lang = useDashLang();
  const id = useId();
  const { state, pending, ref, onSubmit } = useActionForm(addPageFormAction);
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-ds-md px-3 py-1.5 text-sm text-ink-secondary hover:text-ink-primary">+ {t('Add page', 'إضافة صفحة')}</summary>
      <form ref={ref} onSubmit={onSubmit} className="absolute start-0 top-full z-20 mt-2 w-72 space-y-3 rounded-ds-lg border border-line-default bg-surface-card p-4 shadow-lg">
        <div>
          <label htmlFor={`${id}-en`} className="block text-xs font-medium text-ink-secondary">{t('Page name (English)', 'اسم الصفحة (الإنجليزية)')}</label>
          <input id={`${id}-en`} name="titleEn" lang="en" dir="ltr" maxLength={120} className={`mt-1 ${controlClass(false)}`} />
        </div>
        <div>
          <label htmlFor={`${id}-ar`} className="block text-xs font-medium text-ink-secondary">{t('Page name (Arabic)', 'اسم الصفحة (العربية)')}</label>
          <input id={`${id}-ar`} name="titleAr" lang="ar" dir="rtl" maxLength={120} className={`mt-1 ${controlClass(false)}`} />
        </div>
        <p className="text-xs text-ink-muted">{t('Add a name in at least one language.', 'أضف اسمًا بلغة واحدة على الأقل.')}</p>
        <div className="flex items-center justify-between gap-2">
          <SaveStatus view={viewOfForm(state, pending)} />
          <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>{t('Add page', 'إضافة صفحة')}</button>
        </div>
      </form>
    </details>
  );
}
