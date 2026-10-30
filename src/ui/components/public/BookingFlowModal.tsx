import React, { useState, useEffect, useRef } from 'react';
import { Trip, Route, Bus, Stop, Booking } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { transportService } from '../../lib/transportService';
import { BackendError, describeBackendError } from '../../lib/real/customerBackend';
import { isMockMode } from '../../lib/runtime';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  User,
  Phone,
  GraduationCap,
  CheckCircle2,
  Users,
  AlertCircle,
  Sparkles,
  LogIn,
  UserCheck,
  Plus,
} from 'lucide-react';

interface BookingFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  routes: Route[];
  buses: Bus[];
  stops: Stop[];
  onBookingSuccess: (booking: Booking, trip: Trip) => void;
}

export const BookingFlowModal: React.FC<BookingFlowModalProps> = ({
  isOpen,
  onClose,
  trip,
  routes,
  buses,
  stops,
  onBookingSuccess,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();
  const { user, profile, isAuthenticated, openAuthModal } = useAuth();

  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [studentId, setStudentId] = useState('');
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [extraPassengerNames, setExtraPassengerNames] = useState<string[]>(['', '', '']);
  const [isBookingForSomeoneElse, setIsBookingForSomeoneElse] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // One key per booking attempt: a double-click or network retry replays the SAME booking instead of creating a second one.
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const idempotencyTripId = useRef<string | null>(null);

  // A key belongs to one trip attempt. Keep it across retries for that trip, but never reuse it for another trip.
  useEffect(() => {
    if (!isOpen || !trip) return;
    if (idempotencyTripId.current !== trip.id) {
      idempotencyTripId.current = trip.id;
      idempotencyKey.current = crypto.randomUUID();
    }
  }, [isOpen, trip?.id]);

  // Autofill when modal opens or user profile changes
  useEffect(() => {
    if (isOpen && isAuthenticated && user && !isBookingForSomeoneElse) {
      setPassengerName(profile?.fullName || user.fullName || '');
      setPassengerPhone(profile?.phone || user.phone || '');
      setStudentId(profile?.studentId || user.studentId || '');
    }
  }, [isOpen, isAuthenticated, user, profile, isBookingForSomeoneElse]);

  if (!trip) return null;

  const route = routes.find((r) => r.id === trip.routeId);
  const guestBlocked = !isMockMode() && !isAuthenticated;
  const bus = buses.find((b) => b.id === trip.busId);

  const availableSeats = Math.max(0, trip.totalSeats - trip.bookedSeats);
  const isFullyBooked = availableSeats <= 0;

  // Student discount: 15% off if studentId is provided (optional unless required)
  // Student pricing is NOT applied by the backend (verification pending): never show a discount the server will not charge.
  const hasStudentDiscount = isMockMode() && studentId.trim().length > 3;
  const baseFarePerPassenger = trip.priceEgp;
  const discountPerPassenger = hasStudentDiscount ? Math.round(baseFarePerPassenger * 0.15) : 0;
  const finalFare = (baseFarePerPassenger - discountPerPassenger) * passengerCount;

  const handleResetToGuest = () => {
    setIsBookingForSomeoneElse(true);
    setPassengerName('');
    setPassengerPhone('');
    setStudentId('');
  };

  const handleApplyCompanion = (index: number, name: string) => {
    setExtraPassengerNames((prev) => {
      const copy = [...prev];
      copy[index] = name;
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guestBlocked) {
      // Real backend books only for a signed-in customer: never pretend a guest booking can succeed.
      openAuthModal('login');
      return;
    }
    if (isFullyBooked) {
      setErrors({ form: t('validationFullyBooked') });
      return;
    }

    const newErrors: Record<string, string> = {};

    if (!passengerName.trim()) {
      newErrors.name = t('validationEnterName');
    }
    const cleanPhone = passengerPhone.replace(/\s+/g, '');
    if (!cleanPhone) {
      newErrors.phone = t('validationEnterPhone');
    } else if (!/^01[0125][0-9]{8}$/.test(cleanPhone)) {
      newErrors.phone = t('validationValidEgyptianPhone');
    }

    if (passengerCount > availableSeats) {
      newErrors.count = t('validationSeatsAvailableOnly');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      // Build full passenger list (Primary passenger + any extra companions)
      const allPassengerNames = [
        passengerName.trim(),
        ...extraPassengerNames.slice(0, passengerCount - 1).map((n, i) => n.trim() || `Guest ${i + 2}`),
      ];

      const booking = await transportService.createBooking({
        companyId: trip.companyId || currentCompany.id,
        customerId: isAuthenticated && !isBookingForSomeoneElse ? user?.id : undefined,
        tripId: trip.id,
        passengerName: passengerName.trim(),
        passengerPhone: passengerPhone.trim(),
        studentId: studentId.trim() || undefined,
        passengerCount,
        fareEgp: finalFare,
        status: 'confirmed',
        pickupStopId: route?.originStopId || '',
        dropoffStopId: route?.destStopId || '',
        passengerNames: allPassengerNames,
        idempotencyKey: idempotencyKey.current,
      } as any);
      idempotencyKey.current = crypto.randomUUID();

      setLoading(false);
      onBookingSuccess(booking, trip);
    } catch (err: any) {
      setLoading(false);
      if (err instanceof BackendError) idempotencyKey.current = crypto.randomUUID();
      setErrors({
        form:
          describeBackendError(err, locale) ||
          (locale === 'ar'
            ? 'فشلت عملية الحجز. يرجى المحاولة مرة أخرى.'
            : 'Booking submission failed. Please try again.'),
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('bookYourSeat')}
      subtitle={`${locale === 'ar' ? route?.originCityAr : route?.originCityEn} → ${
        locale === 'ar' ? route?.destCityAr : route?.destCityEn
      } (${trip.departureDate} ${t('atTime')} ${trip.departureTime})`}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Fully Booked Warning */}
        {isFullyBooked ? (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-3 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">{t('departureFullyBooked')}</strong>
              {t('fullyBookedNotice')}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-blue-50/70 border border-blue-200/60 rounded-lg flex items-center justify-between text-xs text-blue-900">
            <span>{t('availableCapacity')}:</span>
            <strong className="tabular-nums font-semibold">
              {availableSeats} {t('seatsRemainingText')}
            </strong>
          </div>
        )}

        {/* Auth / Guest Banner */}
        {isAuthenticated && !isBookingForSomeoneElse ? (
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between gap-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span>{t('loggedInAs')} <strong>{user?.fullName}</strong> ({user?.email})</span>
                <span className="block text-[11px] text-emerald-700">{t('autofillApplied')}</span>
              </div>
            </div>
            {isMockMode() && (
              <button
                type="button"
                onClick={handleResetToGuest}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline whitespace-nowrap cursor-pointer"
              >
                {t('bookForSomeoneElse')}
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs text-slate-700">
            <div className="space-y-0.5">
              <strong className="block font-semibold text-slate-900">
                {guestBlocked ? (locale === 'ar' ? 'تسجيل الدخول مطلوب للحجز' : 'Sign in to book') : t('guestCheckout')}
              </strong>
              <p className="text-[11px] text-slate-500">
                {guestBlocked
                  ? (locale === 'ar' ? 'يتم الحجز من حسابك لتتمكن من عرضه وإلغائه لاحقاً.' : 'Bookings are made from your account so you can view and cancel them later.')
                  : t('guestCheckoutNotice')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="px-2.5 py-1 bg-white border border-slate-300 hover:border-[#3563E9] text-[#3563E9] font-bold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shadow-2xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{t('signIn')}</span>
            </button>
          </div>
        )}

        {/* Step 1: Passenger Information */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. {t('passengerDetails')}
            </h4>
            <span className="text-[11px] text-slate-400">
              {locale === 'ar' ? 'الراكب الأساسي' : 'Primary Passenger'}
            </span>
          </div>

          <Input
            label={t('fullNameLabel')}
            placeholder={t('fullNamePlaceholder')}
            value={passengerName}
            onChange={(e) => setPassengerName(e.target.value)}
            error={errors.name}
            icon={<User className="w-4 h-4" />}
            disabled={isFullyBooked}
            required
          />

          <Input
            label={t('phoneLabel')}
            placeholder="01012345678"
            value={passengerPhone}
            onChange={(e) => setPassengerPhone(e.target.value)}
            error={errors.phone}
            icon={<Phone className="w-4 h-4" />}
            dir="ltr"
            disabled={isFullyBooked}
            required
          />

          {/* Student ID (Optional unless required, grants 15% discount) */}
          {isMockMode() && (
          <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#3563E9]" />
                <span>{t('optionalStudentId')}</span>
              </label>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                {locale === 'ar' ? 'خصم ١٥٪' : '15% Off'}
              </span>
            </div>
            <Input
              placeholder="e.g. GU-2024-8841"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              helperText={t('studentIdHint')}
              disabled={isFullyBooked}
            />
          </div>
          )}
        </div>

        {/* Step 2: Passenger Count Selection & Multi-Passenger Manifest (Rule #4) */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              2. {t('passengerCount')}
            </h4>
            <span className="text-xs text-slate-500">{t('capacityBasedV1')}</span>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((num) => {
              const disabled = num > availableSeats || isFullyBooked;
              const isSelected = passengerCount === num;
              return (
                <button
                  key={`cnt_${num}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPassengerCount(num)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'bg-[#3563E9] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {num} {num === 1 ? t('seat') : t('seats')}
                </button>
              );
            })}
          </div>
          {errors.count && <p className="text-xs text-red-600 font-medium">{errors.count}</p>}

          {/* Real backend issues one ticket per seat, but the current schema stores only the booking contact name. */}
          {passengerCount > 1 && (isMockMode() ? (
            <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Users className="w-3.5 h-3.5 text-[#3563E9]" />
                <span>{t('passengersDetailsTitle')} ({passengerCount} {t('seats')})</span>
              </div>
              {Array.from({ length: passengerCount - 1 }).map((_, idx) => (
                <div key={`extra_p_${idx}`} className="space-y-1.5 pt-2 border-t border-slate-200/80">
                  <label className="text-[11px] font-semibold text-slate-700">
                    {t('passengerNumber')} {idx + 2} {t('fullNameLabel')}
                  </label>
                  <Input
                    placeholder={`e.g. Passenger ${idx + 2} Full Name`}
                    value={extraPassengerNames[idx] || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExtraPassengerNames((prev) => {
                        const copy = [...prev];
                        copy[idx] = val;
                        return copy;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500" role="note">
              {locale === 'ar'
                ? 'سيتم إصدار تذكرة منفصلة لكل مقعد. حاليًا تُسجَّل بيانات صاحب الحجز فقط لجميع التذاكر.'
                : 'A separate ticket is issued for each seat. Currently, the booking holder’s details are recorded for all tickets.'}
            </p>
          ))}
        </div>

        {/* Step 3: Fare Summary & Payment Notice */}
        <div className="space-y-2.5 border-t border-slate-200 pt-4 bg-slate-50 -mx-5 -mb-5 p-5">
          <div className="flex justify-between text-xs text-slate-600">
            <span>
              {t('ticketFare')} ({passengerCount} × {baseFarePerPassenger} {t('egp')})
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">
              {baseFarePerPassenger * passengerCount} {t('egp')}
            </span>
          </div>

          {hasStudentDiscount && (
            <div className="flex justify-between text-xs text-[#0F9D8A]">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('studentDiscount')} (15%)</span>
              </span>
              <span className="font-semibold tabular-nums">
                - {discountPerPassenger * passengerCount} {t('egp')}
              </span>
            </div>
          )}

          <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>{t('totalToPay')}</span>
            <span className="text-base text-[#14243A] tabular-nums">
              {finalFare} {t('egp')}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 mt-1">
            {isMockMode()
              ? t('payAtBoardingNotice')
              : (locale === 'ar' ? 'لا يوجد دفع إلكتروني. ادفع للمشغّل مباشرة حسب تعليماته.' : 'No online payment. Pay the operator directly, as they instruct.')}
          </p>

          {errors.form && <p className="text-xs text-red-600 font-semibold">{errors.form}</p>}

          <div className="pt-2 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              size="md"
              loading={loading}
              disabled={isFullyBooked}
              className="w-full sm:w-auto"
            >
              {isFullyBooked ? t('fullyBooked') : guestBlocked ? (locale === 'ar' ? 'تسجيل الدخول للحجز' : 'Sign in to book') : isMockMode() ? t('confirmBookingButton') : (locale === 'ar' ? 'تأكيد الحجز' : 'Confirm booking')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
