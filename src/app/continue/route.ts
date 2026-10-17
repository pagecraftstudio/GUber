import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { CUSTOMER_LOGIN_PATH } from '@/lib/auth/paths';
import { safeNextPath } from '@/lib/auth/redirect';

/**
 * Post-login dispatcher. Sends a signed-in user to the area their SERVER-RESOLVED identity belongs to:
 * platform admin -> /admin, staff -> /dashboard, driver -> /driver, customer -> /my-bookings.
 * Role comes from my_context() (auth.uid() -> memberships), never from the URL or user_metadata.
 * `next` is honoured only through the open-redirect allow-list, and the destination's own guard still decides.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.redirect(new URL(CUSTOMER_LOGIN_PATH, request.nextUrl));
  const target = safeNextPath(request.nextUrl.searchParams.get('next'), homePathFor(ctx));
  return NextResponse.redirect(new URL(target, request.nextUrl));
}
