import { z } from 'zod';

/**
 * One error type for the whole backend. Services and repositories throw AppError; nothing else crosses the
 * service boundary. `code` is the coarse class (maps to HTTP status), `detail` is a stable machine sub-code
 * the UI can translate (for example `bus_conflict`). Messages are safe to show: they never contain SQL,
 * constraint names, ids supplied by the caller, or other tenants' data. The raw cause stays server-side.
 */
export const APP_ERROR_CODES = [
  'unauthenticated',
  'forbidden',
  'not_found',
  'validation',
  'conflict',
  'plan_limit',
  'subscription_required',
  'business_rule',
  'internal',
] as const;
export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export type FieldErrors = Record<string, string>;

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  unauthenticated: 'You must sign in to continue.',
  forbidden: 'You do not have permission to do this.',
  not_found: 'The requested item was not found.',
  validation: 'Some of the information is not valid.',
  conflict: 'This conflicts with existing data.',
  plan_limit: 'Your plan limit has been reached.',
  subscription_required: 'The company does not have an active subscription.',
  business_rule: 'This action is not allowed.',
  internal: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly detail: string | undefined;
  readonly fields: FieldErrors | undefined;

  constructor(code: AppErrorCode, opts: { message?: string; detail?: string; fields?: FieldErrors; cause?: unknown } = {}) {
    super(opts.message ?? DEFAULT_MESSAGES[code], opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.detail = opts.detail;
    this.fields = opts.fields;
  }
}

/** Zod failure -> AppError('validation') with one message per field path. Never echoes input values. */
export function fromZod(error: z.ZodError): AppError {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return new AppError('validation', { fields, cause: error });
}

/** Parse at the service boundary. Throws AppError instead of ZodError so callers handle one type. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}

export type ClientError = { code: AppErrorCode; detail?: string; message: string; fields?: FieldErrors };

/** What may be sent to a browser. Unknown errors collapse to a generic `internal`. */
export function toClientError(error: unknown): ClientError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.detail ? { detail: error.detail } : {}),
      ...(error.fields ? { fields: error.fields } : {}),
    };
  }
  return { code: 'internal', message: DEFAULT_MESSAGES.internal };
}

export function httpStatusFor(code: AppErrorCode): number {
  switch (code) {
    case 'unauthenticated':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'validation':
      return 422;
    case 'conflict':
    case 'business_rule':
      return 409;
    case 'plan_limit':
    case 'subscription_required':
      return 402;
    case 'internal':
      return 500;
  }
}
