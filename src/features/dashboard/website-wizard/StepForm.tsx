'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SaveStatus, viewOfForm } from '@/components/dashboard/SaveStatus';
import { buttonClass } from '@/ds/primitives/button-class';
import type { FormState } from '../form-state';
import { useActionForm } from '../useActionForm';
import { useLiveDraft } from './LiveDraft';
import { useDashLang } from '../lang';
import { BACK_LABEL, CONTINUE_LABEL, NEXT_LABEL } from './copy';

/**
 * One step = one form. "Save and continue" saves through the server action and the SERVER redirects to the next step only when the
 * save worked, so an error keeps the owner (and what they typed) on this step. Back is a plain link: it never blocks and never saves.
 * `step` is a hidden field the server validates against the fixed step list; the destination is never taken from the browser.
 */
export function StepForm({ action, step, backHref, forwardHref, canWrite, children }: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>; step: string; backHref: string | null; forwardHref: string | null; canWrite: boolean; children: ReactNode;
}) {
  const lang = useDashLang();
  const { state, pending, ref, onSubmit } = useActionForm(action);
  const live = useLiveDraft();
  return (
    <form ref={ref} onSubmit={onSubmit} onInput={(e) => live?.patchForm(new FormData(e.currentTarget))} className="space-y-6">
      <input type="hidden" name="step" value={step} />
      <fieldset disabled={!canWrite} className="min-w-0 space-y-5">{children}</fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-default pt-4">
        {backHref ? <Link href={backHref} className={buttonClass('ghost', 'md')}>{BACK_LABEL[lang]}</Link> : <span />}
        <div className="flex items-center gap-3">
          <SaveStatus view={viewOfForm(state, pending)} />
          {canWrite
            ? <button type="submit" disabled={pending} className={buttonClass('primary', 'md')}>{NEXT_LABEL[lang]}</button>
            : forwardHref ? <Link href={forwardHref} className={buttonClass('primary', 'md')}>{CONTINUE_LABEL[lang]}</Link> : null}
        </div>
      </div>
    </form>
  );
}
