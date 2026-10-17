import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Coarse gate + session refresh. NOT the security boundary: real authorization happens in server guards
 * (lib/auth/guards.ts) and, above all, in Postgres RLS. This only keeps signed-out visitors off app pages
 * and keeps the auth cookie fresh.
 */
const SESSION_REQUIRED = ['/dashboard', '/driver', '/admin', '/reset-password', '/suspended', '/no-access'];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const needsSession = SESSION_REQUIRED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!user && needsSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
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
