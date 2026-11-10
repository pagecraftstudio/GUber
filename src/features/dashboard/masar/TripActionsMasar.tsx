'use client';
import { useRef, useState } from 'react';
import { Button } from '@/ds/primitives/Button';
import { ConfirmDialog } from '@/ds/feedback/Dialog';
import { advanceTripFormAction, cancelTripFormAction, deleteTripFormAction } from '../form-actions';
import type { FormState } from '../form-state';
import { genericErrorText, TRIP_UI } from '../messages';
import { useActionForm } from '../useActionForm';
import { useDsLang } from '@/ds/lang';
import { canCancel, canDelete, nextStatus, type TripStatus } from '@/features/trips/lifecycle';

/**
 * Same actions, same server actions, same rules as TripActions; new look. ONE button for the next lifecycle step,
 * Cancel and Delete (drafts only) each ask once in the shared ConfirmDialog (destructive tone focuses Keep first).
 * The database still decides what is allowed; its refusal is shown here.
 */
export function TripActionsMasar({ tripId, status, label }: { tripId: string; status: TripStatus; label: string }) {
  const lang = useDsLang();
  const T = TRIP_UI[lang];
  const next = nextStatus(status);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const adv = useActionForm(advanceTripFormAction);
  const can = useActionForm(cancelTripFormAction, {});
  const del = useActionForm(deleteTripFormAction);
  const cancelForm = useRef<HTMLFormElement>(null);
  const deleteForm = useRef<HTMLFormElement>(null);
  const last: FormState = [adv.state, can.state, del.state].reduce((a, b) => (b.status !== 'idle' && (a.status === 'idle' || (b as { nonce: number }).nonce > (a as { nonce: number }).nonce) ? b : a));
  const busy = adv.pending || can.pending || del.pending;
  const sr = <span className="sr-only"> {label}</span>;

  if (status === 'completed' || status === 'cancelled') return <p className="text-[13px] text-ink-muted">{T.final[status]}</p>;

  return (
    <div role="group" aria-label={`${T.actions}: ${label}`} className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {next ? (
          <form onSubmit={adv.onSubmit}>
            <input type="hidden" name="id" value={tripId} /><input type="hidden" name="expected" value={status} />
            <Button type="submit" loading={adv.pending} aria-disabled={busy || undefined}>{adv.pending ? T.working : T.next[status as keyof typeof T.next]}{sr}</Button>
          </form>
        ) : null}
        {canCancel(status) ? <Button variant="secondary" disabled={busy} onClick={() => setConfirm('cancel')}>{T.cancel}{sr}</Button> : null}
        {canDelete(status) ? <Button variant="ghost" disabled={busy} onClick={() => setConfirm('delete')}>{T.del}{sr}</Button> : null}
      </div>
      <form ref={cancelForm} onSubmit={can.onSubmit} hidden><input type="hidden" name="id" value={tripId} /></form>
      <form ref={deleteForm} onSubmit={del.onSubmit} hidden><input type="hidden" name="id" value={tripId} /></form>
      <ConfirmDialog open={confirm !== null} tone="destructive"
        title={confirm === 'delete' ? T.confirmDelete : T.confirmCancel}
        confirmLabel={confirm === 'delete' ? T.yesDelete : T.yesCancel} cancelLabel={T.keep}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const f = confirm === 'delete' ? deleteForm.current : cancelForm.current; setConfirm(null); f?.requestSubmit(); }} />
      <div aria-live="polite" aria-atomic="true" className="text-[13px]">
        {last.status === 'error' ? <p role="alert" className="text-status-error-fg">{genericErrorText(lang, last.code, last.detail)}</p> : null}
        {last.status === 'success' ? <p role="status" className="text-status-success-fg">{last.message === 'cancelled' ? T.done.cancelled : last.message === 'deleted' ? T.done.deleted : T.done.advanced}</p> : null}
      </div>
    </div>
  );
}
