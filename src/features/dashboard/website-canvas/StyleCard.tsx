'use client';
import { useId } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import type { DraftSection } from '@/features/website/pages-types';
import { ALIGNS, BACKGROUNDS, SPACINGS, readStyle } from '@/features/site/section-style';
import { setSectionStyleFormAction } from '../website-actions';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';

type Bi = { en: string; ar: string };
const BG: Record<(typeof BACKGROUNDS)[number], Bi> = { plain: { en: 'Plain', ar: 'عادي' }, tint: { en: 'Soft', ar: 'هادئ' }, brand: { en: 'Brand colour', ar: 'لون العلامة' } };
const AL: Record<(typeof ALIGNS)[number], Bi> = { start: { en: 'Start', ar: 'البداية' }, center: { en: 'Centre', ar: 'الوسط' } };
const SP: Record<(typeof SPACINGS)[number], Bi> = { compact: { en: 'Tight', ar: 'ضيق' }, normal: { en: 'Normal', ar: 'عادي' }, roomy: { en: 'Roomy', ar: 'واسع' } };

/**
 * Background, alignment and spacing of ONE section. Each choice saves at once (own form: it cannot sit inside the text form, whose
 * save keeps the stored style untouched). The hero has its own background, so it only offers alignment and spacing.
 */
export function StyleCard({ section }: { section: DraftSection }) {
  const lang = useDashLang();
  const id = useId();
  const { state, pending, ref, onSubmit, submit } = useActionForm(setSectionStyleFormAction);
  const choose = (name: string, value: string) => {
    const fd = new FormData();
    fd.set('pageId', section.pageId); fd.set('sectionId', section.id); fd.set(name, value);
    submit(fd);
  };
  const cur = readStyle(section.content.style);
  const t = (b: Bi) => b[lang];
  const group = (name: 'background' | 'align' | 'spacing', label: Bi, labels: Record<string, Bi>, values: readonly string[], active: string) => (
    <div role="group" aria-labelledby={`${id}-${name}`} className="space-y-1">
      <p id={`${id}-${name}`} className="text-xs text-ink-secondary">{t(label)}</p>
      <div className="flex flex-wrap gap-1">
        {values.map((v) => (
          <button key={v} type="button" onClick={() => choose(name, v)} aria-pressed={active === v} disabled={pending}
            className={`rounded-ds-md border px-2.5 py-1 text-xs transition-colors duration-(--duration-ds-feedback) disabled:opacity-60 ${active === v ? 'border-line-strong bg-surface-sunken font-medium' : 'border-line-default hover:bg-surface-sunken'}`}>{t(labels[v]!)}</button>
        ))}
      </div>
    </div>
  );
  return (
    <form ref={ref} onSubmit={onSubmit} className="mb-3 space-y-3 rounded-ds-md border border-line-default bg-surface-page p-3">
      <input type="hidden" name="pageId" value={section.pageId} /><input type="hidden" name="sectionId" value={section.id} />
      <h3 className="text-xs font-semibold text-ink-secondary">{lang === 'ar' ? 'مظهر القسم' : 'Section look'}</h3>
      {section.type !== 'hero' && group('background', { en: 'Background', ar: 'الخلفية' }, BG, BACKGROUNDS, cur.background)}
      {group('align', { en: 'Text alignment', ar: 'محاذاة النص' }, AL, ALIGNS, cur.align)}
      {group('spacing', { en: 'Space above and below', ar: 'المسافة أعلى وأسفل' }, SP, SPACINGS, cur.spacing)}
      <SaveStatus view={viewOfForm(state, pending)} />
    </form>
  );
}
