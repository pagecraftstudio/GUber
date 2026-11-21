'use client';
import { useId, useState } from 'react';
import { StepForm } from './StepForm';
import { FieldsForm } from '../website-editor/fields';
import { SECTION_FIELDS } from '@/features/website/section-fields';
import type { SectionShape } from '@/features/website/wizard-content';
import { saveContentStepAction } from '../wizard-actions';
import { useDashLang } from '../lang';

type Obj = Record<string, unknown>;

/**
 * The home page as three blocks plus two switches. The fields come from the same table the editor used (section-fields.ts), so the
 * limits and labels cannot drift from the write schema. The browser sends one JSON value; the server rebuilds typed content from it
 * (fromSectionShape) and the service validates it again with the strict section schemas.
 */
export function ContentStep({ initial, canWrite, backHref, forwardHref }: { initial: SectionShape; canWrite: boolean; backHref: string | null; forwardHref: string | null }) {
  const lang = useDashLang();
  const uid = useId();
  const [hero, setHero] = useState<Obj>(initial.hero);
  const [about, setAbout] = useState<Obj>(initial.about);
  const [faq, setFaq] = useState<Obj>(initial.faq);
  const [showRoutes, setShowRoutes] = useState(initial.showRoutes);
  const [showTrips, setShowTrips] = useState(initial.showTrips);
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const card = 'space-y-4 rounded-ds-lg border border-line-default bg-surface-card p-5';
  return (
    <StepForm action={saveContentStepAction} step="content" backHref={backHref} forwardHref={forwardHref} canWrite={canWrite}>
      <input type="hidden" name="content" value={JSON.stringify({ hero, about, faq, showRoutes, showTrips })} />
      <section aria-labelledby={`${uid}-hero`} className={card}>
        <h3 id={`${uid}-hero`} className="text-sm font-medium">{t('Top banner', 'البانر العلوي')}</h3>
        <FieldsForm defs={SECTION_FIELDS.hero} value={hero} onChange={setHero} disabled={!canWrite} idPrefix={`${uid}-hero`} />
      </section>
      <section aria-labelledby={`${uid}-live`} className={card}>
        <h3 id={`${uid}-live`} className="text-sm font-medium">{t('Show from your live data', 'عرض من بياناتك المباشرة')}</h3>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={showRoutes} onChange={(e) => setShowRoutes(e.target.checked)} className="mt-1" />
          <span>{t('Your routes', 'خطوطك')}<span className="block text-xs text-ink-muted">{t('Lists your active routes automatically.', 'يعرض خطوطك الفعّالة تلقائيًا.')}</span></span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={showTrips} onChange={(e) => setShowTrips(e.target.checked)} className="mt-1" />
          <span>{t('Upcoming trips', 'الرحلات القادمة')}<span className="block text-xs text-ink-muted">{t('Lists trips riders can book right now.', 'يعرض الرحلات المتاحة للحجز الآن.')}</span></span></label>
      </section>
      <section aria-labelledby={`${uid}-about`} className={card}>
        <h3 id={`${uid}-about`} className="text-sm font-medium">{t('About your company', 'عن شركتك')}</h3>
        <FieldsForm defs={SECTION_FIELDS.about} value={about} onChange={setAbout} disabled={!canWrite} idPrefix={`${uid}-about`} />
      </section>
      <section aria-labelledby={`${uid}-faq`} className={card}>
        <h3 id={`${uid}-faq`} className="text-sm font-medium">{t('Common questions', 'الأسئلة الشائعة')}</h3>
        <FieldsForm defs={SECTION_FIELDS.faq.filter((d) => d.key === 'items')} value={faq} onChange={setFaq} disabled={!canWrite} idPrefix={`${uid}-faq`} />
      </section>
    </StepForm>
  );
}
