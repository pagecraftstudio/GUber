import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';
import { assertEnv } from './src/lib/env-check';
import { buildSecurityHeaders } from './src/lib/security-headers';

/**
 * Configuration is a function of the phase so that configuration errors surface where they are cheapest to fix:
 *   `next build`  -> fails the BUILD with a clear, value-free message (also what Vercel runs)
 *   `next start`  -> refuses to boot a misconfigured server
 *   `next dev`    -> warns only (mock mode in development needs no Supabase variables)
 * The checks live in src/lib/env-check.ts (pure, unit-tested). Mock data in a production build is rejected there too.
 */
export default function config(phase: string): NextConfig {
  const mode = phase === PHASE_PRODUCTION_BUILD ? 'build' : phase === PHASE_PRODUCTION_SERVER ? 'server' : phase === PHASE_DEVELOPMENT_SERVER ? 'dev' : 'build';
  assertEnv(process.env, mode, (m) => console.warn(m));

  const headers = buildSecurityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, production: phase !== PHASE_DEVELOPMENT_SERVER });
  return {
    poweredByHeader: false,
    async headers() {
      return [{ source: '/:path*', headers }];
    },
  };
}
