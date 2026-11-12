'use client';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDashLang } from '@/features/dashboard/lang';
import { FORM_TEXT, genericErrorText } from '@/features/dashboard/messages';
import type { FormState } from '@/features/dashboard/form-state';
import type { AutoResult } from '@/features/dashboard/autosave-actions';
import { useDsFlipped } from '@/ds/shell/flag';

export const EXTRA: Record<string, { en: string; ar: string }> = {
  amount_exceeds_total: { en: 'More than the booking total.', ar: 'أكثر من إجمالي الحجز.' },
  amount_invalid: { en: 'Enter a valid amount.', ar: 'أدخل مبلغاً صحيحاً.' },
  booking_not_cancellable: { en: 'Cancelled booking: use refund.', ar: 'حجز ملغي: استخدم الاسترداد.' },
  booking_cannot_be_cancelled: { en: 'This booking can no longer be cancelled.', ar: 'لا يمكن إلغاء هذا الحجز بعد الآن.' },
  trip_closed: { en: 'This trip is closed.', ar: 'هذه الرحلة مغلقة.' },
};

type View = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; code: string; detail?: string };

export const viewOfForm = (s: FormState, pending: boolean): View =>
  pending ? { kind: 'saving' } : s.status === 'success' ? { kind: 'saved' } : s.status === 'error' ? { kind: 'error', code: s.code, ...(s.detail ? { detail: s.detail } : {}) } : { kind: 'idle' };
export const viewOfInline = (r: AutoResult | null, pending: boolean): View =>
  pending ? { kind: 'saving' } : !r ? { kind: 'idle' } : r.ok ? { kind: 'saved' } : { kind: 'error', code: r.code, ...(r.detail ? { detail: r.detail } : {}) };

/** Small live status next to an autosaving control: Saving… / Saved / what went wrong. Always in the DOM so screen readers announce it. */
export function SaveStatus({ view, className = '' }: { view: View; className?: string }) {
  const lang = useDashLang();
  const flipped = useDsFlipped();
  const T = FORM_TEXT[lang];
  const c = flipped ? { muted: 'text-ink-muted', ok: 'text-status-success-fg', bad: 'text-status-error-fg', wrap: 'text-xs font-medium' } : { muted: 'text-slate-600 dark:text-slate-400', ok: 'text-emerald-700 dark:text-emerald-300', bad: 'text-red-700 dark:text-red-300', wrap: 'text-[11px] font-semibold' };
  let body = null;
  if (view.kind === 'saving') body = <span className={`inline-flex items-center gap-1 ${c.muted}`}><Loader2 size={12} className="animate-spin" aria-hidden="true" />{T.saving}</span>;
  else if (view.kind === 'saved') body = <span className={`inline-flex items-center gap-1 ${c.ok}`}><Check size={12} aria-hidden="true" />{T.saved}</span>;
  else if (view.kind === 'error') body = <span role="alert" className={`inline-flex items-center gap-1 ${c.bad}`}><AlertCircle size={12} aria-hidden="true" />{(view.detail && EXTRA[view.detail]?.[lang]) || genericErrorText(lang, view.code, view.detail)}</span>;
  return <span aria-live="polite" className={`min-h-4 ${c.wrap} ${className}`}>{body}</span>;
}
