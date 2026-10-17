/**
 * Open-redirect defence for `?next=` parameters. Only same-origin, app-internal paths under an allow-list
 * of prefixes are accepted. Everything else falls back to a safe default.
 */
const ALLOWED_PREFIXES = ['/dashboard', '/admin', '/invite/', '/reset-password'] as const;

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
