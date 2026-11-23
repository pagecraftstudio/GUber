'use client';
import { MemberShell } from '@/features/my-subscriptions/ui/MemberShell';
import { BookTripView } from './BookTripView';
import type { QuoteSubscription, TripDetail, TripStop } from '../types';

export const BookTripScreen = (p: { trip: TripDetail; stops: TripStop[]; subscription: QuoteSubscription | null; defaults: { fullName: string; phone: string } }) => (
  <MemberShell backHref="/my-bookings">{(lang) => <BookTripView lang={lang} {...p} />}</MemberShell>
);

export function TripUnavailable() {
  return (
    <MemberShell backHref="/">{(lang) => (
      <section className="mx-auto max-w-lg rounded-2xl border border-dashed border-line-default p-8 text-center" role="status">
        <h1 className="font-semibold">{lang === 'ar' ? 'هذه الرحلة غير متاحة للحجز' : 'This trip is not open for booking'}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{lang === 'ar' ? 'ربما غادرت أو امتلأت أو أُغلق الحجز. اختر رحلة أخرى.' : 'It may have left, filled up or closed. Pick another trip.'}</p>
      </section>
    )}</MemberShell>
  );
}
