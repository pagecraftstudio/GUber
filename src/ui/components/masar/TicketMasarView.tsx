'use client';
import { ArrowLeft, CheckCircle2, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/ds/primitives/Button';
import { Ticket } from '@/ds/domain/Ticket';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { Skeleton } from '@/ds/feedback/States';
import { Identifier } from '@/ds/format/Identifier';
import { formatClock, formatDay, formatMoney, formatNumber, formatTime, localDigits } from '@/ds/format';
import { tenantAccent } from '@/ds/contrast';
import { useLocale } from '../../context/LocaleContext';
import type { Booking, Bus, Company, PassengerTicket, Route, Trip } from '../../types';

export interface TicketMasarViewProps {
  booking: Booking; trip: Trip; route?: Route | undefined; bus?: Bus | undefined; company: Company;
  passengers: PassengerTicket[]; activeIdx: number; setActiveIdx: (i: number) => void;
  loading: boolean; error: string | null; onRetry: () => void;
  /** The QR drawing, or null when none applies (shown as the reference instead). */
  qr: ReactNode | null;
  onDone: () => void; onPrint: () => void;
}

/** The ticket page in the MASAR look, using the one shared Ticket object. Ticket data and the QR payload come from the caller untouched. */
export function TicketMasarView(p: TicketMasarViewProps) {
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const active = p.passengers[p.activeIdx] ?? p.passengers[0];
  const tint = tenantAccent(p.company.primaryColor);
  const boarded = active?.status === 'boarded';

  let qr: ReactNode;
  if (p.loading) qr = <div role="status" aria-label={ar ? 'جارٍ تحميل التذاكر…' : 'Loading your tickets…'}><Skeleton className="size-36" /></div>;
  else if (p.error) qr = <InlineAlert tone="error" action={<Button variant="secondary" onClick={p.onRetry}>{ar ? 'إعادة المحاولة' : 'Try again'}</Button>}>{p.error}</InlineAlert>;
  else if (!active) qr = <div className="text-center text-sm"><p className="text-ink-secondary">{ar ? 'لا توجد تذاكر صالحة لهذا الحجز.' : 'There are no valid tickets for this booking.'}</p><Identifier value={p.booking.bookingReference} /></div>;
  else if (boarded) qr = <p className="flex items-center gap-2 text-sm text-status-success-fg"><CheckCircle2 size={20} strokeWidth={1.5} aria-hidden="true" />{ar ? 'تم الصعود. لا حاجة لرمز QR.' : 'Already boarded. No QR needed.'}</p>;
  else if (p.qr) qr = <div className="flex flex-col items-center gap-2 text-center">{p.qr}<p className="text-[13px] text-ink-muted">{t('qrNotice')}</p></div>;
  else qr = <div className="text-center text-sm"><Identifier value={p.booking.bookingReference} /><p className="mt-1 text-[13px] text-ink-muted">{ar ? 'أظهر رقم الحجز عند الصعود.' : 'Show this reference when boarding.'}</p></div>;

  const details = [
    ...(p.route ? [{ label: t('arrival'), value: `${formatClock(p.trip.arrivalTime, locale)}${p.route.durationMinutes ? ` (${formatNumber(p.route.durationMinutes, locale)} ${t('minDuration')})` : ''}` }] : []),
    ...(p.bus?.plateNumber ? [{ label: t('busPlate'), value: <Identifier value={p.bus.plateNumber} /> }] : []),
    { label: t('totalToPay'), value: `${formatMoney(p.booking.fareEgp, 'EGP', locale)} (${t('payCashPos')})` },
    ...(p.booking.studentId ? [{ label: t('studentPassApplied'), value: <Identifier value={p.booking.studentId} /> }] : []),
    ...(p.booking.returnLeg ? [{ label: ar ? 'حجز العودة' : 'Return booking', value: <Identifier value={p.booking.returnLeg.bookingReference} /> }] : []),
    ...(boarded && active?.boardedAt ? [{ label: ar ? 'تم تأكيد الصعود في' : 'Boarding confirmed at', value: formatTime(active.boardedAt, locale) }] : []),
  ];
  const count = p.booking.passengerCount || 1;
  const seatLabel = `${localDigits(String(count), locale)} ${count === 1 ? t('seat') : t('seats')}`;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col items-center gap-2 text-center print:hidden">
        <CheckCircle2 size={32} strokeWidth={1.5} className="ds-check text-status-success-fg" aria-hidden="true" />
        <div className="ds-confirm-copy flex flex-col items-center gap-2">
          <h1 className="text-2xl font-medium">{t('ticketIssuedSuccess')}</h1>
          <p className="max-w-md text-sm text-ink-secondary">{t('ticketSub')}</p>
        </div>
      </header>

      {p.passengers.length > 1 ? (
        <div role="group" aria-label={t('passengersDetailsTitle')} className="flex flex-wrap gap-2 print:hidden">
          {p.passengers.map((x, i) => (
            <Button key={x.id} variant={i === p.activeIdx ? 'primary' : 'secondary'} aria-pressed={i === p.activeIdx} onClick={() => p.setActiveIdx(i)}>
              {localDigits(String(x.ticketIndex), locale)} · {x.passengerName || p.booking.bookingReference}{x.status === 'boarded' ? ` ✓` : ''}
            </Button>
          ))}
        </div>
      ) : null}

      <Ticket
        company={{ name: ar ? p.company.nameAr : p.company.nameEn }}
        {...(tint ? { tenant: tint } : {})}
        reference={p.booking.bookingReference}
        qr={qr}
        passengerName={active?.passengerName || p.booking.passengerName}
        seatLabel={seatLabel}
        whenText={`${formatDay(p.trip.departureDate, locale)} ${t('atTime')} ${formatClock(p.trip.departureTime, locale)}`}
        stops={[{ name: (ar ? p.route?.originCityAr : p.route?.originCityEn) ?? '' }, { name: (ar ? p.route?.destCityAr : p.route?.destCityEn) ?? '' }].filter((s) => s.name)}
        details={details}
        footer={<div className="flex flex-wrap justify-between gap-2"><span>{ar ? p.company.supportAddressAr : p.company.supportAddressEn}</span><span>{t('hotline')}: <Identifier value={p.company.phone} /></span></div>}
        labels={{ reference: t('bookingRef'), passenger: t('passenger'), seat: t('seats'), departure: t('departure') }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="secondary" onClick={p.onDone} iconStart={<ArrowLeft size={16} strokeWidth={1.5} className="rtl:rotate-180" />}>{t('newBooking')}</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={p.onPrint} iconStart={<Printer size={16} strokeWidth={1.5} />}>{t('printTicket')}</Button>
          <Button onClick={p.onDone}>{t('returnToHome')}</Button>
        </div>
      </div>
    </main>
  );
}
