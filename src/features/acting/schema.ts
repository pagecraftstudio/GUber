import { z } from 'zod';

/** The only input the browser sends to start a session: which company, and why. The reason is kept in the audit log. */
export const enterActingSchema = z.object({
  companyId: z.string().uuid(),
  reason: z.string().trim().min(3, 'reason_required').max(300, 'reason_too_long'),
});
export type EnterActingInput = z.infer<typeof enterActingSchema>;

export const ACTING_MINUTES = 30;
