'use client';
import { CheckCircle2, CircleDashed, CircleDot } from 'lucide-react';
import { useDashLang } from './lang';
import { StatusPill } from '@/components/dashboard/DataTable';
import { Ltr } from '@/components/dashboard/Ltr';
import { updateAmountPaidAction, updatePaymentStatusAction, updateBookingStatusAction } from './actions';
import type { Booking } from '@/features/bookings/types';

const TXT = {
  en: { amount: 'Amount paid', save: 'Save', full: 'Paid in full', refund: 'Refund', left: 'Remaining', boarded: 'Boarded', partial: 'Partly boarded', not: 'Not boarded', noTicket: 'No ticket', update: 'Update status', confirmed: 'Confirmed', completed: 'Completed', noShow: 'No show' },
  ar: { amount: 'المبلغ المدفوع', save: 'حفظ', full: 'مدفوع بالكامل', refund: 'استرداد', left: 'المتبقي', boarded: 'صعد', partial: 'صعد جزء منهم', not: 'لم يصعد', noTicket: 'بدون تذكرة', update: 'تحديث الحالة', confirmed: 'مؤكد', completed: 'مكتمل', noShow: 'لم يحضر' },
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

/** Paid indicator + the editable "amount paid". The database derives unpaid / partial / paid from the amount and bounds it by the total. */
export function PaymentCell({ b, canWrite, returnTo }: { b: Booking; canWrite: boolean; returnTo: string }) {
  const T = TXT[useDashLang()];
  const pct = b.totalAmount > 0 ? Math.min(100, Math.round((b.amountPaid / b.totalAmount) * 100)) : 100;
  const remaining = Math.max(0, b.totalAmount - b.amountPaid);
  const cancelled = b.status === 'cancelled';
  const hidden = (<><input type="hidden" name="id" value={b.id} /><input type="hidden" name="returnTo" value={returnTo} /></>);
  const small = 'text-[10px] font-bold text-blue-700 dark:text-blue-300';
  return (
    <div className="min-w-52 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill value={b.paymentStatus} />
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100"><Ltr>{money(b.amountPaid)} / {money(b.totalAmount)} {b.currency}</Ltr></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><div className={`h-full ${b.paymentStatus === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} /></div>
      {remaining > 0 && !cancelled && b.paymentStatus !== 'refunded' && <p className="text-[11px] text-slate-600 dark:text-slate-400">{T.left}: <Ltr>{money(remaining)} {b.currency}</Ltr></p>}
      {canWrite && !cancelled && (
        <form action={updateAmountPaidAction} className="flex items-center gap-1">
          {hidden}
          <label className="sr-only" htmlFor={`amt-${b.id}`}>{T.amount}</label>
          <input id={`amt-${b.id}`} name="amount" type="text" inputMode="decimal" dir="ltr" defaultValue={money(b.amountPaid)} title={T.amount} className="w-24 rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600" />
          <button className={small}>{T.save}</button>
        </form>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-3">
          {!cancelled && b.paymentStatus !== 'paid' && b.totalAmount > 0 && (
            <form action={updatePaymentStatusAction}>{hidden}<input type="hidden" name="paymentStatus" value="paid" /><button className={small}>{T.full}</button></form>
          )}
          {b.amountPaid > 0 && (
            <form action={updatePaymentStatusAction}>{hidden}<input type="hidden" name="paymentStatus" value="refunded" /><button className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{T.refund}</button></form>
          )}
        </div>
      )}
    </div>
  );
}

/** Booking status (confirmed / completed / no show). Unchanged behaviour, now returns to the same filtered list. */
export function StatusForm({ b, returnTo }: { b: Booking; returnTo: string }) {
  const T = TXT[useDashLang()];
  return (
    <form action={updateBookingStatusAction} className="flex gap-1">
      <input type="hidden" name="id" value={b.id} /><input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor={`st-${b.id}`}>{T.update}</label>
      <select id={`st-${b.id}`} name="status" defaultValue={b.status === 'pending' ? 'confirmed' : b.status === 'cancelled' ? 'confirmed' : b.status} className="max-w-28 rounded-lg border border-slate-300 bg-transparent p-1 text-[10px] dark:border-slate-600">
        <option value="confirmed">{T.confirmed}</option><option value="completed">{T.completed}</option><option value="no_show">{T.noShow}</option>
      </select>
      <button className="text-[10px] font-bold text-blue-700 dark:text-blue-300">{T.save}</button>
    </form>
  );
}
