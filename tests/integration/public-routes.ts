import { NextRequest } from 'next/server';
import { URL_, jwtFor } from './harness';

/**
 * Runs the REAL /api/public/* route handlers in Node against the local PostgREST. The handler's Supabase client talks to
 * http://postgrest.local/rest/v1, which this file rewrites to the PostgREST under test (same trick as harness.clientFor).
 * The publishable key is an anon-role JWT, i.e. exactly the privilege of an anonymous browser; no service role exists.
 */
let ready = false;
function prepare(): void {
  if (ready) return;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.local';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwtFor(null);
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.test';
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return real(u.replace('http://postgrest.local/rest/v1', URL_), init);
  }) as typeof fetch;
  ready = true;
}

export async function publicFetch(url: string, init?: RequestInit): Promise<Response> {
  prepare();
  const u = new URL(url, 'https://app.example.test');
  const req = new NextRequest(u, { method: init?.method ?? 'GET' });
  if (u.pathname === '/api/public/trips') return (await import('@/app/api/public/trips/route')).GET(req);
  const m = /^\/api\/public\/trips\/([^/]+)\/stops$/.exec(u.pathname);
  if (m) return (await import('@/app/api/public/trips/[tripId]/stops/route')).GET(req, { params: Promise.resolve({ tripId: decodeURIComponent(m[1]!) }) });
  return new Response('not found', { status: 404 });
}
