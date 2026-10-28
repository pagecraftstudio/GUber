import { logger } from './index';

/** Shape Next passes to `onRequestError` (instrumentation). Only the fields we use are typed. */
export interface RequestErrorInfo { path: string; method: string }
export interface RequestErrorContext { routerKind?: string; routePath?: string; routeType?: string; renderSource?: string }

/**
 * Logs an unhandled server error (render, route handler, server action, proxy) as ONE structured record.
 * Deliberately NOT logged: request headers (cookies, authorization), query string (auth callback tokens), body, stack.
 * Path and message pass through redact() inside logger, so ids stay and tokens/emails/QR payloads do not.
 */
export function logRequestError(err: unknown, request: RequestErrorInfo, context: RequestErrorContext): void {
  try {
    const digest = typeof (err as { digest?: unknown } | null)?.digest === 'string' ? (err as { digest: string }).digest : undefined;
    logger.error('request.unhandled_error', {
      method: String(request.method).slice(0, 10),
      path: String(request.path).split('?')[0],
      routePath: context.routePath,
      routeType: context.routeType,
      routerKind: context.routerKind,
      renderSource: context.renderSource,
      digest,
      error: err,
    });
  } catch { /* logging never changes the outcome */ }
}
