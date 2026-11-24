'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { formatDateTime, formatMoney, formatNumber } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';
import { errorText } from '@/features/my-subscriptions/ui/text';
import { useCaptchaGate } from '@/components/captcha/useCaptchaGate';
import { bookingPaymentAction, bookTripAction, quoteBookingAction } from '../actions';
import { proofWhatsappUrl, type BookedTrip, type PaymentInfo, type Quote, type QuoteSubscription, type TripDetail, type TripStop } from '../types';

type Lang = 'en' | 'ar';
type Step = 'trip' | 'passenger' | 'review' | 'pay' | 'done';
const T = {
  en: {
    title: 'Book a seat', steps: { trip: 'Trip', passenger: 'Passenger', review: 'Invoice', pay: 'Pay', done: 'Done' } as Record<Step, string>,
    seats: 'Seats', name: 'Full name', phone: 'Phone (with country code)', email: 'Email (optional)', university: 'University (optional)', studentId: 'Student ID (optional)',
    pickup: 'Pickup stop', dropoff: 'Drop-off stop', any: 'No preference', notes: 'Notes (optional)', next: 'Continue', back: 'Back', left: (n: string) => `${n} seats left`, departs: 'Departs',
    invoice: 'Invoice', unit: 'Price per seat', total: 'Total', passenger: 'Passenger', loading: 'Calculating…', confirm: 'Confirm and reserve', confirming: 'Reserving…',
    holdTitle: 'Your seats are held', holdText: (d: string) => `Send your payment proof before ${d} or the booking is cancelled automatically and the seats are released.`,
    left2: 'Time left', expired: 'The payment time has ended', vf: 'Vodafone Cash', ip: 'InstaPay', holder: 'Account holder', amount: 'Amount to send', copy: 'Copy', copied: 'Copied',
    proof: 'Send proof on WhatsApp', proofText: (ref: string, name: string, trip: string, total: string) => `Hello, I paid for booking ${ref} (${trip}). Name: ${name}. Amount: ${total}.`,
    confirmedNote: 'Your seat is confirmed only after the company confirms your payment. You will get a notice here.', done: 'Your seat is booked', ref: 'Booking reference',
    pay2: 'Pay the company when you travel.', free: 'Free with your plan', freePlan: (p: string, leg: string) => `Free with your plan (${p}): one seat, ${leg}. One go and one return trip per day are free.`, goLeg: 'go trip', returnLeg: 'return trip',
    limitUsed: (leg: string) => `You already used your free ${leg} today. This seat is a regular paid seat.`, mine: 'View my bookings', noInstr: 'The company has not added payment details yet. Contact the company to complete payment.',
  },
  ar: {
    title: 'احجز مقعدًا', steps: { trip: 'الرحلة', passenger: 'الراكب', review: 'الفاتورة', pay: 'الدفع', done: 'تم' } as Record<Step, string>,
    seats: 'عدد المقاعد', name: 'الاسم الكامل', phone: 'الهاتف (مع رمز الدولة)', email: 'البريد الإلكتروني (اختياري)', university: 'الجامعة (اختياري)', studentId: 'رقم الطالب (اختياري)',
    pickup: 'نقطة الركوب', dropoff: 'نقطة النزول', any: 'بدون تفضيل', notes: 'ملاحظات (اختياري)', next: 'متابعة', back: 'رجوع', left: (n: string) => `${n} مقعد متبقٍ`, departs: 'المغادرة',
    invoice: 'الفاتورة', unit: 'سعر المقعد', total: 'الإجمالي', passenger: 'الراكب', loading: 'جارٍ الحساب…', confirm: 'تأكيد وحجز', confirming: 'جارٍ الحجز…',
    holdTitle: 'مقاعدك محجوزة', holdText: (d: string) => `أرسل إثبات الدفع قبل ${d} وإلا يُلغى الحجز تلقائيًا وتُحرَّر المقاعد.`,
    left2: 'الوقت المتبقي', expired: 'انتهى وقت الدفع', vf: 'فودافون كاش', ip: 'إنستاباي', holder: 'اسم صاحب الحساب', amount: 'المبلغ المطلوب تحويله', copy: 'نسخ', copied: 'تم النسخ',
    proof: 'أرسل الإثبات عبر واتساب', proofText: (ref: string, name: string, trip: string, total: string) => `مرحبًا، دفعت قيمة الحجز ${ref} (${trip}). الاسم: ${name}. المبلغ: ${total}.`,
    confirmedNote: 'يتأكد مقعدك فقط بعد أن تؤكد الشركة استلام دفعتك. ستصلك رسالة هنا.', done: 'تم حجز مقعدك', ref: 'رقم الحجز',
    pay2: 'ادفع للشركة عند السفر.', free: 'مجاني مع اشتراكك', freePlan: (p: string, leg: string) => `مجاني مع اشتراكك (${p}): مقعد واحد، ${leg}. رحلة ذهاب ورحلة عودة يوميًا مجانًا.`, goLeg: 'رحلة الذهاب', returnLeg: 'رحلة العودة',
    limitUsed: (leg: string) => `لقد استخدمت ${leg} المجانية اليوم. هذا المقعد بسعر عادي.`, mine: 'عرض حجوزاتي', noInstr: 'لم تضف الشركة بيانات الدفع بعد. تواصل مع الشركة لإتمام الدفع.',
  },
} as const;

