/**
 * Security headers, built from configuration (pure, unit-tested).
 *
 * CSP is rolled out in STAGES because a script-src that is both safe and compatible with Next.js needs per-request nonces:
 *   Stage 1 (this change)  ENFORCED  Content-Security-Policy with the directives that do not depend on script handling:
 *                          frame-ancestors, base-uri, object-src, form-action (+ upgrade-insecure-requests in production).
 *                          These stop clickjacking, <base> hijacking, plugin content and form exfiltration with zero risk of
 *                          breaking Next.js or Supabase.
 *   Stage 1 (this change)  REPORT-ONLY full policy (default/script/style/img/font/connect...) with report-uri /api/csp-report.
 *                          Violations appear in the structured logs; nothing is blocked. script-src still allows 'unsafe-inline'
 *                          (Next's bootstrap scripts) so it is NOT yet an XSS defence - it exists to discover real sources.
 *   Stage 2 (later)       nonce-based script-src generated in src/proxy.ts, promoted from Report-Only to enforced once the
 *                          report stream is clean for a full release cycle. See docs/SECURITY-HEADERS.md.
 */
export interface HeaderConfig { supabaseUrl?: string | undefined; production: boolean }
export type Header = { key: string; value: string };

function origin(u: string | undefined): string | null {
  try { return u ? new URL(u).origin : null; } catch { return null; }
}

export function buildEnforcedCsp(production: boolean): string {
  const d = ["base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'"];
  if (production) d.push('upgrade-insecure-requests');
  return d.join('; ');
}

export function buildReportOnlyCsp(cfg: HeaderConfig): string {
  const supa = origin(cfg.supabaseUrl);
  const ws = supa ? supa.replace(/^http/, 'ws') : null;
  const connect = ["'self'", ...(supa ? [supa] : []), ...(ws ? [ws] : [])];
  const img = ["'self'", 'data:', 'blob:', ...(supa ? [supa] : [])];
  const script = ["'self'", "'unsafe-inline'", ...(cfg.production ? [] : ["'unsafe-eval'"])];   // dev server needs eval for React refresh
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",   // marketplace layout loads Google Fonts CSS
    `img-src ${img.join(' ')}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connect.join(' ')}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
}

export function buildSecurityHeaders(cfg: HeaderConfig): Header[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // camera is needed by the driver QR scanner on the app's own origin
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    { key: 'Content-Security-Policy', value: buildEnforcedCsp(cfg.production) },
    { key: 'Content-Security-Policy-Report-Only', value: buildReportOnlyCsp(cfg) },
  ];
}
