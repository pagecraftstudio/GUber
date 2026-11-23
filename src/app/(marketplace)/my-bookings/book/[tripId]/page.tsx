import { notFound } from 'next/navigation';
import { requireCustomer } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService } from '@/features/my-subscriptions/service';
import { tripBookingService } from '@/features/trip-booking/service';
import { BookTripScreen, TripUnavailable } from '@/features/trip-booking/ui/BookScreen';

export const metadata = { title: 'Book a seat', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opened from a company website's "Book" button with only a trip id. The id picks WHICH public trip to show; it grants nothing: booking is
 * the signed-in student's own action and create_my_booking re-checks the trip (company comes from it, never from this page).
 * Signed out -> sign in, then back to exactly this address.
 */
export default async function BookTripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  if (!UUID.test(tripId)) notFound();
  const auth = await requireCustomer(`/my-bookings/book/${tripId.toLowerCase()}`);
  const c = { db: await createClient(), userId: auth.userId };
  const trip = await tripBookingService.detail(c, tripId);
  if (!trip) return <TripUnavailable />;
  const [stops, profile, quote] = await Promise.all([tripBookingService.stops(c, tripId), memberSubscriptionService.profile(c).catch(() => null), tripBookingService.quote(c, tripId, 1).catch(() => null)]);
  return <BookTripScreen trip={trip} stops={stops} subscription={quote?.subscription ?? null} defaults={{ fullName: profile?.fullName ?? '', phone: profile?.phone ?? '' }} />;
}
