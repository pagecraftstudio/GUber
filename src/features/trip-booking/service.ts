import { z } from 'zod';
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
    coverage: async (c: BookingContext, tripIds: unknown) => repo.coverage(c, parseInput(z.array(idSchema).max(200), tripIds)),
    payment: (c: BookingContext, bookingId: unknown) => repo.payment(c, parseInput(idSchema, bookingId)),
    /** Free or paid is decided HERE from the database's own quote, never from anything the browser says: a subscriber's covered seat (1 seat) is booked
     *  through the subscriber function (price 0, one per direction per day), everything else is an ordinary booking. */
    async book(c: BookingContext, input: unknown) {
      const i = parseInput(bookTripSchema, input);
      const q = await repo.quote(c, i.tripId, i.seats);
      return q.subscription?.free ? repo.bookFree(c, i) : repo.book(c, i);
    },
  };
}
export const tripBookingService = makeTripBookingService(tripBookingRepository);