/** A fresh key per booking ATTEMPT: a double click or a retry after a lost answer gets the same booking back instead of a second one. */
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
type Form = { seats: number; fullName: string; phone: string; email: string; university: string; studentId: string; pickup: string; dropoff: string; notes: string };

function Steps({ lang, current, order }: { lang: Lang; current: Step; order: Step[] }) {
  const t = T[lang];
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label={t.title}>
      {order.map((s, i) => (
        <li key={s} aria-current={s === current ? 'step' : undefined}
            className={`rounded-full border px-3 py-1 ${s === current ? 'border-line-strong bg-surface-sunken font-semibold' : 'border-line-default text-ink-secondary'}`}>
          {formatNumber(i + 1, lang)}. {t.steps[s]}
        </li>
      ))}
    </ol>
  );
}

function Countdown({ lang, dueAt }: { lang: Lang; dueAt: string }) {
  const t = T[lang];
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (now === null) return null;
  const ms = new Date(dueAt).getTime() - now;
  if (ms <= 0) return <p role="alert" className="font-semibold text-status-error-fg">{t.expired}</p>;
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  const two = (n: number) => String(n).padStart(2, '0');                       // a clock reads the same in both languages (Western digits)
  return <p className="text-lg font-semibold" aria-live="off">{t.left2}: <span dir="ltr">{two(h)}:{two(m)}:{two(s)}</span></p>;
}

function CopyRow({ lang, label, value }: { lang: Lang; label: string; value: string }) {
  const t = T[lang];
  const [ok, setOk] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line-default p-3">
      <div><p className="text-xs text-ink-secondary">{label}</p><p dir="ltr" className="font-semibold">{value}</p></div>
      <button type="button" className={buttonClass('secondary', 'md')}
        onClick={() => { try { void navigator.clipboard.writeText(value).then(() => setOk(true)); } catch { /* clipboard blocked: the value is on screen */ } }}>{ok ? t.copied : t.copy}</button>
    </div>
  );
}

