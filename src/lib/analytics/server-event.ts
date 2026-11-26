import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signIngest } from './token';
import { AID_COOKIE, clientIp, dailyIpHash, deviceClass, edgeCountry } from './ctx';

/** A Google account whose first sign-in is the one that just happened (created and signed in within a minute) is a sign-up. */
export function isFreshAccount(createdAt: string | undefined, lastSignInAt: string | undefined, windowMs = 60_000): boolean {
  const a = Date.parse(createdAt ?? ''), b = Date.parse(lastSignInAt ?? '');
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) <= windowMs;
}

/**
 * Records one event from server code, for flows where the browser leaves the page (Google sign-in) so the client cannot send it.
 * Same rules as /api/track: no consent cookie = nothing sent; the token is signed here, the database re-checks consent; never throws.
 */
export async function recordServerEvent(supabase: SupabaseClient, userId: string, event: 'sign_in' | 'sign_up', properties: { method: string }, path: string): Promise<void> {
  try {
    const secret = process.env.ANALYTICS_INGEST_SECRET;
    if (!secret || secret.length < 32) return;
    const aid = (await cookies()).get(AID_COOKIE)?.value;
    if (!aid) return;
    const h = await headers();
    const device = deviceClass(h.get('user-agent'));
    if (device === 'bot') return;
    const tok = signIngest(secret, 'events', { session: aid, userId, companyId: null });
    await supabase.rpc('ingest_events', {
      p_session: aid, p_user: userId, p_company: null, p_events: [{ event, properties }],
      p_ctx: { path, locale: null, referrer_host: null, device_class: device, country: edgeCountry(h), ip_hash: dailyIpHash(clientIp(h), process.env.ANALYTICS_HASH_SECRET) },
      p_exp: tok.exp, p_sig: tok.sig,
    });
  } catch {
    // analytics must never break a sign-in
  }
}
