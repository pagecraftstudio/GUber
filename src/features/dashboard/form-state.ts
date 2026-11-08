import { toClientError, type FieldErrors } from '@/lib/errors';
import type { PlanUsage } from '@/features/subscriptions/usage';
import type { GenerateResult } from '@/features/trip-templates/types';

/** What a dashboard server action hands back to its form (instead of throwing into an error page). Serialisable. */
export type FormState =
  | { status: 'idle' }
  | { status: 'success'; message: 'saved' | 'created' | 'advanced' | 'cancelled' | 'deleted' | 'generated'; nonce: number; invite?: { url: string; expiresAt: string }; generated?: GenerateResult }
  | { status: 'error'; code: string; detail?: string; fields?: FieldErrors; usage?: PlanUsage | null; nonce: number };

export const IDLE: FormState = { status: 'idle' };

/** Redirect signals from next/navigation must keep flowing: callers rethrow them before calling this. */
/** `usage`: a FRESH reading taken after the failure (null = could not be read), so the form never keeps showing stale numbers. */
export function errorState(e: unknown, usage?: PlanUsage | null): FormState {
  const c = toClientError(e);
  return { status: 'error', code: c.code, ...(c.detail ? { detail: c.detail } : {}), ...(c.fields ? { fields: c.fields } : {}), ...(usage !== undefined ? { usage } : {}), nonce: Date.now() };
}
export const successState = (message: Extract<FormState, { status: 'success' }>['message'], invite?: { url: string; expiresAt: string }, generated?: GenerateResult): FormState => ({ status: 'success', message, nonce: Date.now(), ...(invite ? { invite } : {}), ...(generated ? { generated } : {}) });
