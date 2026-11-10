'use client';
import type { FormEvent } from 'react';
import { Button } from '@/ds/primitives/Button';
import { Field } from '@/ds/primitives/Field';
import { DigitInput, Input } from '@/ds/primitives/Input';
import { Checkbox } from '@/ds/primitives/Choice';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { Modal } from '@/ds/feedback/Dialog';
import { formatClock, formatDay, formatMoney, formatNumber, localDigits } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import type { ReturnOption } from '../../types';
import { useLocale } from '../../context/LocaleContext';

export interface BookingMasarViewProps {
  open: boolean; onClose: () => void; onSubmit: (e: FormEvent) => void;
  routeTitle: string; departureDate: string; departureTime: string;
  availableSeats: number; isFullyBooked: boolean; loading: boolean; guestBlocked: boolean;
  signedInAs: { name: string; email?: string } | null; onSignIn: () => void; onBookForOther?: () => void;
  values: { name: string; phone: string; studentId: string };
  setValues: (v: { name: string; phone: string; studentId: string }) => void;
  showStudentId: boolean;
  count: number; setCount: (n: number) => void;
  extraNames: string[]; setExtraName: (i: number, v: string) => void; showExtraNames: boolean;
  offersRoundTrip: boolean; roundTrip: boolean; setRoundTrip: (b: boolean) => void; roundTripPrice: number;
  returnOptions: ReturnOption[] | null; returnsError: string; returnTripId: string; setReturnTripId: (id: string) => void;
  oneWayFare: number; saving: number; discount: number; total: number;
  errors: Record<string, string>;
}

