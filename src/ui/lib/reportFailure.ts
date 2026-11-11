import { outcomeFromPgCode, type Operation, type Outcome } from '@/lib/log';

/**
 * Browser side of failure reporting. Fire-and-forget: it must NEVER throw, delay, or change what the user sees.
 * Sends only enums / numbers / UUIDs (see lib/log/report-schema.ts). No-ops outside a browser (SSR, unit tests, mock mode).
 * A tiny client-side budget stops a broken page from hammering the endpoint.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
let sent: number[] = [];

export interface FailureContext { tripId?: string; bookingId?: string; seats?: number }

export function reportOperationFailure(op: Operation, err: { pgCode?: string | undefined; httpStatus?: number | undefined; network?: boolean }, ctx: FailureContext = {}): void {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    if (process.env.NEXT_PUBLIC_UI_DATA_MODE === 'mock') return;
    const now = Date.now();
    sent = sent.filter((t) => now - t < WINDOW_MS);
    if (sent.length >= MAX_PER_WINDOW) return;
    sent.push(now);

    const outcome: Outcome = err.network ? 'network' : outcomeFromPgCode(err.pgCode);
    const body = {
      op, outcome,
      ...(err.pgCode && /^[A-Za-z0-9]{3,8}$/.test(err.pgCode) ? { pgCode: err.pgCode } : {}),
      ...(typeof err.httpStatus === 'number' ? { httpStatus: err.httpStatus } : {}),
      ...(ctx.tripId ? { tripId: ctx.tripId } : {}),
      ...(ctx.bookingId ? { bookingId: ctx.bookingId } : {}),
      ...(typeof ctx.seats === 'number' ? { seats: ctx.seats } : {}),
    };
    void fetch('/api/telemetry/failure', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    /* reporting is best effort */
  }
}
