import { AppError, toClientError } from '@/lib/errors';

/**
 * Decides what an admin detail page does with an error from the service layer.
 *
 * ONLY "the row does not exist (or is not visible to you)" becomes HTTP 404. That is AppError('not_found'), which
 * mapDbError() produces for SQLSTATE P0002 / PGRST116. PostgREST itself answers P0002 with HTTP 500 on the Next -> Supabase
 * hop; that status never reaches the browser, the page turns it into a real 404 here.
 * Everything else (internal, forbidden, unauthenticated, plan/business errors, unexpected throwables) stays an error state
 * with a safe message and is NOT turned into a 404, so a real outage is never disguised as "no such company".
 * `invalidInputIsMissing`: a malformed id in the URL is simply a URL that matches nothing (audit entries).
 */
export type AdminPageOutcome = { kind: 'missing' } | { kind: 'error'; message: string };

export function adminPageOutcome(e: unknown, opts: { invalidInputIsMissing?: boolean } = {}): AdminPageOutcome {
  if (e instanceof AppError && (e.code === 'not_found' || (opts.invalidInputIsMissing === true && e.code === 'validation'))) {
    return { kind: 'missing' };
  }
  return { kind: 'error', message: toClientError(e).message };
}
