/**
 * Open-redirect defence for `?next=` parameters. Only same-origin, app-internal paths under an allow-list
 * of prefixes are accepted. Everything else falls back to a safe default.
 */
import { COMPANY_LOGIN_PATH, CUSTOMER_LOGIN_PATH, CUSTOMER_HOME_PATH } from './paths';

const ALLOWED_PREFIXES = ['/dashboard', '/admin', '/invite/', '/reset-password', '/my-bookings'] as const;

export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return fallback;
  // Must be a single-slash relative path. Rejects '//host', '/\host', 'https://..', 'javascript:' etc.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  const pathOnly = raw.split(/[?#]/)[0] ?? '';
  if (pathOnly.includes('..')) return fallback;
  const ok = ALLOWED_PREFIXES.some((p) => pathOnly === p || pathOnly.startsWith(p.endsWith('/') ? p : `${p}/`));
  return ok ? raw : fallback;
}

/**
 * Which sign-in page a signed-out visitor is sent to for a protected target.
 * Customer areas (and password reset, mostly customers) -> customer login. Everything else is operator-only.
 */
export function loginPathFor(target: string | null | undefined): string {
  const pathOnly = (typeof target === 'string' ? target : '').split(/[?#]/)[0] ?? '';
  const customer = ['/my-bookings', '/reset-password'].some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`));
  return customer ? CUSTOMER_LOGIN_PATH : COMPANY_LOGIN_PATH;
}

// ------------------------------------------------------------------------------------------------ audience + email-link landing
/** Which sign-in experience a flow belongs to. Anything unrecognised is 'operator' (the stricter, non-public side). */
export type AuthAudience = 'customer' | 'operator';

export function audienceFrom(raw: string | null | undefined): AuthAudience {
  return raw === 'customer' ? 'customer' : 'operator';
}

export function loginPathForAudience(audience: AuthAudience): string {
  return audience === 'customer' ? CUSTOMER_LOGIN_PATH : COMPANY_LOGIN_PATH;
}

/**
 * Where /auth/confirm sends a visitor after a link was verified (a session now exists).
 *   1. an allow-listed ?next= wins (open-redirect defence unchanged);
 *   2. a recovery link always lands on the password form;
 *   3. otherwise the role-appropriate home resolved from the SESSION (`sessionHome`), never a hard-coded operator page;
 *   4. last resort: the customer area (a plain account with no company membership is a customer).
 * '/dashboard' is therefore only reachable for a signed-in user whose server-resolved role is an operator.
 */
export function confirmLandingPath(rawNext: string | null | undefined, type: string | null | undefined, sessionHome: string | null | undefined): string {
  const next = safeNextPath(rawNext, '');
  if (next) return next;
  if (type === 'recovery') return '/reset-password';
  return sessionHome && sessionHome.length > 0 ? sessionHome : CUSTOMER_HOME_PATH;
}

/**
 * Where a FAILED/expired link goes. Never the operator login unless the original target was an operator page.
 *   recovery            -> the reset-request form (so the user can ask for a new link), audience preserved
 *   valid operator next -> operator login;  valid customer next -> customer login
 *   nothing usable      -> customer login (the public side)
 */
export function confirmFailurePath(rawNext: string | null | undefined, type: string | null | undefined, audience: AuthAudience): string {
  if (type === 'recovery') return `/forgot-password?error=confirm_failed&from=${audience}`;
  const next = safeNextPath(rawNext, '');
  return `${next ? loginPathFor(next) : CUSTOMER_LOGIN_PATH}?error=confirm_failed`;
}
