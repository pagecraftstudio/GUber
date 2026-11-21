'use client';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { formatDateTime, formatMoney, formatNumber } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';
import { errorText } from '@/features/my-subscriptions/ui/text';
import { bookTripAction, type BookResult } from '../actions';
import type { BookedTrip, TripDetail, TripStop } from '../types';

type Lang = 'en' | 'ar';
const T = {
  en: { title: 'Book a seat', seats: 'Seats', name: 'Full name', phone: 'Phone (with country code)', email: 'Email (optional)', university: 'University (optional)', studentId: 'Student ID (optional)',
    pickup: 'Pickup stop', dropoff: 'Drop-off stop', any: 'No preference', notes: 'Notes (optional)', total: 'Total', pay: 'Pay the company when you travel.', book: 'Confirm booking', booking: 'Booking…',
    done: 'Your seat is booked', ref: 'Booking reference', mine: 'View my bookings', left: (n: string) => `${n} seats left`, from: 'Departs' },
  ar: { title: 'احجز مقعدًا', seats: 'عدد المقاعد', name: 'الاسم الكامل', phone: 'الهاتف (مع رمز الدولة)', email: 'البريد الإلكتروني (اختياري)', university: 'الجامعة (اختياري)', studentId: 'رقم الطالب (اختياري)',
    pickup: 'نقطة الركوب', dropoff: 'نقطة النزول', any: 'بدون تفضيل', notes: 'ملاحظات (اختياري)', total: 'الإجمالي', pay: 'ادفع للشركة عند السفر.', book: 'تأكيد الحجز', booking: 'جارٍ الحجز…',
    done: 'تم حجز مقعدك', ref: 'رقم الحجز', mine: 'عرض حجوزاتي', left: (n: string) => `${n} مقعد متبقٍ`, from: 'المغادرة' },
} as const;

/** A fresh key per booking ATTEMPT: a double click or a retry after a lost answer gets the same booking back instead of a second one. */
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function BookTripView({ lang, trip, stops, defaults }: { lang: Lang; trip: TripDetail; stops: TripStop[]; defaults: { fullName: string; phone: string } }) {
  const t = T[lang];
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookedTrip | null>(null);
  const [seats, setSeats] = useState(1);
  const key = useRef(newKey());
  const pickups = stops.filter((s) => s.kind !== 'dropoff'), dropoffs = stops.filter((s) => s.kind !== 'pickup');

  if (done) {
    return (
      <section className="mx-auto max-w-lg space-y-3 rounded-2xl border border-line-default bg-surface-card p-6" role="status">
        <h1 className="text-xl font-semibold">{t.done}</h1>
        <p>{trip.originName} → {trip.destinationName} · {formatDateTime(trip.departureAt, lang, { timeZone: trip.timeZone })}</p>
        <p className="text-sm text-ink-secondary">{t.ref}: <span dir="ltr" className="font-semibold text-ink-primary">{done.reference}</span> · {formatMoney(done.total, done.currency, lang)}</p>
        <p className="text-sm text-ink-secondary">{t.pay}</p>
        <Link href="/my-bookings" className={buttonClass('primary', 'md')}>{t.mine}</Link>
      </section>
    );
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget), g = (k: string) => String(f.get(k) ?? '');
    setError(null);
    start(async () => {
      const r: BookResult = await bookTripAction({
        tripId: trip.tripId, seats, fullName: g('fullName'), phone: g('phone'), email: g('email'), university: g('university'), studentId: g('studentId'),
        ...(g('pickup') ? { pickupStopId: g('pickup') } : {}), ...(g('dropoff') ? { dropoffStopId: g('dropoff') } : {}), notes: g('notes'), idempotencyKey: key.current,
      }).catch(() => ({ ok: false as const, code: 'internal' }));
      if (r.ok) setDone(r.booking); else setError(errorText(lang, r.code, r.detail));
    });
  };
  const field = 'block text-sm font-medium';
  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="font-medium">{trip.companyName} · {trip.originName} → {trip.destinationName}</p>
        <p className="text-sm text-ink-secondary">{t.from} {formatDateTime(trip.departureAt, lang, { timeZone: trip.timeZone })} · {formatMoney(trip.price, trip.currency, lang)} · {t.left(formatNumber(trip.seatsAvailable, lang))}</p>
      </header>
      <label className={field}>{t.seats}
        <select value={seats} onChange={(e) => setSeats(Number(e.target.value))} className={`${controlClass(false)} mt-1`}>
          {Array.from({ length: trip.maxSeats }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{formatNumber(n, lang)}</option>)}
        </select>
      </label>
      <label className={field}>{t.name}<input name="fullName" required maxLength={120} autoComplete="name" defaultValue={defaults.fullName} className={`${controlClass(false)} mt-1`} /></label>
      <label className={field}>{t.phone}<input name="phone" required dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+20…" defaultValue={defaults.phone} className={`${controlClass(false)} mt-1`} /></label>
      <label className={field}>{t.email}<input name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} className={`${controlClass(false)} mt-1`} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>{t.university}<input name="university" maxLength={200} className={`${controlClass(false)} mt-1`} /></label>
        <label className={field}>{t.studentId}<input name="studentId" dir="ltr" maxLength={100} className={`${controlClass(false)} mt-1`} /></label>
      </div>
      {pickups.length > 0 ? <label className={field}>{t.pickup}<select name="pickup" className={`${controlClass(false)} mt-1`}><option value="">{t.any}</option>{pickups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
      {dropoffs.length > 0 ? <label className={field}>{t.dropoff}<select name="dropoff" className={`${controlClass(false)} mt-1`}><option value="">{t.any}</option>{dropoffs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
      <label className={field}>{t.notes}<textarea name="notes" rows={2} maxLength={1000} className={`${controlClass(false)} mt-1`} /></label>
      <p className="text-sm text-ink-secondary">{t.total}: <span className="font-semibold text-ink-primary">{formatMoney(trip.price * seats, trip.currency, lang)}</span> · {t.pay}</p>
      {error ? <p role="alert" className="text-sm font-medium text-status-error-fg">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? t.booking : t.book}</Button>
    </form>
  );
}