export function BookTripView({ lang, trip, stops, subscription, defaults }: { lang: Lang; trip: TripDetail; stops: TripStop[]; subscription: QuoteSubscription | null; defaults: { fullName: string; phone: string } }) {
  const t = T[lang];
  const freeSeat = subscription?.free === true;                                  // the page asked the database for 1 seat; the booking service decides again
  const legName = subscription ? (subscription.leg === 'go' ? t.goLeg : t.returnLeg) : '';
  const [step, setStep] = useState<Step>('trip');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const gate = useCaptchaGate('booking', lang);
  const [form, setForm] = useState<Form>({ seats: 1, fullName: defaults.fullName, phone: defaults.phone, email: '', university: '', studentId: '', pickup: '', dropoff: '', notes: '' });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [booked, setBooked] = useState<BookedTrip | null>(null);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const key = useRef(newKey());
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pickups = stops.filter((s) => s.kind !== 'dropoff'), dropoffs = stops.filter((s) => s.kind !== 'pickup');
  const order: Step[] = quote ? (quote.requiresPayment ? ['trip', 'passenger', 'review', 'pay'] : ['trip', 'passenger', 'review', 'done']) : ['trip', 'passenger', 'review', 'pay'];
  const route = `${trip.originName} → ${trip.destinationName}`;
  const field = 'block text-sm font-medium';

  const toReview = () => {
    setError(null);
    start(async () => {
      const r = await quoteBookingAction(trip.tripId, form.seats).catch(() => ({ ok: false as const, code: 'internal' }));
      if (r.ok) { setQuote(r.quote); setStep('review'); } else setError(errorText(lang, r.code, 'detail' in r ? r.detail : undefined));
    });
  };
  const confirm = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const r = await bookTripAction({
        tripId: trip.tripId, seats: form.seats, fullName: form.fullName, phone: form.phone, email: form.email, university: form.university, studentId: form.studentId,
        ...(form.pickup ? { pickupStopId: form.pickup } : {}), ...(form.dropoff ? { dropoffStopId: form.dropoff } : {}), notes: form.notes, idempotencyKey: key.current,
      }, gate.token).catch(() => ({ ok: false as const, code: 'internal' }));
      gate.spent();   // the pass is one-time: a retry needs a fresh challenge
      if (!r.ok) { setError(errorText(lang, r.code, 'detail' in r ? r.detail : undefined)); return; }
      setBooked(r.booking);
      if (r.booking.status === 'pending') {
        const p = await bookingPaymentAction(r.booking.id).catch(() => null);
        if (p?.ok) setPayment(p.payment);
        setStep('pay');
      } else setStep('done');
    });
  };

  const header = (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="font-medium">{trip.companyName} · {route}</p>
      <p className="text-sm text-ink-secondary">{t.departs} {formatDateTime(trip.departureAt, lang, { timeZone: trip.timeZone })} · {freeSeat ? t.free : formatMoney(trip.price, trip.currency, lang)} · {t.left(formatNumber(trip.seatsAvailable, lang))}</p>
    </header>
  );
  const err = error ? <p role="alert" className="text-sm font-medium text-status-error-fg">{error}</p> : null;

  if (step === 'done' && booked) {
    return (
      <section className="mx-auto max-w-lg space-y-3 rounded-2xl border border-line-default bg-surface-card p-6" role="status">
        <h1 className="text-xl font-semibold">{t.done}</h1>
        <p>{route} · {formatDateTime(trip.departureAt, lang, { timeZone: trip.timeZone })}</p>
        <p className="text-sm text-ink-secondary">{t.ref}: <span dir="ltr" className="font-semibold text-ink-primary">{booked.reference}</span> · {formatMoney(booked.total, booked.currency, lang)}</p>
        <p className="text-sm text-ink-secondary">{booked.total > 0 ? t.pay2 : ''}</p>
        <Link href="/my-bookings" className={buttonClass('primary', 'md')}>{t.mine}</Link>
      </section>
    );
  }

  if (step === 'pay' && booked) {
    const due = booked.paymentDueAt ?? payment?.dueAt ?? null;
    const tz = payment?.timeZone ?? trip.timeZone;
    const proofText = t.proofText(booked.reference, form.fullName, route, formatMoney(booked.total, booked.currency, lang));
    const note = payment ? (lang === 'ar' ? payment.noteAr ?? payment.noteEn : payment.noteEn ?? payment.noteAr) : null;
    return (
      <section className="mx-auto max-w-lg space-y-4">
        <Steps lang={lang} current="pay" order={order} />
        <div className="space-y-2 rounded-2xl border border-line-default bg-surface-card p-5" role="status">
          <h1 className="text-xl font-semibold">{t.holdTitle}</h1>
          {due ? <p className="text-sm">{t.holdText(formatDateTime(due, lang, { timeZone: tz }))}</p> : null}
          {due ? <Countdown lang={lang} dueAt={due} /> : null}
          <p className="text-sm text-ink-secondary">{t.ref}: <span dir="ltr" className="font-semibold text-ink-primary">{booked.reference}</span></p>
        </div>
        {payment?.hasInstructions ? (
          <div className="space-y-3">
            <CopyRow lang={lang} label={t.amount} value={formatMoney(booked.total, booked.currency, 'en')} />
            {payment.vodafoneNumber ? <CopyRow lang={lang} label={`${t.vf}${payment.vodafoneHolder ? ` · ${payment.vodafoneHolder}` : ''}`} value={payment.vodafoneNumber} /> : null}
            {payment.instapayAddress ? <CopyRow lang={lang} label={`${t.ip}${payment.instapayHolder ? ` · ${payment.instapayHolder}` : ''}`} value={payment.instapayAddress} /> : null}
            {note ? <p className="text-sm text-ink-secondary">{note}</p> : null}
            {payment.whatsapp ? <a href={proofWhatsappUrl(payment.whatsapp, proofText)} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md')}>{t.proof}</a> : null}
          </div>
        ) : <p className="text-sm text-ink-secondary">{t.noInstr}</p>}
        <p className="text-sm text-ink-secondary">{t.confirmedNote}</p>
        <Link href="/my-bookings" className={buttonClass('secondary', 'md')}>{t.mine}</Link>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {header}
      <Steps lang={lang} current={step} order={order} />
      {step === 'trip' ? (
        <form onSubmit={(e) => { e.preventDefault(); setStep('passenger'); }} className="space-y-4">
          {subscription && freeSeat ? <p role="status" className="rounded-xl border border-line-default bg-surface-sunken p-3 text-sm font-medium">{t.freePlan(subscription.planName, legName)}</p> : null}
          {subscription?.dayLimitReached ? <p role="status" className="rounded-xl border border-line-default bg-surface-sunken p-3 text-sm">{t.limitUsed(legName)}</p> : null}
          <label className={field}>{t.seats}
            <select value={freeSeat ? 1 : form.seats} onChange={(e) => set('seats', Number(e.target.value))} className={`${controlClass(false)} mt-1`} disabled={freeSeat}>
              {Array.from({ length: freeSeat ? 1 : trip.maxSeats }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{formatNumber(n, lang)}</option>)}
            </select>
          </label>
          {pickups.length > 0 ? <label className={field}>{t.pickup}<select value={form.pickup} onChange={(e) => set('pickup', e.target.value)} className={`${controlClass(false)} mt-1`}><option value="">{t.any}</option>{pickups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
          {dropoffs.length > 0 ? <label className={field}>{t.dropoff}<select value={form.dropoff} onChange={(e) => set('dropoff', e.target.value)} className={`${controlClass(false)} mt-1`}><option value="">{t.any}</option>{dropoffs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label> : null}
          <Button type="submit">{t.next}</Button>
        </form>
      ) : null}
      {step === 'passenger' ? (
        <form onSubmit={(e) => { e.preventDefault(); toReview(); }} className="space-y-4">
          <label className={field}>{t.name}<input required maxLength={120} autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
          <label className={field}>{t.phone}<input required dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+20…" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
          <label className={field}>{t.email}<input type="email" dir="ltr" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => set('email', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={field}>{t.university}<input maxLength={200} value={form.university} onChange={(e) => set('university', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
            <label className={field}>{t.studentId}<input dir="ltr" maxLength={100} value={form.studentId} onChange={(e) => set('studentId', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
          </div>
          <label className={field}>{t.notes}<textarea rows={2} maxLength={1000} value={form.notes} onChange={(e) => set('notes', e.target.value)} className={`${controlClass(false)} mt-1`} /></label>
          {err}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setStep('trip')}>{t.back}</Button><Button type="submit" disabled={pending}>{pending ? t.loading : t.next}</Button></div>
        </form>
      ) : null}
      {step === 'review' && quote ? (
        <div className="space-y-4">
          <dl className="space-y-2 rounded-2xl border border-line-default bg-surface-card p-5 text-sm">
            <div className="flex justify-between"><dt>{t.passenger}</dt><dd>{form.fullName} · <span dir="ltr">{form.phone}</span></dd></div>
            <div className="flex justify-between"><dt>{t.seats}</dt><dd>{formatNumber(quote.seats, lang)}</dd></div>
            <div className="flex justify-between"><dt>{t.unit}</dt><dd>{quote.subscription?.free ? t.free : formatMoney(quote.unitPrice, quote.currency, lang)}</dd></div>
            <div className="flex justify-between border-t border-line-default pt-2 text-base font-semibold"><dt>{t.total}</dt><dd>{quote.subscription?.free ? t.free : formatMoney(quote.total, quote.currency, lang)}</dd></div>
          </dl>
          {quote.subscription?.free ? null : quote.requiresPayment && quote.deadlineHours ? <p className="text-sm text-ink-secondary">{t.holdText(`${formatNumber(quote.deadlineHours, lang)} ${lang === 'ar' ? 'ساعة من الحجز' : 'h after booking'}`)}</p> : <p className="text-sm text-ink-secondary">{t.pay2}</p>}
          {gate.widget}
          {err}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setStep('passenger')}>{t.back}</Button><Button type="button" onClick={confirm} disabled={pending || !gate.ready}>{pending ? t.confirming : t.confirm}</Button></div>
        </div>
      ) : null}
    </div>
  );
}
