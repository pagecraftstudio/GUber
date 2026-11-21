'use client';
import { useId, useState } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { buttonClass } from '@/ds/primitives/button-class';
import type { DraftSection } from '@/features/website/pages-types';
import { removeSectionImageFormAction, setSectionImagePositionFormAction, uploadSectionImageFormAction } from '../website-actions';
import { IMAGE_ACCEPT, imageFileProblem } from '../website-editor/image-file';
import { MiniActionForm } from '../website-editor/MiniActionForm';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';

const POSITIONS = [
  { value: 'beside', en: 'Beside the text', ar: 'بجانب النص' },
  { value: 'full', en: 'Full-width background', ar: 'خلفية بعرض الصفحة' },
] as const;

/**
 * Hero image: upload / replace / remove, and where it sits. Every control saves at once (it is not part of the text form, which
 * keeps the stored image untouched when saved). Its own forms: a form cannot sit inside the text form. The browser only pre-checks
 * size and type; the server sniffs the real bytes and the database re-checks.
 */
export function HeroImageCard({ section, imageUrl, canUpload }: { section: DraftSection; imageUrl: string | null; canUpload: boolean }) {
  const lang = useDashLang();
  const id = useId();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [local, setLocal] = useState<string | null>(null);
  const up = useActionForm(uploadSectionImageFormAction);
  const pos = useActionForm(setSectionImagePositionFormAction);
  const has = typeof section.content.image_media_id === 'string';
  const position = section.content.image_position === 'full' ? 'full' : 'beside';
  const ids = { pageId: section.pageId, sectionId: section.id };
  return (
    <div role="group" aria-labelledby={`${id}-h`} className="mb-3 space-y-3 rounded-ds-md border border-line-default bg-surface-page p-3">
      <div>
        <h3 id={`${id}-h`} className="text-xs font-semibold text-ink-secondary">{t('Banner image', 'صورة البانر')}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{t('PNG, JPEG or WebP, up to 2 MB. Saved as soon as you choose.', 'PNG أو JPEG أو WebP حتى 2 ميجابايت. يُحفظ فور الاختيار.')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-ds-md border border-line-default bg-surface-sunken text-xs text-ink-muted">
          {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : <span>{has ? t('Saved', 'محفوظة') : t('None', 'لا شيء')}</span>}
        </div>
        {canUpload ? (
          <div className="flex flex-wrap items-center gap-2">
            <form ref={up.ref} onSubmit={up.onSubmit}>
              <input type="hidden" name="pageId" value={ids.pageId} />
              <input type="hidden" name="sectionId" value={ids.sectionId} />
              <input id={id} type="file" name="file" accept={IMAGE_ACCEPT} className="sr-only"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (!f) return;
                  const problem = imageFileProblem(f, lang);
                  if (problem) { setLocal(problem); e.currentTarget.value = ''; return; }
                  setLocal(null);
                  e.currentTarget.form?.requestSubmit();
                }} />
              <label htmlFor={id} className={`${buttonClass('secondary', 'md')} cursor-pointer ${up.pending ? 'pointer-events-none opacity-60' : ''}`}>{has ? t('Replace', 'استبدال') : t('Upload image', 'رفع صورة')}</label>
            </form>
            {has && <MiniActionForm action={removeSectionImageFormAction} fields={ids} confirmText={t('Remove the banner image?', 'إزالة صورة البانر؟')}>{t('Remove', 'إزالة')}</MiniActionForm>}
          </div>
        ) : <p className="text-xs text-ink-muted">{t('You need media permission to change the image.', 'تحتاج صلاحية الوسائط لتغيير الصورة.')}</p>}
      </div>
      {local ? <p role="alert" className="text-xs font-medium text-status-error-fg">{local}</p> : <SaveStatus view={viewOfForm(up.state, up.pending)} />}
      {has && (
        <form ref={pos.ref} onSubmit={pos.onSubmit}>
          <input type="hidden" name="pageId" value={ids.pageId} />
          <input type="hidden" name="sectionId" value={ids.sectionId} />
          <fieldset className="space-y-1" disabled={pos.pending}>
            <legend className="text-xs font-semibold text-ink-secondary">{t('Where it sits', 'موضع الصورة')}</legend>
            {POSITIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="position" value={o.value} defaultChecked={position === o.value} onChange={(e) => e.currentTarget.form?.requestSubmit()} />
                {lang === 'ar' ? o.ar : o.en}
              </label>
            ))}
          </fieldset>
          <SaveStatus view={viewOfForm(pos.state, pos.pending)} />
        </form>
      )}
    </div>
  );
}
