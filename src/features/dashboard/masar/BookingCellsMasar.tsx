'use client';
import { useState } from 'react';
import { Button } from '@/ds/primitives/Button';
import { AutoInput } from '@/ds/primitives/auto';
import { ConfirmDialog } from '@/ds/feedback/Dialog';
import { SaveStatus, viewOfInline } from '@/ds/feedback/SaveStatus';
import { useInlineSave } from '@/ds/hooks/useInlineSave';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { useDsLang } from '@/ds/lang';
import { formatMoney, formatNumber } from '@/ds/format';
import { cancelBookingAction, setAmountPaidAction, setPaymentStatusAction } from '../autosave-actions';
import type { Booking } from '@/features/bookings/types';
import { J2, saveLabels } from './text';

/** Boarding: label + icon via the shared StatusBadge, plus how many tickets boarded. No tickets: plain text. */
export function BoardingCellMasar({ b }: { b: Booking }) {
  const lang = useDsLang();
  const t = J2[lang];
  if (b.ticketsTotal === 0) return <span className="text-[13px] text-ink-muted">{b.status === 'cancelled' ? '—' : t.noTicket}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusBadge domain="boarding" value={b.boardingStatus} />
      <span className="text-[13px] text-ink-muted tabular-nums" dir="ltr">{formatNumber(b.ticketsBoarded, lang)}/{formatNumber(b.ticketsTotal, lang)}</span>
    </span>
  );
}

/** Payment badge, paid / total, remaining, an amount that saves by itself (same server action), and one-tap paid-in-full / refund. */
export function PaymentCellMasar({ b, canWrite }: { b: Booking; canWrite: boolean }) {
  const lang = useDsLang();
  const t = J2[lang];
  const { pending, result, run } = useInlineSave();
  const cancelled = b.status === 'cancelled';
  const remaining = Math.max(0, b.totalAmount - b.amountPaid);
  return (
    <div className="flex min-w-52 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge domain="payment" value={b.paymentStatus} />
        <span className="text-[13px] text-ink-primary tabular-nums">{formatMoney(b.amountPaid, b.currency, lang)} / {formatMoney(b.totalAmount, b.currency, lang)}</span>
      </div>
      {remaining > 0 && !cancelled && b.paymentStatus !== 'refunded' ? <p className="text-[13px] text-ink-muted">{t.remaining}: <span className="tabular-nums">{formatMoney(remaining, b.currency, lang)}</span></p> : null}
      {canWrite && !cancelled ? (
        <AutoInput id={b.id} value={b.amountPaid.toFixed(2)} label={t.amount} kind="decimal" save={(id, v) => setAmountPaidAction(id, v)} labels={saveLabels(lang)} className="w-28" />
      ) : null}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          {!cancelled && b.paymentStatus !== 'paid' && b.totalAmount > 0 ? <Button variant="ghost" disabled={pending} onClick={() => run(() => setPaymentStatusAction(b.id, 'paid'))} className="!h-7 !px-2 text-[13px]">{t.paidInFull}</Button> : null}
          {b.amountPaid > 0 ? <Button variant="ghost" disabled={pending} onClick={() => run(() => setPaymentStatusAction(b.id, 'refunded'))} className="!h-7 !px-2 text-[13px]">{t.refund}</Button> : null}
          <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
        </div>
      ) : null}
    </div>
  );
}

/** Cancel with one confirm step in the shared ConfirmDialog. A cancelled booking shows a plain label. The server action is unchanged. */
export function CancelCellMasar({ b, canWrite }: { b: Booking; canWrite: boolean }) {
  const lang = useDsLang();
  const t = J2[lang];
  const [open, setOpen] = useState(false);
  const { pending, result, run } = useInlineSave();
  if (b.status === 'cancelled') return <StatusBadge domain="booking" value="cancelled" />;
  if (!canWrite) return <span className="text-[13px] text-ink-muted">—</span>;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant="secondary" disabled={pending} onClick={() => setOpen(true)}>{t.cancelNow}<span className="sr-only"> {b.reference}</span></Button>
      <ConfirmDialog open={open} tone="destructive" title={t.cancelDialogTitle} description={t.cancelDialogText} confirmLabel={t.cancelNow} cancelLabel={t.cancelKeep}
        onCancel={() => setOpen(false)}
        onConfirm={() => { setOpen(false); run(() => cancelBookingAction(b.id)); }} />
      <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
    </div>
  );
}
