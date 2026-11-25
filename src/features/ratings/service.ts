import { AppError } from '@/lib/errors';
import { ratingsRepository, type RatingsDb } from './repository';
import { submitRatingSchema } from './schema';

export const ratingsService = {
  mine: (c: RatingsDb) => ratingsRepository.mine(c),
  companies: (c: RatingsDb, ids: string[]) => ratingsRepository.companies(c, ids),
  drivers: (c: RatingsDb) => ratingsRepository.drivers(c),
  async submit(c: RatingsDb, input: unknown): Promise<void> {
    const parsed = submitRatingSchema.safeParse(input);
    if (!parsed.success) throw new AppError('validation', { detail: 'invalid_stars' });
    await ratingsRepository.submit(c, parsed.data);
  },
};
