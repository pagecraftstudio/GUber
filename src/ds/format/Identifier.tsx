'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useDsText } from '../lang';
import { cx, FOCUS } from '../primitives/cx';

/**
 * Booking reference, invoice number, phone, email, slug, student ID, QR payload: always Latin digits, left-to-right,
 * tabular, isolated from the surrounding bidi text so Arabic sentences cannot reorder it (plan 5.7 rule 4).
 * `copy` adds a copy button for references. The value is shown exactly as given; it is never formatted.
 */
export function Identifier({ value, copy = false, className }: { value: string; copy?: boolean; className?: string }) {
  const t = useDsText();
  const [done, setDone] = useState(false);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked: the text stays selectable */ }
  };
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <bdi dir="ltr" className="ds-ltr ds-tabular select-all">{value}</bdi>
      {copy ? (
        <button type="button" onClick={onCopy} aria-label={done ? t.copied : t.copy} className={cx('inline-flex size-6 items-center justify-center rounded-ds-sm text-ink-muted hover:text-ink-primary', FOCUS)}>
          {done ? <Check size={14} strokeWidth={1.5} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.5} aria-hidden="true" />}
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">{done ? t.copied : ''}</span>
    </span>
  );
}
