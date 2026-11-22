import { parseInput } from '@/lib/errors';
import { idSchema } from '@/lib/validation/common';
import { tripBookingRepository, type BookingDb, type TripBookingRepository } from './repository';
import { bookTripSchema, seatsSchema } from './schema';

/** The caller is the signed-in student (routes use requireCustomer). No permission keys: a student only ever books for themself and the
 *  database enforces that again. Order in every method: validate -> repository. */
export type BookingContext = BookingDb & { readonly userId: string };

export function makeTripBookingService(repo: TripBookingRepository) {
  return {
    detail: (c: BookingContext, tripId: unknown) => repo.detail(c, parseInput(idSchema, tripId)),
    stops: (c: BookingContext, tripId: unknown) => repo.stops(c, parseInput(idSchema, tripId)),
    quote: (c: BookingContext, tripId: unknown, seats: unknown) => repo.quote(c, parseInput(idSchema, tripId), parseInput(seatsSchema, seats)),
    payment: (c: BookingContext, bookingId: unknown) => repo.payment(c, parseInput(idSchema, bookingId)),
    book: (c: BookingContext, input: unknown) => repo.book(c, parseInput(bookTripSchema, input)),
  };
}
export const tripBookingService = makeTripBookingService(tripBookingRepository);
