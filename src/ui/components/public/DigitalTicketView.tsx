import React, { useEffect, useState } from 'react';
import { Booking, Trip, Route, Bus, PassengerTicket } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { Button } from '../common/Button';
import { isMockMode } from '../../lib/runtime';
import { transportService } from '../../lib/transportService';
import { describeBackendError } from '../../lib/real/customerBackend';
import { TicketQrImage } from './TicketQrImage';
import {
  CheckCircle2,
  QrCode,
  Printer,
  Bus as BusIcon,
  Calendar,
  Clock,
  MapPin,
  User,
  ArrowLeft,
  ShieldCheck,
  Users,
} from 'lucide-react';

interface DigitalTicketViewProps {
  booking: Booking;
  trip: Trip;
  routes: Route[];
  buses: Bus[];
  onDone: () => void;
}

export const DigitalTicketView: React.FC<DigitalTicketViewProps> = ({
  booking,
  trip,
  routes,
  buses,
  onDone,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const route = routes.find((r) => r.id === trip.routeId);
  const bus = buses.find((b) => b.id === trip.busId);

  // Real mode: tickets come from the backend (one per seat, fresh QR payload per fetch; the database keeps only hashes).
  // Mock mode (dev only): the booking's own passengers. Nothing is fabricated in real mode.
  const mock = isMockMode();
  const [live, setLive] = useState<PassengerTicket[] | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (mock) return;
    let on = true;
    setLive(null); setTicketsError(null);
    transportService.getBookingTickets(booking.id)
      .then((t) => { if (on) setLive(t); })
      .catch((e) => { if (on) setTicketsError(describeBackendError(e, locale)); });
    return () => { on = false; };
  }, [mock, booking.id, reloadKey, locale]);

  const passengers: PassengerTicket[] = mock
    ? booking.passengers && booking.passengers.length > 0
      ? booking.passengers
      : [{ id: `pt_${booking.id}_1`, bookingId: booking.id, ticketIndex: 1, passengerName: booking.passengerName, status: 'valid', qrOpaqueToken: booking.qrTicketToken }]
    : live ?? [];

  const [selectedPassengerIdx, setSelectedPassengerIdx] = useState(0);
  const activePassenger: PassengerTicket | undefined = passengers[selectedPassengerIdx] ?? passengers[0];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6">
      {/* Success banner */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          {t('ticketIssuedSuccess')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
          {t('ticketSub')}
        </p>
      </div>

      {/* Multi-Passenger Boarding Pass Selector (Rule #4) */}
      {passengers.length > 1 && (
        <div className="mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs print:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#3563E9]" />
              <span>{t('passengersDetailsTitle')} ({passengers.length} {t('seats')})</span>
            </span>
            <span className="text-[10px] text-slate-400">
              {locale === 'ar' ? 'اختر الراكب لعرض تذكرته الفردية' : 'Select passenger to view individual pass'}
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {passengers.map((p, idx) => {
              const isSelected = selectedPassengerIdx === idx;
              const isBoarded = p.status === 'boarded';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPassengerIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'bg-[#3563E9] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>Pass {p.ticketIndex}:</span>
                  <strong className="font-bold">{p.passengerName || booking.bookingReference}</strong>
                  {isBoarded && (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-100 px-1 py-0.2 rounded font-bold">
                      ✓ Boarded
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Digital Boarding Pass Ticket Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden print:border-black print:shadow-none">
        {/* Ticket Header */}
        <div
          className="p-5 text-white flex items-center justify-between"
          style={{ backgroundColor: currentCompany.primaryColor || '#14243A' }}
        >
          <div className="flex items-center gap-2.5">
            <BusIcon className="w-5 h-5 text-blue-400" />
            <div>
              <span className="font-bold text-base tracking-tight block">
                {locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn}
              </span>
              <span className="text-xs text-slate-300 font-mono">
                {locale === 'ar' ? currentCompany.taglineAr : currentCompany.taglineEn}
              </span>
            </div>
          </div>
          <div className="text-end">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider block">
              {t('bookingRef')}
            </span>
            <span className="font-mono font-bold text-sm text-amber-300 tracking-wider">
              {booking.bookingReference}
            </span>
            {passengers.length > 1 && (
              <span className="text-[10px] text-slate-300 block font-mono">
                Pass {activePassenger?.ticketIndex} of {passengers.length}
              </span>
            )}
          </div>
        </div>

        {/* Route Bar */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">{t('boardingOrigin')}</span>
            <span className="text-sm font-bold text-slate-900">
              {locale === 'ar' ? route?.originCityAr : route?.originCityEn}
            </span>
          </div>
          <div className="text-slate-400 font-semibold px-2">{locale === 'ar' ? '←' : '→'}</div>
          <div className="text-end">
            <span className="text-xs text-slate-500 block">{t('destination')}</span>
            <span className="text-sm font-bold text-slate-900 text-[#0F9D8A]">
              {locale === 'ar' ? route?.destCityAr : route?.destCityEn}
            </span>
          </div>
        </div>

        {/* Ticket Body */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="sm:col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">{t('passenger')}</span>
                <span className="font-bold text-slate-900 text-sm">
                  {activePassenger?.passengerName || booking.passengerName}
                </span>
                <span className="text-slate-500 block font-mono mt-0.5">
                  {booking.passengerPhone}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t('seats')}</span>
                <span className="text-2xl font-bold text-[#3563E9] tabular-nums">
                  {booking.passengerCount || 1} {t('seats')}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">{t('departure')}</span>
                <span className="font-semibold text-slate-900">
                  {trip.departureDate} {t('atTime')} {trip.departureTime}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{t('arrival')}</span>
                <span className="font-semibold text-slate-900">
                  {trip.arrivalTime} ({route?.durationMinutes} {t('minDuration')})
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">{t('busPlate')}</span>
                <span className="font-medium text-slate-800 font-mono">{bus?.plateNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">{t('totalToPay')}</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {booking.fareEgp} {t('egp')} ({t('payCashPos')})
                </span>
              </div>
            </div>

            {booking.studentId && (
              <div className="p-2.5 bg-blue-50/80 rounded-lg text-xs text-blue-800 border border-blue-100 flex items-center gap-2">
                <span className="font-bold">{t('studentPassApplied')}:</span>
                <span className="font-mono">{booking.studentId}</span>
              </div>
            )}

            {/* Boarding Status Check */}
            {activePassenger?.status === 'boarded' && (
              <div className="p-2.5 bg-emerald-50 rounded-lg text-xs text-emerald-800 border border-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {locale === 'ar' ? 'تم تأكيد الصعود في' : 'Boarding Confirmed at'}:{' '}
                  {activePassenger?.boardedAt
                    ? new Date(activePassenger.boardedAt).toLocaleTimeString()
                    : 'Registered'}
                </span>
              </div>
            )}
          </div>

          {/* QR Code section - Rule #2: Cryptographically random opaque tokens (issued by the backend only) */}
          {!mock && !live && !ticketsError ? (
            <div role="status" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              <div className="w-28 h-28 animate-pulse rounded-lg bg-slate-200" aria-hidden />
              <span className="text-[10px] text-slate-500">{locale === 'ar' ? 'جارٍ تحميل التذاكر…' : 'Loading your tickets…'}</span>
            </div>
          ) : ticketsError ? (
            <div role="alert" className="flex flex-col items-center justify-center p-4 bg-red-50 rounded-xl border border-red-200 text-center space-y-2">
              <span className="text-xs text-red-700">{ticketsError}</span>
              <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>{locale === 'ar' ? 'إعادة المحاولة' : 'Try again'}</Button>
            </div>
          ) : !activePassenger ? (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
              <span className="text-xs text-slate-600">{locale === 'ar' ? 'لا توجد تذاكر صالحة لهذا الحجز.' : 'There are no valid tickets for this booking.'}</span>
              <span className="text-sm font-mono font-bold text-slate-900 select-all">{booking.bookingReference}</span>
            </div>
          ) : activePassenger.status === 'boarded' ? (
            <div className="flex flex-col items-center justify-center p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <span className="text-xs text-emerald-800 font-semibold">{locale === 'ar' ? 'تم الصعود. لا حاجة لرمز QR.' : 'Already boarded. No QR needed.'}</span>
            </div>
          ) : activePassenger.qrOpaqueToken ? (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
              {mock ? (
                <div className="w-28 h-28 bg-white p-2 rounded-lg border border-slate-300 shadow-xs flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-slate-900" />
                </div>
              ) : (
                <TicketQrImage payload={activePassenger.qrOpaqueToken} label={locale === 'ar' ? 'رمز QR للتذكرة' : 'Ticket QR code'} />
              )}
              <span className="text-[10px] text-slate-500 leading-tight block">{t('qrNotice')}</span>
              {!mock && (
                <span className="text-[10px] text-slate-400 leading-tight block">
                  {locale === 'ar' ? 'يُصدَر رمز جديد في كل مرة تفتح فيها التذكرة؛ لا تستخدم لقطات الشاشة القديمة.' : 'A new code is issued each time you open this ticket. Old screenshots stop working.'}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-1">
              <span className="text-sm font-mono font-bold text-slate-900 select-all">{booking.bookingReference}</span>
              <span className="text-[10px] text-slate-500 leading-tight block">
                {locale === 'ar' ? 'أظهر رقم الحجز عند الصعود.' : 'Show this reference when boarding.'}
              </span>
            </div>
          )}
        </div>

        {/* Ticket Footer Tear-Off */}
        <div className="bg-slate-100/70 p-4 border-t border-dashed border-slate-300 flex items-center justify-between text-xs text-slate-500">
          <span>
            {locale === 'ar' ? currentCompany.supportAddressAr : currentCompany.supportAddressEn}
          </span>
          <span dir="ltr">{t('hotline')}: {currentCompany.phone}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={onDone}
          icon={<ArrowLeft className="w-4 h-4 rtl:rotate-180" />}
        >
          {t('newBooking')}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            icon={<Printer className="w-4 h-4" />}
          >
            {t('printTicket')}
          </Button>
          <Button size="sm" onClick={onDone}>
            {t('returnToHome')}
          </Button>
        </div>
      </div>
    </div>
  );
};
