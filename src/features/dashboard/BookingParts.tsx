'use client';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import { useDashLang } from './lang';
import { StatusPill } from '@/components/dashboard/DataTable';
import { Ltr } from '@/components/dashboard/Ltr';
import { useEffect, useRef, useState } from 'react';
import { SaveStatus, viewOfInline } from '@/components/dashboard/SaveStatus';
import { useInlineSave } from './useAutosave';
import { cancelBookingAction, setAmountPaidAction, setPaymentStatusAction } from './autosave-actions';
import type { Booking } from '@/features/bookings/types';

const TXT = {
  en: { amount: 'Amount paid', full: 'Paid in full', refund: 'Refund', left: 'Remaining', boarded: 'Boarded', partial: 'Partly boarded', not: 'Not boarded', noTicket: 'No ticket', cancel: 'Cancel booking', sure: 'Cancel this booking and release its seats?', yes: 'Yes, cancel', keep: 'Keep', cancelled: 'Cancelled' },
  ar: { amount: 'المبلغ المدفوع', full: 'مدفوع بالكامل', refund: 'استرداد', left: 'المتبقي', boarded: 'صعد', partial: 'صعد جزء منهم', not: 'لم يصعد', noTicket: 'بدون تذكرة', cancel: 'إلغاء الحجز', sure: 'إلغاء هذا الحجز وتحرير مقاعده؟', yes: 'نعم، إلغاء', keep: 'إبقاء', cancelled: 'ملغي' },
} as const;

const money = (n: number) => n.toFixed(2);

/** Second indicator on the bookings list: did the passenger get on the bus? Text + icon + colour, never colour alone. */
export function BoardingBadge({ b }: { b: Booking }) {
  const T = TXT[useDashLang()];
  if (b.ticketsTotal === 0) return <span className="text-xs text-slate-600 dark:text-slate-400">{b.status === 'cancelled' ? '—' : T.noTicket}</span>;
  const count = `${b.ticketsBoarded}/${b.ticketsTotal}`;
  const base = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold';
  if (b.boardingStatus === 'boarded') return <span className={`${base} bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300`}><CheckCircle2 size={12} aria-hidden="true" />{T.boarded} <Ltr>{count}</Ltr></span>;
  if (b.boardingStatus === 'partial') return <span className={`${base} bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300`}><CircleDot size={12} aria-hidden="true" />{T.partial} <Ltr>{count}</Ltr></span>;
  return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`}><CircleDashed size={12} aria-hidden="true" />{T.not} <Ltr>{count}</Ltr></span>;
}

/** Amount paid saves by itself (shortly after typing stops, on blur, on Enter). The database derives unpaid / partial / paid and bounds it by the total. */
function AmountInput({ b }: { b: Booking }) {
  const T = TXT[useDashLang()];
  const [value, setValue] = useState(money(b.amountPaid));
  const last = useRef(money(b.amountPaid));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { pending, result, run } = useInlineSave();
  useEffect(() => { last.current = money(b.amountPaid); setValue(money(b.amountPaid)); }, [b.amountPaid]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = (v: string) => {
    clearTimeout(timer.current);
    if (v.trim() === last.current) return;
    run(() => setAmountPaidAction(b.id, v));
  };
  return (
    <div className="flex flex-col gap-0.5">
      <label className="sr-only" htmlFor={`amt-${b.id}`}>{T.amount}</label>
      <input id={`amt-${b.id}`} type="text" inputMode="decimal" dir="ltr" value={value} title={T.amount}
        onChange={(e) => { setValue(e.target.value); clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => save(v), 900); }}
        onBlur={() => save(value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(value); } }}
        className="w-24 rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" />
      <SaveStatus view={viewOfInline(result, pending)} />
    </div>
  );
}

/** Paid indicator + the editable "amount paid" + one-tap "paid in full" / "refund". All save instantly, nothing reloads. */
export function PaymentCell({ b, canWrite }: { b: Booking; canWrite: boolean }) {
  const T = TXT[useDashLang()];
  const pct = b.totalAmount > 0 ? Math.min(100, Math.round((b.amountPaid / b.totalAmount) * 100)) : 100;
  const remaining = Math.max(0, b.totalAmount - b.amountPaid);
  const cancelled = b.status === 'cancelled';
  const { pending, result, run } = useInlineSave();
  const small = 'text-[10px] font-bold text-blue-700 disabled:opacity-50 dark:text-blue-300';
  return (
    <div className="min-w-52 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill value={b.paymentStatus} />
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100"><Ltr>{money(b.amountPaid)} / {money(b.totalAmount)} {b.currency}</Ltr></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><div className={`h-full transition-all ${b.paymentStatus === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} /></div>
      {remaining > 0 && !cancelled && b.paymentStatus !== 'refunded' && <p className="text-[11px] text-slate-600 dark:text-slate-400">{T.left}: <Ltr>{money(remaining)} {b.currency}</Ltr></p>}
      {canWrite && !cancelled && <AmountInput b={b} />}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          {!cancelled && b.paymentStatus !== 'paid' && b.totalAmount > 0 && <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatusAction(b.id, 'paid'))} className={small}>{T.full}</button>}
          {b.amountPaid > 0 && <button type="button" disabled={pending} onClick={() => run(() => setPaymentStatusAction(b.id, 'refunded'))} className="text-[10px] font-bold text-rose-700 disabled:opacity-50 dark:text-rose-300">{T.refund}</button>}
          <SaveStatus view={viewOfInline(result, pending)} />
        </div>
      )}
    </div>
  );
}

/** Last column: Cancel (with one confirm step, like trips). A cancelled booking shows a plain "Cancelled" label instead. */
export function CancelCell({ b, canWrite }: { b: Booking; canWrite: boolean }) {
  const T = TXT[useDashLang()];
  const [confirming, setConfirming] = useState(false);
  const { pending, result, run } = useInlineSave();
  if (b.status === 'cancelled') return <span className="text-xs font-bold text-rose-700 dark:text-rose-300">{T.cancelled}</span>;
  if (!canWrite) return <span className="text-xs text-slate-600 dark:text-slate-400">—</span>;
  const btn = 'min-h-8 rounded-lg px-3 text-xs font-bold disabled:opacity-50';
  return (
    <div className="flex flex-col items-start gap-1.5">
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className={`${btn} border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10`}>{T.cancel}</button>
      ) : (
        <div role="alertdialog" aria-label={T.sure} className="space-y-1.5">
          <p className="max-w-44 text-[11px] text-slate-700 dark:text-slate-300">{T.sure}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(async () => { const r = await cancelBookingAction(b.id); if (r.ok) setConfirming(false); return r; })} className={`${btn} bg-rose-700 text-white hover:bg-rose-800`}>{T.yes}</button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={`${btn} border border-slate-300 dark:border-slate-600`}>{T.keep}</button>
          </div>
        </div>
      )}
      <SaveStatus view={viewOfInline(result, pending)} />
    </div>
  );
}
