import { AppError, type AppErrorCode } from '@/lib/errors';
import { logOperationFailure, logger, type Operation, type Outcome } from './index';

const OUTCOME_BY_APP_CODE: Record<AppErrorCode, Outcome> = {
  unauthenticated: 'unauthenticated', forbidden: 'forbidden', not_found: 'not_found', validation: 'validation', conflict: 'conflict',
  plan_limit: 'plan_limit', subscription_required: 'forbidden', rate_limited: 'rate_limited', business_rule: 'business_rule', internal: 'internal',
};

/**
 * Runs a server-side operation; on failure writes ONE structured log record (operation, outcome, detail code, company, user)
 * and re-throws the ORIGINAL error unchanged. Never logs input, only identifiers/classifications.
 * Non-AppError throwables are logged as 'internal' with a scrubbed error summary.
 */
export async function withFailureLog<T>(
  op: Operation,
  ctx: { companyId: string; userId: string },
  context: { tripId?: string | undefined; bookingId?: string | undefined; seats?: number | undefined },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    try {
      if (e instanceof AppError) {
        logOperationFailure({ op, outcome: OUTCOME_BY_APP_CODE[e.code], userId: ctx.userId, companyId: ctx.companyId, detail: e.detail, source: 'server', ...context });
      } else {
        logOperationFailure({ op, outcome: 'internal', userId: ctx.userId, companyId: ctx.companyId, source: 'server', ...context });
        logger.error('operation.failed.unexpected', { op, error: e });
      }
    } catch { /* logging never changes the outcome */ }
    throw e;
  }
}
