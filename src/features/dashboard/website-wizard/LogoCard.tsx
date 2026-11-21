'use client';
import { useId, useRef, useState } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { buttonClass } from '@/ds/primitives/button-class';
import { removeLogoFormAction, uploadLogoFormAction } from '../wizard-actions';
import { useActionForm } from '../useActionForm';
import { useDashLang } from '../lang';
import { MiniActionForm } from '../website-editor/MiniActionForm';

const MAX = 2_097_152;
const TYPES = 'image/png,image/jpeg,image/webp';

/**
 * Logo upload. Its own form (a form cannot sit inside the step form) and it saves the moment a file is chosen, which the card says.
 * The browser only pre-checks size and type for a quick answer; the server checks the real bytes again and the database re-checks.
 */
export function LogoCard({ logoUrl, canWrite }: { logoUrl: string | null; canWrite: boolean }) {
  const lang = useDashLang();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState<string | null>(null);
  const { state, pending, ref, onSubmit } = useActionForm(uploadLogoFormAction);
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3 rounded-ds-lg border border-line-default bg-surface-card p-5">
      <div>
        <h3 id={`${id}-h`} className="text-sm font-medium text-ink-primary">{t('Logo', 'الشعار')}</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{t('PNG, JPEG or WebP, up to 2 MB. Saved as soon as you choose a file.', 'PNG أو JPEG أو WebP حتى 2 ميجابايت. يُحفظ فور اختيار الملف.')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-ds-md border border-line-default bg-surface-sunken text-xs text-ink-muted">
          {logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span>{t('No logo', 'بلا شعار')}</span>}
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <form ref={ref} onSubmit={onSubmit}>
              <input ref={input} id={id} type="file" name="file" accept={TYPES} className="sr-only"
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  if (!f) return;
                  if (f.size > MAX || !TYPES.split(',').includes(f.type)) { setLocal(f.size > MAX ? t('The file is larger than 2 MB.', 'حجم الملف أكبر من 2 ميجابايت.') : t('Use a PNG, JPEG or WebP image.', 'استخدم صورة PNG أو JPEG أو WebP.')); e.currentTarget.value = ''; return; }
                  setLocal(null);
                  e.currentTarget.form?.requestSubmit();
                }} />
              <label htmlFor={id} className={`${buttonClass('secondary', 'md')} cursor-pointer ${pending ? 'pointer-events-none opacity-60' : ''}`}>{logoUrl ? t('Replace logo', 'استبدال الشعار') : t('Upload logo', 'رفع الشعار')}</label>
            </form>
            {logoUrl && <MiniActionForm action={removeLogoFormAction} fields={{}} confirmText={t('Remove the logo?', 'إزالة الشعار؟')}>{t('Remove', 'إزالة')}</MiniActionForm>}
          </div>
        )}
      </div>
      {local ? <p role="alert" className="text-xs font-medium text-status-error-fg">{local}</p> : <SaveStatus view={viewOfForm(state, pending)} />}
    </section>
  );
}
