'use client';
import { useState, type ReactNode } from 'react';
import { buttonClass } from '@/ds/primitives/button-class';
import { useDashLang } from '../lang';

/** The preview's one memorable touch: the draft inside a frame you can switch between a desktop and a phone width. */
export function DeviceFrame({ children, defaultPhone = false, compact = false }: { children: ReactNode; defaultPhone?: boolean; compact?: boolean }) {
  const lang = useDashLang();
  const [phone, setPhone] = useState(defaultPhone);
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  return (
    <div className="space-y-3">
      {!compact && <div role="group" aria-label={t('Preview width', 'عرض المعاينة')} className="inline-flex gap-1 rounded-ds-md bg-surface-sunken p-1">
        <button type="button" aria-pressed={!phone} onClick={() => setPhone(false)} className={buttonClass(phone ? 'ghost' : 'secondary', 'md', false, 'h-8')}>{t('Desktop', 'سطح المكتب')}</button>
        <button type="button" aria-pressed={phone} onClick={() => setPhone(true)} className={buttonClass(phone ? 'secondary' : 'ghost', 'md', false, 'h-8')}>{t('Phone', 'الهاتف')}</button>
      </div>}
      <div className={`rounded-ds-lg border border-line-default bg-surface-sunken p-2 ${compact ? '' : 'sm:p-6'}`}>
        <div className={`mx-auto overflow-hidden rounded-ds-md border border-line-strong bg-surface-page shadow-sm transition-[max-width] duration-(--duration-ds-enter) ease-ds ${phone ? 'max-w-[390px]' : 'max-w-full'}`}>{children}</div>
      </div>
    </div>
  );
}
