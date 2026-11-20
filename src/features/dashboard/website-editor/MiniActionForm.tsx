'use client';
import type { ReactNode } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import type { FormState } from '../form-state';
import { useActionForm } from '../useActionForm';

/** A one-button form (move, toggle, delete, add). Hidden fields carry ids only; the server re-derives the company. */
export function MiniActionForm({ action, fields, children, confirmText, className = '', disabled = false }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; fields: Record<string, string>; children: ReactNode; confirmText?: string; className?: string; disabled?: boolean;
}) {
  const { state, pending, ref, onSubmit } = useActionForm(action);
  return (
    <form ref={ref} onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) { e.preventDefault(); return; } onSubmit(e); }} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending || disabled} className={`rounded-xl border border-line-default px-3 py-2 text-xs font-semibold disabled:opacity-50 ${className}`}>{children}</button>
      {state.status === 'error' && <SaveStatus view={viewOfForm(state, pending)} />}
    </form>
  );
}
