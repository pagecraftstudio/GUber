'use client';
import { useRef, useState, type ReactNode } from 'react';
import { advanceTripFormAction, cancelTripFormAction, deleteTripFormAction } from './form-actions';
import type { FormState } from './form-state';
import { useDashLang } from './lang';
import { genericErrorText, TRIP_UI } from './messages';
import { useActionForm } from './useActionForm';
import { canCancel, canDelete, nextStatus, type TripStatus } from '@/features/trips/lifecycle';

const base = 'inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold';

/**
 * The row actions of a trip: ONE button for the next step (draft -> scheduled -> boarding -> on the road -> completed),
 * a separate Cancel, and Delete for drafts. Cancel and Delete ask once. The database still decides what is allowed.
 */
export function TripActions({ tripId, status, label }: { tripId: string; status: TripStatus; label: string }) {
  const lang = useDashLang();
  const T = TRIP_UI[lang];
  const next = nextStatus(status);
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const adv = useActionForm(advanceTripFormAction);
  const can = useActionForm(cancelTripFormAction, { });
  const del = useActionForm(deleteTripFormAction);
  const last: FormState = [adv.state, can.state, del.state].reduce((a, b) => (b.status !== 'idle' && (a.status === 'idle' || (b as { nonce: number }).nonce > (a as { nonce: number }).nonce) ? b : a));
  const busy = adv.pending || can.pending || del.pending;
  const sr = <span className="sr-only"> {label}</span>;
  const hidden = (expected?: boolean): ReactNode => (<><input type="hidden" name="id" value={tripId} />{expected && <input type="hidden" name="expected" value={status} />}</>);

  if (status === 'completed' || status === 'cancelled') return <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{T.final[status]}</p>;

  return (
    <div role="group" aria-label={`${T.actions}: ${label}`} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {next && !confirm && (
          <form onSubmit={adv.onSubmit}>
            {hidden(true)}
            <button type="submit" aria-disabled={busy} className={`${base} bg-blue-700 text-white hover:bg-blue-800`}>{busy && adv.pending ? T.working : T.next[status as keyof typeof T.next]}{sr}</button>
          </form>
        )}
        {canCancel(status) && !confirm && <button type="button" aria-disabled={busy} onClick={() => { setConfirm('cancel'); setTimeout(() => keepRef.current?.focus(), 0); }} className={`${base} border border-amber-600 text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10`}>{T.cancel}{sr}</button>}
        {canDelete(status) && !confirm && <button type="button" aria-disabled={busy} onClick={() => { setConfirm('delete'); setTimeout(() => keepRef.current?.focus(), 0); }} className={`${base} border border-red-600 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10`}>{T.del}{sr}</button>}
      </div>
      {confirm && (
        <form role="alertdialog" aria-label={confirm === 'cancel' ? T.confirmCancel : T.confirmDelete} onSubmit={(e) => { (confirm === 'cancel' ? can : del).onSubmit(e); setConfirm(null); }} className="space-y-2 rounded-xl border border-slate-300 p-2.5 dark:border-slate-600">
          {hidden()}
          <p className="text-xs font-semibold">{confirm === 'cancel' ? T.confirmCancel : T.confirmDelete}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${base} ${confirm === 'cancel' ? 'bg-amber-700' : 'bg-red-700'} text-white`}>{confirm === 'cancel' ? T.yesCancel : T.yesDelete}{sr}</button>
            <button type="button" ref={keepRef} onClick={() => setConfirm(null)} className={`${base} border border-slate-400`}>{T.keep}{sr}</button>
          </div>
        </form>
      )}
      <div aria-live="polite" aria-atomic="true">
        {last.status === 'error' && <p role="alert" className="text-xs font-semibold text-red-700 dark:text-red-300">{genericErrorText(lang, last.code, last.detail)}</p>}
        {last.status === 'success' && <p role="status" className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{last.message === 'cancelled' ? T.done.cancelled : last.message === 'deleted' ? T.done.deleted : T.done.advanced}</p>}
      </div>
    </div>
  );
}
