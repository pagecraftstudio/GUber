import { redact } from './redact';

/**
 * Structured server logging: one JSON object per line on stdout/stderr (what Vercel Logs and every log drain expect).
 * Everything passes through redact() before it is written; callers cannot opt out.
 * Contract for callers: pass identifiers and classifications (op, outcome, sqlstate, ids), never request bodies.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogRecord = { level: LogLevel; event: string } & Record<string, unknown>;
export type LogSink = (line: string, level: LogLevel) => void;

const defaultSink: LogSink = (line, level) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

let sink: LogSink = defaultSink;
/** Test seam (and the single place to attach a log drain later). */
export function setLogSink(next: LogSink | null): void { sink = next ?? defaultSink; }

function runtimeTags(): Record<string, unknown> {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    ...(process.env.VERCEL_ENV ? { env: process.env.VERCEL_ENV } : {}),
    ...(sha ? { release: sha.slice(0, 7) } : {}),
  };
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  try {
    const record = { ts: new Date().toISOString(), level, event: String(event).slice(0, 80), ...runtimeTags(), ...(redact(fields) as object) };
    sink(JSON.stringify(record), level);
  } catch {
    // Logging must never break a request. Last resort: a fixed, data-free line.
    try { sink(JSON.stringify({ ts: new Date().toISOString(), level: 'error', event: 'log.failed' }), 'error'); } catch { /* nothing left to do */ }
  }
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => log('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => log('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => log('error', event, fields),
};

// ------------------------------------------------------------------------------------------------ operation failures
/** The four abuse-prone / business-critical operations whose failures must be diagnosable. */
export const OPERATIONS = ['booking.create', 'booking.cancel', 'ticket.qr', 'ticket.board'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const OUTCOMES = [
  'rate_limited', 'unauthenticated', 'forbidden', 'not_found', 'validation', 'conflict', 'business_rule', 'plan_limit', 'network', 'internal', 'unknown',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Postgres/PostgREST code -> coarse outcome. Shared by the browser reporter and the server so both classify identically. */
export function outcomeFromPgCode(code: string | undefined | null): Outcome {
  switch (code) {
    case 'PT429': return 'rate_limited';
    case '28000': case 'PGRST301': case 'PGRST302': return 'unauthenticated';
    case '42501': return 'forbidden';
    case 'P0002': case 'PGRST116': return 'not_found';
    case '23505': case '23P01': return 'conflict';
    case '23514': return 'business_rule';
    case '53400': return 'plan_limit';
    case '22023': case '22P02': case '23502': case '22001': return 'validation';
    case undefined: case null: case '': return 'unknown';
    default: return 'internal';
  }
}

export interface OperationFailure {
  op: Operation;
  outcome: Outcome;
  /** 5-character SQLSTATE or PostgREST code. NOT the message (messages can echo user input). */
  pgCode?: string | undefined;
  httpStatus?: number | undefined;
  /** Non-personal identifiers that make a failure reproducible. */
  tripId?: string | undefined;
  bookingId?: string | undefined;
  seats?: number | undefined;
  userId?: string | undefined;
  companyId?: string | undefined;
  /** Stable machine sub-code from AppError.detail (for example 'trip_full'). Constant strings only. */
  detail?: string | undefined;
  requestId?: string | undefined;
  /** 'server' = observed by this server; 'client_report' = reported by a browser (unverified, never used for decisions). */
  source: 'server' | 'client_report';
}

export function logOperationFailure(f: OperationFailure): void {
  const level: LogLevel = f.outcome === 'internal' || f.outcome === 'network' ? 'error' : 'warn';
  log(level, `operation.failed`, { ...f });
}
