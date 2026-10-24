import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { audienceFrom, confirmFailurePath, confirmLandingPath } from '@/lib/auth/redirect';
import { MARKETPLACE_PATH } from '@/lib/auth/paths';
import { getAuthContext } from '@/lib/auth/context';
import { homePathFor } from '@/lib/auth/permissions';
import { getEnv } from '@/lib/env';

/**
 * Email links (signup confirmation, password recovery) land here with ?token_hash=...&type=...&next=...&from=...
 * We exchange the one-time hash for a session, then redirect to a validated internal path.
 * Email templates must point here (see PHASE-3-REPORT.md).
 *
 * Landing is context-aware (see lib/auth/redirect.ts): an allow-listed ?next= wins, a recovery link lands on the
 * password form, anything else lands on the home that matches the SERVER-resolved role of the new session.
 * A missing/invalid ?next= never defaults to the operator dashboard.
 */
const ALLOWED_TYPES: readonly EmailOtpType[] = ['email', 'recovery'];

export async function GET(request: NextRequest) {
  const origin = getEnv().NEXT_PUBLIC_SITE_URL;
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const rawNext = searchParams.get('next');
  const audience = audienceFrom(searchParams.get('from'));

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
