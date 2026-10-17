import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/redirect';
import { getEnv } from '@/lib/env';

/**
 * Email links (signup confirmation, password recovery) land here with ?token_hash=...&type=...&next=...
 * We exchange the one-time hash for a session, then redirect to a validated internal path.
 * Email templates must point here (see PHASE-3-REPORT.md).
 */
const ALLOWED_TYPES: readonly EmailOtpType[] = ['email', 'recovery'];

export async function GET(request: NextRequest) {
  const origin = getEnv().NEXT_PUBLIC_SITE_URL;
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'), '/dashboard');

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL('/login?error=confirm_failed', origin));
}
