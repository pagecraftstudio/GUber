import { z } from 'zod';
import { OPERATIONS, OUTCOMES } from './index';

/**
 * Body of POST /api/telemetry/failure. STRICT: unknown keys are rejected, so a client cannot smuggle tokens, QR payloads,
 * names or free text into the log pipeline by adding fields. Every value is an enum, a number or a UUID.
 */
export const failureReportSchema = z
  .object({
    op: z.enum(OPERATIONS),
    outcome: z.enum(OUTCOMES),
    pgCode: z.string().regex(/^[A-Za-z0-9]{3,8}$/).optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    tripId: z.uuid().optional(),
    bookingId: z.uuid().optional(),
    seats: z.number().int().min(1).max(50).optional(),
  })
  .strict();
export type FailureReport = z.infer<typeof failureReportSchema>;

export const MAX_REPORT_BYTES = 1024;
