'use client';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useDsLang } from '@/ds/lang';
import { formatDateTime, formatMoney, formatNumber } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';
import { PageHeaderMasar } from '@/features/dashboard/masar/PageHeaderMasar';
import { errorText } from '@/features/my-subscriptions/ui/text';
import { createStaffBookingAction, type StaffBookingActionResult } from '../actions';

export type StaffTripOption = { id: string; route: string; departureAt: string; price: number; seatsAvailable: number };
type Done = Extract<StaffBookingActionResult, { ok: true }>;

const T = {
  en: {
    title: 'New booking', desc: 'Book a seat for a passenger who called or walked in.', trip: 'Trip', pick: 'Choose a trip', none: 'No upcoming trips with free seats.', left: (n: string) => `${n} left`,
    name: 'Passenger name', phone: 'Phone (01… or +20…)', seats: 'Seats', email: 'Email (optional)', notes: 'Notes (optional)', paid: 'Amount received now (optional)', paidHint: 'Leave empty if nothing was paid yet. You can record it later on the booking.',
    save: 'Create booking', saving: 'Booking…', booked: 'Booking created', ref: 'Reference', total: 'Total', received: 'Received', another: 'Another booking', all: 'All bookings',
    share: 'Share on WhatsApp', msg: (ref: string, trip: string) => `Your booking ${ref} is confirmed: ${trip}.`, amountProblem: 'The booking was created, but the amount was not recorded. Open the booking to record it.',
  },
  ar: {
    title: 'حجز جديد', desc: 'احجز مقعدًا لراكب اتصل أو حضر بنفسه.', trip: 'الرحلة', pick: 'اختر رحلة', none: 'لا توجد رحلات قادمة بها مقاعد متاحة.', left: (n: string) => `${n} متبقٍ`,
    name: 'اسم الراكب', phone: 'الهاتف (01… أو ‎+20…)', seats: 'عدد المقاعد', email: 'البريد الإلكتروني (اختياري)', notes: 'ملاحظات (اختياري)', paid: 'المبلغ المستلم الآن (اختياري)', paidHint: 'اتركه فارغًا إن لم يُدفع شيء بعد. يمكنك تسجيله لاحقًا على الحجز.',
    save: 'إنشاء الحجز', saving: 'جارٍ الحجز…', booked: 'تم إنشاء الحجز', ref: 'رقم الحجز', total: 'الإجمالي', received: 'المستلم', another: 'حجز آخر', all: 'كل الحجوزات',
    share: 'مشاركة عبر واتساب', msg: (ref: string, trip: string) => `تم تأكيد حجزك رقم ${ref}: ${trip}.`, amountProblem: 'تم إنشاء الحجز لكن لم يُسجَّل المبلغ. افتح الحجز لتسجيله.',
  },
} as const;

export function StaffBookingView({ trips, tz, currency, maxSeats }: { trips: StaffTripOption[]; tz: string; currency: string; maxSeats: number }) {
  const lang = useDsLang();
  const t = T[lang];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<(Done & { tripLabel: string; phone: string }) | null>(null);
  const key = useRef<string>(crypto.randomUUID()); // one per attempt: a double click or retry never books twice
  const formRef = useRef<HTMLFormElement>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set('idempotencyKey', key.current);
    const tripId = String(f.get('tripId'));
    const opt = trips.find((x) => x.id === tripId);
    const phone = String(f.get('customerPhone') ?? '');
    setError(null);
    start(async () => {
      const r = await createStaffBookingAction(f);
      if (!r.ok) { setError(errorText(lang, r.code, r.detail)); return; }
      setDone({ ...r, tripLabel: opt ? `${opt.route}, ${formatDateTime(opt.departureAt, lang, { timeZone: tz })}` : '', phone });
    });
  }

  if (done) {
    const digits = done.phone.replace(/\D/g, '').replace(/^0/, '20');
    const wa = `https://wa.me/${digits}?text=${encodeURIComponent(t.msg(done.reference, done.tripLabel))}`;
    return (
      <>
        <PageHeaderMasar title={t.booked} />
        <section className="max-w-xl space-y-3 rounded-2xl border border-line-default bg-surface-card p-5" aria-live="polite">
          <p className="text-sm">{t.ref}: <span dir="ltr" className="font-semibold">{done.reference}</span></p>
          <p className="text-sm">{t.total}: {formatMoney(done.total, done.currency, lang)} · {t.received}: {formatMoney(done.amountRecorded, done.currency, lang)}</p>
          {done.amountError ? <p role="alert" className="text-sm text-status-error-fg">{t.amountProblem}</p> : null}
          <div className="flex flex-wrap gap-2">
            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'md')}>{t.share}</a>
            <Button type="button" onClick={() => { key.current = crypto.randomUUID(); setDone(null); }}>{t.another}</Button>
            <Link href="/dashboard/bookings" className={buttonClass('secondary', 'md')}>{t.all}</Link>
          </div>
        </section>
      </>
    );
  }
  return (
    <>
      <PageHeaderMasar title={t.title} description={t.desc} />
      {trips.length === 0 ? <p className="text-sm text-ink-secondary">{t.none}</p> : (
        <form ref={formRef} onSubmit={submit} className="max-w-xl space-y-4 rounded-2xl border border-line-default bg-surface-card p-5">
          <label className="block text-sm font-semibold">{t.trip}
            <select name="tripId" required defaultValue="" className={`${controlClass} mt-1`}>
              <option value="" disabled>{t.pick}</option>
              {trips.map((o) => <option key={o.id} value={o.id}>{o.route} · {formatDateTime(o.departureAt, lang, { timeZone: tz })} · {formatMoney(o.price, currency, lang)} · {t.left(formatNumber(o.seatsAvailable, lang))}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">{t.name}<input name="customerName" required maxLength={120} autoComplete="off" className={`${controlClass} mt-1`} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">{t.phone}<input name="customerPhone" required inputMode="tel" dir="ltr" autoComplete="off" className={`${controlClass} mt-1`} /></label>
            <label className="block text-sm font-semibold">{t.seats}<input name="seats" type="number" required min={1} max={maxSeats} defaultValue={1} inputMode="numeric" className={`${controlClass} mt-1`} /></label>
          </div>
          <label className="block text-sm font-semibold">{t.email}<input name="customerEmail" type="email" dir="ltr" autoComplete="off" className={`${controlClass} mt-1`} /></label>
          <label className="block text-sm font-semibold">{t.paid}<input name="amountReceived" inputMode="decimal" dir="ltr" autoComplete="off" className={`${controlClass} mt-1`} /><span className="mt-1 block text-xs font-normal text-ink-secondary">{t.paidHint}</span></label>
          <label className="block text-sm font-semibold">{t.notes}<textarea name="notes" maxLength={1000} rows={2} className={`${controlClass} mt-1`} /></label>
          {error ? <p role="alert" className="text-sm text-status-error-fg">{error}</p> : null}
          <Button type="submit" disabled={pending}>{pending ? t.saving : t.save}</Button>
        </form>
      )}
    </>
  );
}
