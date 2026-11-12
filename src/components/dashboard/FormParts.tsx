'use client';
import { useId, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { useDashLang } from '@/features/dashboard/lang';
import { allowanceNotice, backendLimitNotice, FORM_TEXT, genericErrorText, type Notice } from '@/features/dashboard/messages';
import type { FormState } from '@/features/dashboard/form-state';
import { allowanceFor, type PlanUsage, type UsageKey } from '@/features/subscriptions/usage';
import { useDsFlipped } from '@/ds/shell/flag';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { controlClass } from '@/ds/primitives/Input';
import { buttonClass } from '@/ds/primitives/button-class';

const TONE: Record<Notice['tone'], { box: string; icon: ReactNode }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100', icon: <Info size={16} aria-hidden="true" /> },
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100', icon: <TriangleAlert size={16} aria-hidden="true" /> },
  error: { box: 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-100', icon: <AlertCircle size={16} aria-hidden="true" /> },
};

export function NoticeBox({ notice, id, role }: { notice: Notice; id?: string; role?: 'status' | 'alert' }) {
  const flipped = useDsFlipped();
  if (flipped) return <div id={id}><InlineAlert tone={notice.tone} title={notice.title}>{notice.body}</InlineAlert></div>;
  const t = TONE[notice.tone];
  return (
    <div id={id} role={role} className={`flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${t.box}`}>
      <span className="mt-0.5 shrink-0">{t.icon}</span>
      <div><p className="font-semibold">{notice.title}</p>{notice.body && <p className="mt-0.5 text-[13px] leading-5">{notice.body}</p>}</div>
    </div>
  );
}

/** "3 of 5 buses used", or the limit-reached / no-subscription explanation. Renders nothing when there is nothing true to say. */
export function PlanLimitNotice({ usage, resource, month, id }: { usage: PlanUsage | null; resource: UsageKey; month?: string; id?: string }) {
  const lang = useDashLang();
  const notice = allowanceNotice(lang, resource, allowanceFor(usage, resource, month));
  return notice ? <NoticeBox notice={notice} id={id} role="status" /> : null;
}

/**
 * Result of the last submit. The wrapper is ALWAYS in the DOM (an empty live region is announced reliably when it fills);
 * errors use role=alert so a screen reader interrupts, success uses polite status.
 */
export function FormResult({ state, resource }: { state: FormState; resource?: UsageKey }) {
  const flipped = useDsFlipped();
  const lang = useDashLang();
  const text = FORM_TEXT[lang];
  let body: ReactNode = null;
  if (state.status === 'success' && flipped)
    body = <InlineAlert tone="success">{state.message === 'created' ? text.created : text.saved}</InlineAlert>;
  else if (state.status === 'success')
    body = <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100"><CheckCircle2 size={16} aria-hidden="true" />{state.message === 'created' ? text.created : text.saved}</div>;
  else if (state.status === 'error') {
    if (state.code === 'plan_limit') body = <NoticeBox role="alert" notice={backendLimitNotice(lang, state.detail, resource && state.usage ? allowanceFor(state.usage, resource) : undefined)} />;
    else if (state.code === 'subscription_required' && resource) body = <NoticeBox role="alert" notice={allowanceNotice(lang, resource, { state: 'no_subscription' })!} />;
    else body = <NoticeBox role="alert" notice={{ tone: 'error', title: genericErrorText(lang, state.code, state.detail) }} />;
  }
  return <div aria-live="polite" aria-atomic="true">{body}</div>;
}

const input = 'mt-1.5 w-full rounded-xl border bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:bg-slate-800 dark:text-white';
export const inputClass = (invalid: boolean) => `${input} ${invalid ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`;

export function FormField(p: { name: string; label: string; hint?: string; error?: string | null; required?: boolean; type?: string; min?: number; max?: number; step?: string; inputMode?: 'numeric' | 'decimal' | 'text'; defaultValue?: string; autoComplete?: string; dir?: 'ltr' | 'rtl' }) {
  const id = useId();
  const flipped = useDsFlipped();
  const described = [p.hint ? `${id}-h` : '', p.error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  if (flipped) return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-primary">
        {p.label}{p.required && <span aria-hidden="true" className="ms-1 text-ink-muted">*</span>}
      </label>
      <input id={id} name={p.name} type={p.type ?? 'text'} required={p.required} min={p.min} max={p.max} step={p.step} inputMode={p.inputMode} defaultValue={p.defaultValue} autoComplete={p.autoComplete} dir={p.dir}
        aria-invalid={p.error ? true : undefined} aria-describedby={described} className={controlClass(!!p.error)} />
      {p.hint && <p id={`${id}-h`} className="text-[13px] text-ink-muted">{p.hint}</p>}
      {p.error && <p id={`${id}-e`} className="text-[13px] text-status-error-fg">{p.error}</p>}
    </div>
  );
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {p.label}{p.required && <span aria-hidden="true" className="text-red-600"> *</span>}
      </label>
      <input id={id} name={p.name} type={p.type ?? 'text'} required={p.required} min={p.min} max={p.max} step={p.step} inputMode={p.inputMode} defaultValue={p.defaultValue} autoComplete={p.autoComplete} dir={p.dir}
        aria-invalid={p.error ? true : undefined} aria-describedby={described} className={inputClass(!!p.error)} />
      {p.hint && <p id={`${id}-h`} className="mt-1 text-xs text-slate-600 dark:text-slate-400">{p.hint}</p>}
      {p.error && <p id={`${id}-e`} className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">{p.error}</p>}
    </div>
  );
}

/** Submit button that stays focusable when blocked (aria-disabled, not disabled) and points at the reason. */
export function SubmitButton({ children, pending, blocked, describedBy }: { children: ReactNode; pending: boolean; blocked: boolean; describedBy?: string }) {
  const lang = useDashLang();
  const flipped = useDsFlipped();
  if (flipped) return (
    <button type="submit" aria-disabled={blocked || pending} aria-describedby={blocked ? describedBy : undefined}
      className={buttonClass('primary', 'lg', true, blocked || pending ? 'cursor-not-allowed opacity-60' : undefined)}>
      {pending ? FORM_TEXT[lang].saving : children}
    </button>
  );
  return (
    <button type="submit" aria-disabled={blocked || pending} aria-describedby={blocked ? describedBy : undefined}
      className={`min-h-11 w-full rounded-xl px-4 py-3 text-xs font-bold text-white ${blocked || pending ? 'cursor-not-allowed bg-slate-500' : 'bg-blue-700 hover:bg-blue-800'}`}>
      {pending ? FORM_TEXT[lang].saving : children}
    </button>
  );
}