/** The booking dialog in the MASAR look. Validation, idempotency and submission stay in BookingFlowModal; this only draws. No payment taken here (plan: pay the operator directly). */
export function BookingMasarView(p: BookingMasarViewProps) {
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const money = (n: number) => formatMoney(n, 'EGP', locale);
  const fare = p.roundTrip ? p.roundTripPrice : p.oneWayFare;
  const blocked = p.isFullyBooked;
  return (
    <Modal open={p.open} onClose={p.onClose} size="lg" title={t('bookYourSeat')}
      subtitle={<>{p.routeTitle} · {formatDay(p.departureDate, locale)} {t('atTime')} {formatClock(p.departureTime, locale)}</>}
      footer={<>
        <Button variant="secondary" onClick={p.onClose}>{t('cancel')}</Button>
        <Button type="submit" form="masar-booking" loading={p.loading} disabled={blocked}>
          {blocked ? t('fullyBooked') : p.guestBlocked ? (ar ? 'تسجيل الدخول للحجز' : 'Sign in to book') : (ar ? 'تأكيد الحجز' : 'Confirm booking')}
        </Button>
      </>}>
      <form id="masar-booking" onSubmit={p.onSubmit} noValidate className="flex flex-col gap-6">
        {blocked
          ? <InlineAlert tone="error" title={t('departureFullyBooked')}>{t('fullyBookedNotice')}</InlineAlert>
          : <p className="text-sm text-ink-secondary">{t('availableCapacity')}: <strong className="font-medium text-ink-primary">{formatNumber(p.availableSeats, locale)} {t('seatsRemainingText')}</strong></p>}

        {p.signedInAs ? (
          <InlineAlert tone="success" title={<>{t('loggedInAs')} {p.signedInAs.name}</>} action={p.onBookForOther ? <Button variant="ghost" onClick={p.onBookForOther}>{t('bookForSomeoneElse')}</Button> : undefined}>
            {p.signedInAs.email ? <Identifier value={p.signedInAs.email} /> : null}
          </InlineAlert>
        ) : (
          <InlineAlert tone="info" title={p.guestBlocked ? (ar ? 'تسجيل الدخول مطلوب للحجز' : 'Sign in to book') : t('guestCheckout')}
            action={<Button variant="secondary" onClick={p.onSignIn}>{t('signIn')}</Button>}>
            {p.guestBlocked ? (ar ? 'يتم الحجز من حسابك لتتمكن من عرضه وإلغائه لاحقاً.' : 'Bookings are made from your account so you can view and cancel them later.') : t('guestCheckoutNotice')}
          </InlineAlert>
        )}

        <fieldset className="flex flex-col gap-4" disabled={blocked}>
          <legend className="mb-1 text-base font-medium">{t('passengerDetails')}</legend>
          <Field label={t('fullNameLabel')} required error={p.errors.name}>
            <Input value={p.values.name} placeholder={t('fullNamePlaceholder')} autoComplete="name" onChange={(e) => p.setValues({ ...p.values, name: e.target.value })} />
          </Field>
          <Field label={t('phoneLabel')} required error={p.errors.phone}>
            <DigitInput kind="tel" value={p.values.phone} placeholder="01012345678" onChange={(e) => p.setValues({ ...p.values, phone: e.target.value })} />
          </Field>
          {p.showStudentId ? (
            <Field label={t('optionalStudentId')} hint={t('studentIdHint')}>
              <DigitInput kind="identifier" value={p.values.studentId} onChange={(e) => p.setValues({ ...p.values, studentId: e.target.value })} />
            </Field>
          ) : null}
        </fieldset>

        {p.offersRoundTrip && !blocked ? (
          <div className="flex flex-col gap-3 border-t border-line-default pt-5">
            <Checkbox checked={p.roundTrip} onChange={(e) => { p.setRoundTrip(e.target.checked); p.setReturnTripId(''); }}
              label={<strong className="font-medium">{ar ? 'ذهاب وعودة' : 'Go and return'}</strong>}
              hint={<>{ar ? 'أضف رحلة العودة بسعر الذهاب والعودة: ' : 'Add the trip back at the go-and-return price: '}{money(p.roundTripPrice)}{ar ? ' للمقعد' : ' per seat'}</>} />
            {p.roundTrip ? (
              p.returnsError ? <InlineAlert tone="error">{p.returnsError}</InlineAlert>
              : !p.returnOptions ? <p role="status" className="text-sm text-ink-secondary">{ar ? 'جارٍ تحميل مواعيد العودة…' : 'Loading return times…'}</p>
              : p.returnOptions.length === 0 ? <p className="text-sm text-ink-secondary">{ar ? 'لا توجد مواعيد عودة متاحة حالياً.' : 'No return times are available right now.'}</p>
              : (
                <fieldset className="flex flex-col gap-2" aria-describedby={p.errors.returnTrip ? 'ret-err' : undefined}>
                  <legend className="mb-1 text-sm font-medium">{ar ? 'اختر موعد العودة' : 'Choose your return time'}</legend>
                  {p.returnOptions.map((o) => {
                    const off = o.availableSeats < p.count || o.availableSeats <= 0;
                    return (
                      <label key={o.id} className={`flex items-center justify-between gap-3 rounded-ds-md border p-3 text-sm ${off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${p.returnTripId === o.id ? 'border-action' : 'border-line-default'}`}>
                        <span className="flex items-center gap-3">
                          <input type="radio" name="returnTrip" checked={p.returnTripId === o.id} disabled={off} onChange={() => p.setReturnTripId(o.id)} className="size-5 accent-[var(--ds-action-primary)]" />
                          <span><span className="font-medium">{formatDay(o.departureDate, locale)} · {formatClock(o.departureTime, locale)}</span><span className="block text-[13px] text-ink-muted">{o.originName} → {o.destName} · {formatClock(o.departureTime, locale)} – {formatClock(o.arrivalTime, locale)}</span></span>
                        </span>
                        <span className={`whitespace-nowrap text-[13px] ${o.availableSeats <= 0 ? 'text-status-error-fg' : 'text-ink-secondary'}`}>{o.availableSeats <= 0 ? t('fullyBooked') : `${formatNumber(o.availableSeats, locale)} ${t('seatsRemainingText')}`}</span>
                      </label>
                    );
                  })}
                  {p.errors.returnTrip ? <p id="ret-err" className="text-[13px] text-status-error-fg">{p.errors.returnTrip}</p> : null}
                </fieldset>
              )
            ) : null}
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-3 border-t border-line-default pt-5" disabled={blocked} aria-describedby={p.errors.count ? 'cnt-err' : undefined}>
          <legend className="mb-1 text-base font-medium">{t('passengerCount')}</legend>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((n) => {
              const off = n > p.availableSeats;
              return <Button key={n} variant={p.count === n ? 'primary' : 'secondary'} disabled={off} aria-pressed={p.count === n} onClick={() => p.setCount(n)}>{localDigits(String(n), locale)}</Button>;
            })}
          </div>
          {p.errors.count ? <p id="cnt-err" className="text-[13px] text-status-error-fg">{p.errors.count}</p> : null}
          {p.count > 1 ? (p.showExtraNames
            ? Array.from({ length: p.count - 1 }).map((_, i) => (
                <Field key={i} label={`${t('passengerNumber')} ${localDigits(String(i + 2), locale)} ${t('fullNameLabel')}`}>
                  <Input value={p.extraNames[i] ?? ''} onChange={(e) => p.setExtraName(i, e.target.value)} />
                </Field>))
            : <p role="note" className="text-[13px] text-ink-muted">{ar ? 'سيتم إصدار تذكرة منفصلة لكل مقعد. حاليًا تُسجَّل بيانات صاحب الحجز فقط لجميع التذاكر.' : 'A separate ticket is issued for each seat. Currently, the booking holder’s details are recorded for all tickets.'}</p>) : null}
        </fieldset>

        <dl className="flex flex-col gap-2 border-t border-line-default pt-5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-ink-secondary">{p.roundTrip ? (ar ? 'ذهاب وعودة' : 'Go and return') : t('ticketFare')} ({formatNumber(p.count, locale)} × {money(fare)})</dt><dd className="tabular-nums">{money(fare * p.count)}</dd></div>
          {p.roundTrip && p.saving > 0 ? <div className="flex justify-between gap-3 text-status-success-fg"><dt>{ar ? 'توفير مقارنة بحجز كل رحلة منفصلة' : 'You save compared with two single tickets'}</dt><dd className="tabular-nums">{money(p.saving * p.count)}</dd></div> : null}
          {p.discount > 0 ? <div className="flex justify-between gap-3 text-status-success-fg"><dt>{t('studentDiscount')}</dt><dd className="tabular-nums">− {money(p.discount * p.count)}</dd></div> : null}
          <div className="flex justify-between gap-3 border-t border-line-default pt-2 text-base font-medium"><dt>{t('totalToPay')}</dt><dd className="tabular-nums">{money(p.total)}</dd></div>
        </dl>
        <p className="text-[13px] text-ink-muted">{ar ? 'لا يوجد دفع إلكتروني. ادفع للمشغّل مباشرة حسب تعليماته.' : 'No online payment. Pay the operator directly, as they instruct.'}</p>
        {p.errors.form ? <InlineAlert tone="error">{p.errors.form}</InlineAlert> : null}
      </form>
    </Modal>
  );
}
