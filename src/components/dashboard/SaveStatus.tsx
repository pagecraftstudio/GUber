'use client';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDashLang } from '@/features/dashboard/lang';
import { FORM_TEXT, genericErrorText } from '@/features/dashboard/messages';
import type { FormState } from '@/features/dashboard/form-state';
import type { AutoResult } from '@/features/dashboard/autosave-actions';

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
  const T = FORM_TEXT[lang];
  let body = null;
  if (view.kind === 'saving') body = <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400"><Loader2 size={12} className="animate-spin" aria-hidden="true" />{T.saving}</span>;
  else if (view.kind === 'saved') body = <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"><Check size={12} aria-hidden="true" />{T.saved}</span>;
  else if (view.kind === 'error') body = <span role="alert" className="inline-flex items-center gap-1 text-red-700 dark:text-red-300"><AlertCircle size={12} aria-hidden="true" />{(view.detail && EXTRA[view.detail]?.[lang]) || genericErrorText(lang, view.code, view.detail)}</span>;
  return <span aria-live="polite" className={`min-h-4 text-[11px] font-semibold ${className}`}>{body}</span>;
}
