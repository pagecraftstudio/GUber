import { describe, expect, it } from 'vitest';
import { buildEnforcedCsp, buildReportOnlyCsp, buildSecurityHeaders } from './security-headers';

const cfg = { supabaseUrl: 'https://abc.supabase.co', production: true };
const h = (list: ReturnType<typeof buildSecurityHeaders>, k: string) => list.find((x) => x.key === k)?.value;

describe('security headers', () => {
  it('ENFORCED CSP carries only script-independent directives', () => {
    const csp = buildEnforcedCsp(true);
    for (const d of ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'", 'upgrade-insecure-requests']) expect(csp).toContain(d);
    expect(csp).not.toMatch(/script-src|default-src|connect-src/);
    expect(buildEnforcedCsp(false)).not.toContain('upgrade-insecure-requests');
  });
  it('REPORT-ONLY policy allows exactly the Supabase origin (https + wss) and reports to our endpoint', () => {
    const csp = buildReportOnlyCsp(cfg);
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://abc.supabase.co");
    expect(csp).toContain('report-uri /api/csp-report');
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain("'unsafe-eval'");           // production
    expect(buildReportOnlyCsp({ ...cfg, production: false })).toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/\*|https:\s|http:\s/);        // no wildcard / blanket scheme sources
  });
  it('tolerates a missing or malformed Supabase URL', () => {
    expect(buildReportOnlyCsp({ production: true })).toContain("connect-src 'self'");
    expect(buildReportOnlyCsp({ supabaseUrl: '%%%', production: true })).not.toContain('undefined');
  });
  it('full header set', () => {
    const list = buildSecurityHeaders(cfg);
    expect(h(list, 'X-Frame-Options')).toBe('DENY');
    expect(h(list, 'X-Content-Type-Options')).toBe('nosniff');
    expect(h(list, 'Strict-Transport-Security')).toMatch(/max-age=63072000/);
    expect(h(list, 'Content-Security-Policy')).toBeTruthy();
    expect(h(list, 'Content-Security-Policy-Report-Only')).toBeTruthy();
  });
  it('the driver QR scanner keeps camera access on our own origin only (regression: camera=() blocked it)', () => {
    const pp = h(buildSecurityHeaders(cfg), 'Permissions-Policy')!;
    expect(pp).toContain('camera=(self)');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
  });
});
