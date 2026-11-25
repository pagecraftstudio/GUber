import { parseInput } from '@/lib/errors';
import { actingRepository, type ActingDb } from './repository';
import { enterActingSchema } from './schema';

export const actingService = {
  /** Starts a READ session (30 minutes). Returns when it ends. */
  async enter(c: ActingDb, input: unknown): Promise<string> {
    const v = parseInput(enterActingSchema, input);
    return actingRepository.enter(c, v.companyId, v.reason);
  },
  /** The second, explicit confirmation: switches this session to WRITE. Never extends it. */
  confirmWrite: (c: ActingDb) => actingRepository.confirmWrite(c),
  exit: (c: ActingDb) => actingRepository.exit(c),
};
