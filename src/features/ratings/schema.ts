import { z } from 'zod';

const stars = z.number().int().min(1).max(5);
export const submitRatingSchema = z.object({ bookingId: z.string().uuid(), tripStars: stars, driverStars: stars });
export type SubmitRatingInput = z.infer<typeof submitRatingSchema>;
