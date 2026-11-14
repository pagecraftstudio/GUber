import React, { useState, useEffect, useRef } from 'react';
import { Trip, Route, Bus, Stop, Booking, ReturnOption } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { transportService } from '../../lib/transportService';
import { BackendError, describeBackendError } from '../../lib/real/customerBackend';
import { isMockMode } from '../../lib/runtime';

import { BookingMasarView } from '../masar/BookingMasarView';


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

  // Go and return (real backend only): a second trip, the student picks one of the company's return times.
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnOptions, setReturnOptions] = useState<ReturnOption[] | null>(null);
  const [returnTripId, setReturnTripId] = useState('');
  const [returnsError, setReturnsError] = useState('');
  const offersRoundTrip = !isMockMode() && trip?.roundTripPriceEgp !== undefined;

  useEffect(() => { setRoundTrip(false); setReturnOptions(null); setReturnTripId(''); setReturnsError(''); }, [isOpen, trip?.id]);
  useEffect(() => {
    if (!isOpen || !trip || !roundTrip || !offersRoundTrip || returnOptions) return;
    let on = true;
    transportService.getReturnOptions(trip.id)
      .then((o) => { if (on) setReturnOptions(o); })
      .catch((e) => { if (on) setReturnsError(describeBackendError(e, locale)); });
    return () => { on = false; };
  }, [isOpen, trip?.id, roundTrip, offersRoundTrip, returnOptions, locale]);
  // A key belongs to ONE request: another return time (or one-way vs round trip) is a different request.
  useEffect(() => { idempotencyKey.current = crypto.randomUUID(); }, [roundTrip, returnTripId]);

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

  const selectedReturn = roundTrip ? returnOptions?.find((o) => o.id === returnTripId) : undefined;
  const outboundAvailable = Math.max(0, trip.totalSeats - trip.bookedSeats);
  const availableSeats = selectedReturn ? Math.min(outboundAvailable, selectedReturn.availableSeats) : outboundAvailable;
  const isFullyBooked = availableSeats <= 0;

  // Student discount: 15% off if studentId is provided (optional unless required)
  // Student pricing is NOT applied by the backend (verification pending): never show a discount the server will not charge.
  const hasStudentDiscount = isMockMode() && studentId.trim().length > 3;
  const baseFarePerPassenger = trip.priceEgp;
  const discountPerPassenger = hasStudentDiscount ? Math.round(baseFarePerPassenger * 0.15) : 0;
  const roundTripFare = trip.roundTripPriceEgp ?? 0;
  const separateFare = baseFarePerPassenger + (selectedReturn?.priceEgp ?? 0);
  const saving = selectedReturn ? Math.max(0, separateFare - roundTripFare) : 0;
  const finalFare = roundTrip ? roundTripFare * passengerCount : (baseFarePerPassenger - discountPerPassenger) * passengerCount;

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
    if (roundTrip && !returnTripId) {
      newErrors.returnTrip = locale === 'ar' ? 'اختر موعد العودة.' : 'Choose a return time.';
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

      const common = {
        companyId: trip.companyId || currentCompany.id, tripId: trip.id, passengerName: passengerName.trim(), passengerPhone: passengerPhone.trim(),
        studentId: studentId.trim() || undefined, passengerCount, pickupStopId: route?.originStopId || '', dropoffStopId: route?.destStopId || '',
        idempotencyKey: idempotencyKey.current,
      };
      const booking = roundTrip
        ? await transportService.createRoundTripBooking({ ...common, returnTripId })
        : await transportService.createBooking({
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
    <BookingMasarView
      open={isOpen} onClose={onClose} onSubmit={handleSubmit}
      routeTitle={`${locale === 'ar' ? route?.originCityAr : route?.originCityEn} → ${locale === 'ar' ? route?.destCityAr : route?.destCityEn}`}
      departureDate={trip.departureDate} departureTime={trip.departureTime}
      availableSeats={availableSeats} isFullyBooked={isFullyBooked} loading={loading} guestBlocked={guestBlocked}
      signedInAs={isAuthenticated && !isBookingForSomeoneElse ? { name: user?.fullName ?? '', ...(user?.email ? { email: user.email } : {}) } : null}
      onSignIn={() => openAuthModal('login')} {...(isMockMode() ? { onBookForOther: handleResetToGuest } : {})}
      values={{ name: passengerName, phone: passengerPhone, studentId }}
      setValues={(v) => { setPassengerName(v.name); setPassengerPhone(v.phone); setStudentId(v.studentId); }}
      showStudentId={isMockMode()} count={passengerCount} setCount={setPassengerCount}
      extraNames={extraPassengerNames} setExtraName={handleApplyCompanion} showExtraNames={isMockMode()}
      offersRoundTrip={offersRoundTrip} roundTrip={roundTrip} setRoundTrip={setRoundTrip} roundTripPrice={roundTripFare}
      returnOptions={returnOptions} returnsError={returnsError} returnTripId={returnTripId} setReturnTripId={setReturnTripId}
      oneWayFare={baseFarePerPassenger} saving={saving} discount={discountPerPassenger} total={finalFare} errors={errors}
    />
  );
};
