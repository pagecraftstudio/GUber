'use client';
import { useActionState, useEffect, useId, useRef } from 'react';
import { IDLE, type AdminActionState } from '@/features/admin/action-state';
import { fieldMessage } from './messages';

export type DialogField = {
  name: string;
  label: string;
  kind: 'select' | 'number' | 'text';
  options?: { value: string; label: string }[];
  defaultValue?: string;
  min?: number;
  max?: number;
  hint?: string;
};

type Props = {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  action: (prev: AdminActionState, fd: FormData) => Promise<AdminActionState>;
  /** Hidden form values (target ids, the status to set). Never roles or actor ids: the server derives those. */
  hidden: Record<string, string>;
  /** Extra inputs (plan, days, ...). Plain data only: this is a client component. Errors come back under state.fields[name]. */
  fields?: DialogField[];
  /** Adds a required reason textarea (submitted as `reason`). Props must stay serialisable: this is a client component. */
  reason?: { label: string; hint?: string };
};

/** Every destructive admin action goes through this: a modal with the consequence spelled out and an explicit confirm. */
export function ConfirmDialog({ triggerLabel, title, description, confirmLabel, tone = 'primary', action, hidden, reason, fields }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, formAction, pending] = useActionState(action, IDLE);
  useEffect(() => {
    if (state.status === 'ok') ref.current?.close();
  }, [state]);

  const confirm = tone === 'danger' ? 'bg-red-700 text-white hover:bg-red-800' : 'bg-slate-900 text-white hover:bg-slate-700';
  const trigger = tone === 'danger' ? 'border-red-300 text-red-800 hover:bg-red-50' : 'border-slate-300 text-slate-800 hover:bg-slate-100';
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`rounded-lg border bg-white px-3 py-1.5 text-sm font-medium ${trigger}`}>
        {triggerLabel}
      </button>
      <dialog ref={ref} aria-labelledby={titleId} className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40">
        <form action={formAction} className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {fields?.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <label htmlFor={`${titleId}-${f.name}`} className="block text-sm font-medium text-slate-700">{f.label}</label>
              {f.kind === 'select' ? (
                <select id={`${titleId}-${f.name}`} name={f.name} required defaultValue={f.defaultValue} className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${titleId}-${f.name}`}
                  name={f.name}
                  type={f.kind === 'number' ? 'number' : 'text'}
                  required
                  min={f.min}
                  max={f.max}
                  defaultValue={f.defaultValue}
                  aria-invalid={state.fields?.[f.name] ? true : undefined}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              )}
              {f.hint ? <p className="text-xs text-slate-500">{f.hint}</p> : null}
              {state.fields?.[f.name] ? <p role="alert" className="text-xs text-red-700">{fieldMessage(state.fields[f.name])}</p> : null}
            </div>
          ))}
          {reason ? (
            <div className="space-y-1.5">
              <label htmlFor={`${titleId}-reason`} className="block text-sm font-medium text-slate-700">{reason.label}</label>
              <textarea
                id={`${titleId}-reason`}
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                aria-invalid={state.fields?.reason ? true : undefined}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              {reason.hint ? <p className="text-xs text-slate-500">{reason.hint}</p> : null}
            </div>
          ) : null}
          {state.status === 'error' ? (
            <p role="alert" className="text-sm text-red-700">{state.fields?.reason ? fieldMessage(state.fields.reason) : state.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={pending} className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${confirm}`}>
              {pending ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
