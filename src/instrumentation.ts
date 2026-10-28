import type { RequestErrorContext, RequestErrorInfo } from './lib/log/request-error';

/** Cold-start guard: a misconfigured server refuses to serve instead of failing on the first user request. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { assertEnv } = await import('./lib/env-check');
  assertEnv(process.env, 'server', (m) => console.warn(m));
}

/** Every unhandled server error becomes one redacted JSON log line (Vercel Logs / log drain / error monitor). */
export async function onRequestError(err: unknown, request: RequestErrorInfo, context: RequestErrorContext) {
  const { logRequestError } = await import('./lib/log/request-error');
  logRequestError(err, request, context);
}
