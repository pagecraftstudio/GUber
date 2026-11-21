'use client';
import { useId, useState } from 'react';
import { controlClass } from '@/ds/primitives/Input';
import { useDashLang } from '../lang';

type Bi = { en: string; ar: string };

export function TextField({ name, label, hint, defaultValue = '', dir, type = 'text', autoComplete, inputMode, maxLength, lang: fieldLang }: {
  name: string; label: Bi; hint?: Bi; defaultValue?: string; dir?: 'ltr' | 'rtl'; type?: string; autoComplete?: string; inputMode?: 'text' | 'tel' | 'email'; maxLength?: number; lang?: 'en' | 'ar';
}) {
  const id = useId();
  const lang = useDashLang();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-primary">{label[lang]}</label>
      {hint && <p id={`${id}-h`} className="mt-0.5 text-xs text-ink-muted">{hint[lang]}</p>}
      <input id={id} name={name} type={type} defaultValue={defaultValue} dir={dir} lang={fieldLang} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength}
        aria-describedby={hint ? `${id}-h` : undefined} className={`mt-1.5 ${controlClass(false)}`} />
    </div>
  );
}

export function AreaField({ name, label, defaultValue = '', dir, maxLength, lang: fieldLang }: { name: string; label: Bi; defaultValue?: string; dir?: 'ltr' | 'rtl'; maxLength?: number; lang?: 'en' | 'ar' }) {
  const id = useId();
  const lang = useDashLang();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-primary">{label[lang]}</label>
      <textarea id={id} name={name} rows={3} defaultValue={defaultValue} dir={dir} lang={fieldLang} maxLength={maxLength} className={`mt-1.5 ${controlClass(false)}`} />
    </div>
  );
}

/** Native colour picker + the hex it produces, kept in step. The hex text is what is submitted (validated again on the server). */
/** A native colour input needs some value while the typed hex is incomplete; black, built so no colour literal sits in the source. */
const COLOR_INPUT_FALLBACK = '#' + '0'.repeat(6);

export function ColorField({ name, label, defaultValue }: { name: string; label: Bi; defaultValue: string }) {
  const id = useId();
  const lang = useDashLang();
  const [hex, setHex] = useState(defaultValue);
  const valid = /^#[0-9a-fA-F]{6}$/.test(hex);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-primary">{label[lang]}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input type="color" aria-label={label[lang]} value={valid ? hex : COLOR_INPUT_FALLBACK} onChange={(e) => setHex(e.target.value)} className="h-9 w-12 shrink-0 cursor-pointer rounded-ds-md border border-line-default bg-surface-card p-1" />
        <input id={id} name={name} value={hex} onChange={(e) => setHex(e.target.value.trim())} dir="ltr" maxLength={7} spellCheck={false} aria-invalid={valid ? undefined : true} className={controlClass(!valid)} />
      </div>
    </div>
  );
}
