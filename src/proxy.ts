import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { loginPathFor } from '@/lib/auth/redirect';

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

export async function proxy(request: NextRequest) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
