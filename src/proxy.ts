import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { loginPathFor } from '@/lib/auth/redirect';
import { readTenantConfig } from '@/lib/tenant/config';
import { normalizeHost } from '@/lib/tenant/host';
import { decideTenantRoute } from '@/lib/tenant/route';
import { resolveCustomHost } from '@/lib/tenant/resolve-custom';

/**
 * Coarse gate + session refresh. NOT the security boundary: real authorization happens in server guards
 * (lib/auth/guards.ts) and, above all, in Postgres RLS. This only keeps signed-out visitors off app pages
 * and keeps the auth cookie fresh.
 */
/** '/' (marketplace), '/login', '/register', '/company/login' and the trip search are deliberately NOT here: public. */
const SESSION_REQUIRED = ['/dashboard', '/driver', '/admin', '/my-bookings', '/reset-password', '/suspended', '/no-access'];

/**
 * Anonymous, cacheable public data. It must NOT pass through updateSession(): that can attach Set-Cookie to the response,
 * and a response carrying a cookie must never be stored by a shared cache or shared between visitors.
 */
const PUBLIC_DATA_PREFIX = '/api/public/';

/**
 * Tenant-routing headers are set by nothing in this application, so any that arrive are forged. Drop them before anything
 * downstream can read them (the tenant is carried by the URL, /s/<slug>, never by a header).
 */
function stripForgedTenantHeaders(headers: Headers): void {
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('x-tenant-')) headers.delete(name);
}

const plain = (status: number, body: string) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * Subdomain mode only (path mode never reaches this): decide by HOST. Tenant hosts skip updateSession on purpose: they are
 * anonymous public sites, there is no staff/customer cookie on those hosts, and a response without Set-Cookie stays shareable
 * by a CDN. Returns null when the request belongs to the platform app and normal handling continues.
 */
async function handleTenantHost(request: NextRequest): Promise<NextResponse | null> {
  const cfg = readTenantConfig(process.env);
  if (cfg.mode !== 'subdomain') return null;
  const { pathname, search } = request.nextUrl;
  const input = { host: normalizeHost(request.headers.get('host')), pathname, search };

  let decision = decideTenantRoute(input, cfg);
  if (decision.action === 'resolve-custom') {
    const env = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' };
    const r = await resolveCustomHost(decision.hostname, env);
    if (!r.ok) return plain(503, 'Service temporarily unavailable');       // fail closed, nothing about any tenant
    if (r.slug === null) return plain(404, 'Not found');
    decision = decideTenantRoute(input, cfg, r.slug);
  }

  switch (decision.action) {
    case 'pass': return null;
    case 'not-found': return plain(404, 'Not found');
    case 'redirect': return NextResponse.redirect(decision.location, 308);
    case 'rewrite': {
      const url = request.nextUrl.clone();
      url.pathname = decision.pathname;
      return NextResponse.rewrite(url);
    }
    default: return plain(404, 'Not found');
  }
}

export async function proxy(request: NextRequest) {
  stripForgedTenantHeaders(request.headers);
  const tenantResponse = await handleTenantHost(request);
  if (tenantResponse) return tenantResponse;
  if (request.nextUrl.pathname.startsWith(PUBLIC_DATA_PREFIX)) return NextResponse.next();
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const needsSession = SESSION_REQUIRED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!user && needsSession) {
    const url = request.nextUrl.clone();
    url.pathname = loginPathFor(pathname);
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = {
  // Three root-level files of the driver app (P7b D) are static and anonymous: no session refresh, no Set-Cookie on a service worker or manifest.
  // They sit OUTSIDE /driver on purpose, because everything under /driver requires a session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|driver-sw\\.js$|driver\\.webmanifest$|driver-offline\\.html$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
