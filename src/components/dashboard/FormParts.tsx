'use client';
import { useId, type ReactNode } from 'react';
import { useDashLang } from '@/features/dashboard/lang';
import { allowanceNotice, backendLimitNotice, FORM_TEXT, genericErrorText, type Notice } from '@/features/dashboard/messages';
import type { FormState } from '@/features/dashboard/form-state';
import { allowanceFor, type PlanUsage, type UsageKey } from '@/features/subscriptions/usage';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { controlClass } from '@/ds/primitives/Input';
import { buttonClass } from '@/ds/primitives/button-class';

export function NoticeBox({ notice, id }: { notice: Notice; id?: string; role?: 'status' | 'alert' }) {
  return <div id={id}><InlineAlert tone={notice.tone} title={notice.title}>{notice.body}</InlineAlert></div>;
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
  const lang = useDashLang();
  const text = FORM_TEXT[lang];
  let body: ReactNode = null;
  if (state.status === 'success')
    body = <InlineAlert tone="success">{state.message === 'created' ? text.created : text.saved}</InlineAlert>;
  else if (state.status === 'error') {
    if (state.code === 'plan_limit') body = <NoticeBox role="alert" notice={backendLimitNotice(lang, state.detail, resource && state.usage ? allowanceFor(state.usage, resource) : undefined)} />;
    else if (state.code === 'subscription_required' && resource) body = <NoticeBox role="alert" notice={allowanceNotice(lang, resource, { state: 'no_subscription' })!} />;
    else body = <NoticeBox role="alert" notice={{ tone: 'error', title: genericErrorText(lang, state.code, state.detail) }} />;
  }
  return <div aria-live="polite" aria-atomic="true">{body}</div>;
}

export const inputClass = controlClass;

export function FormField(p: { name: string; label: string; hint?: string; error?: string | null; required?: boolean; type?: string; min?: number; max?: number; step?: string; inputMode?: 'numeric' | 'decimal' | 'text'; defaultValue?: string; autoComplete?: string; dir?: 'ltr' | 'rtl' }) {
  const id = useId();
  const described = [p.hint ? `${id}-h` : '', p.error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  return (
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
}

/** Submit button that stays focusable when blocked (aria-disabled, not disabled) and points at the reason. */
export function SubmitButton({ children, pending, blocked, describedBy }: { children: ReactNode; pending: boolean; blocked: boolean; describedBy?: string }) {
  const lang = useDashLang();
  return (
    <button type="submit" aria-disabled={blocked || pending} aria-describedby={blocked ? describedBy : undefined}
      className={buttonClass('primary', 'lg', true, blocked || pending ? 'cursor-not-allowed opacity-60' : undefined)}>
      {pending ? FORM_TEXT[lang].saving : children}
    </button>
  );
}
