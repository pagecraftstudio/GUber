'use client';
import { useCallback, useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/events';
import type { AnalyticsLocale } from '@/lib/analytics/copy';

export type FunnelStep = 'trip' | 'passenger' | 'review' | 'pay' | 'done';
/** Steps where leaving the page means the booking was NOT made. After `pay`/`done` the booking exists, so leaving is not an abandon. */
const OPEN_STEPS: readonly FunnelStep[] = ['trip', 'passenger', 'review'];

/**
 * Booking-funnel analytics (P10) for the booking wizard. This is the ONLY place booking_start is sent: the marketplace and the
 * company-site "Book" link both open the wizard, so counting here covers both entries exactly once.
 * Properties are the trip id and the step name only (catalog: 0069). Nothing about the passenger. The server drops every event
 * unless the visitor agreed to be recorded, and a failed request never reaches the page.
 */
export function useBookingFunnel(o: { lang: AnalyticsLocale; tripId: string; step: FunnelStep; booked: boolean; paymentShown: boolean }) {
  const { lang, tripId, step, booked, paymentShown } = o;
  const sent = useRef(new Set<string>());
  const live = useRef({ lang, tripId, step, booked });
  live.current = { lang, tripId, step, booked };
  const mounted = useRef(false);

  /** At most once per key for the life of the wizard (React strict mode re-runs effects; a re-render must not double count). */
  const once = useCallback((key: string, fn: () => void) => {
    if (sent.current.has(key)) return;
    sent.current.add(key);
    fn();
  }, []);

  useEffect(() => { once('start', () => track(lang, 'booking_start', { trip_id: tripId })); }, [once, lang, tripId]);

  useEffect(() => {
    if (step === 'passenger' || step === 'review') once(`step:${step}`, () => track(lang, 'booking_step', { trip_id: tripId, step }));
  }, [once, lang, tripId, step]);

  useEffect(() => {
    if (paymentShown) once('payment_info', () => track(lang, 'payment_info_shown', { trip_id: tripId }));
  }, [once, lang, tripId, paymentShown]);

  // Abandon: the page is left (tab closed, navigation) or the wizard is unmounted (in-app navigation) before the booking exists.
  useEffect(() => {
    mounted.current = true;
    const abandon = () => {
      const c = live.current;
      if (c.booked || !OPEN_STEPS.includes(c.step)) return;
      once('abandon', () => track(c.lang, 'booking_abandon', { trip_id: c.tripId, step: c.step }));
    };
    window.addEventListener('pagehide', abandon);
    return () => {
      window.removeEventListener('pagehide', abandon);
      mounted.current = false;
      // Strict mode remounts synchronously; a real unmount stays unmounted, so only then is it an abandon.
      setTimeout(() => { if (!mounted.current) abandon(); }, 0);
    };
  }, [once]);

  return {
    submit: () => track(lang, 'booking_submit', { trip_id: tripId }),
    success: (free: boolean) => track(lang, 'booking_success', { trip_id: tripId, free }),
    proofClick: () => track(lang, 'whatsapp_proof_click', { trip_id: tripId }),
  };
}
