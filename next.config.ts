import type { NextConfig } from 'next';

// Baseline hardening headers. A strict Content-Security-Policy is deliberately left to Phase 18
// (it must be designed together with Supabase Storage image hosts and tenant custom domains).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

// Fail the BUILD (not just the browser) if mock data was requested for a production build.
// NODE_ENV is 'production' for `next build` and `next start`; `next dev` is 'development'.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UI_DATA_MODE === 'mock') {
  throw new Error('NEXT_PUBLIC_UI_DATA_MODE=mock is not allowed in a production build. Unset it.');
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
