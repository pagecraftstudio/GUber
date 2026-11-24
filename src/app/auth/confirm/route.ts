import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { audienceFrom, confirmFailurePath, confirmLandingPath } from '@/lib/auth/redirect';
import { CUSTOMER_LOGIN_PATH, MARKETPLACE_PATH } from '@/lib/auth/paths';
import { getAuthContext } from '@/lib/auth/context';
import { accessState, homePathFor } from '@/lib/auth/permissions';
import { getEnv } from '@/lib/env';

/**
 * Email links (signup confirmation, password recovery) land here with ?token_hash=...&type=...&next=...&from=...
 * We exchange the one-time hash for a session, then redirect to a validated internal path.
 * Email templates must point here (see PHASE-3-REPORT.md).
 *
 * Landing is context-aware (see lib/auth/redirect.ts): an allow-listed ?next= wins, a recovery link lands on the
 * password form, anything else lands on the home that matches the SERVER-resolved role of the new session.
 * A missing/invalid ?next= never defaults to the operator dashboard.
 *
 * P6b: Google sign-in returns here with ?code=... (PKCE). Google is CUSTOMER-ONLY: staff, drivers and platform admins
 * sign in with a password, because those accounts carry tenant authority. The gate is here, on the server, against the
 * role resolved from the database after the code exchange; hiding the button is not the control.
 */
const ALLOWED_TYPES: readonly EmailOtpType[] = ['email', 'recovery'];

/**
 * Supabase links an OAuth identity to an existing user that has the same verified email BEFORE this route runs. If that
 * user turns out not to be a plain customer, undo it: remove the Google identity (only when another identity remains,
 * so the account is never left without a way in) and end this browser's session.
 */
async function rejectNonCustomer(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getUserIdentities();
    const identities = data?.identities ?? [];
    const google = identities.find((i) => i.provider === 'google');
    if (google && identities.length > 1) await supabase.auth.unlinkIdentity(google);
  } catch {
    // Best effort. The session is still ended below, so nothing is granted either way.
  }
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // supabase-js drops the local session even when the revoke call fails.
  }
}

async function finishGoogleSignIn(code: string, rawNext: string | null, origin: string): Promise<NextResponse> {
  const fail = (reason: 'google_failed' | 'google_not_allowed') => NextResponse.redirect(new URL(`${CUSTOMER_LOGIN_PATH}?error=${reason}`, origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail('google_failed');

  const ctx = await getAuthContext();
  if (!ctx || accessState(ctx) !== 'customer') {
    await rejectNonCustomer(supabase);
    return fail('google_not_allowed');
  }
  return NextResponse.redirect(new URL(confirmLandingPath(rawNext, null, homePathFor(ctx)), origin));
}

export async function GET(request: NextRequest) {
  const origin = getEnv().NEXT_PUBLIC_SITE_URL;
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const rawNext = searchParams.get('next');
  const audience = audienceFrom(searchParams.get('from'));

  // ---- Google (OAuth, PKCE) ----
  const code = searchParams.get('code');
  if (code && !tokenHash) {
    // Only the customer sign-in starts a Google flow. Anything else is refused before the code is exchanged.
    if (audience !== 'customer') return NextResponse.redirect(new URL(`${CUSTOMER_LOGIN_PATH}?error=google_not_allowed`, origin));
    return finishGoogleSignIn(code, rawNext, origin);
  }
  // The user cancelled on Google's screen, or Google refused: no code, an `error` parameter instead.
  if (!tokenHash && searchParams.get('error')) {
    return NextResponse.redirect(new URL(`${CUSTOMER_LOGIN_PATH}?error=google_failed`, origin));
  }

  // ---- Email links ----
  if (tokenHash && type && (ALLOWED_TYPES as readonly string[]).includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) {
      const ctx = await getAuthContext();
      const home = ctx ? homePathFor(ctx) : MARKETPLACE_PATH;
      return NextResponse.redirect(new URL(confirmLandingPath(rawNext, type, home), origin));
    }
  }
  return NextResponse.redirect(new URL(confirmFailurePath(rawNext, type, audience), origin));
}
