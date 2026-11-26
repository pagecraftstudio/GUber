import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server'; // cookie-session client: reads the user id and calls the token-gated ingest RPCs (no service role)
import { signIngest } from '@/lib/analytics/token';
import { AID_COOKIE, ANALYTICS_NOTICE_VERSION, CONSENT_COOKIE, clientIp, dailyIpHash, deviceClass, edgeCountry, referrerHost } from '@/lib/analytics/ctx';

export const runtime = 'nodejs';

const scalar = z.union([z.string().max(200), z.number(), z.boolean()]);
const common = { path: z.string().max(300).startsWith('/'), locale: z.enum(['ar', 'en']).optional(), referrer: z.string().max(500).optional() };
const body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('events'), ...common, events: z.array(z.object({ event: z.string().max(64), properties: z.record(z.string(), scalar).optional() })).min(1).max(20) }),
  z.object({
    kind: z.literal('search'), ...common,
    origin: z.string().max(80).optional(), destination: z.string().max(80).optional(),
    travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    filters: z.record(z.string(), scalar).optional(), resultsCount: z.number().int().min(0).max(10000),
  }),
  z.object({ kind: z.literal('consent'), granted: z.boolean() }),
]);

const COOKIE_BASE = { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 180 } as const;
const newId = () => randomBytes(24).toString('base64url');
const quiet = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  // Same-origin only (the route is public; this blocks cross-site posting from other pages).
  const origin = req.headers.get('origin');
  if (!origin || new URL(origin).host !== req.nextUrl.host) return new NextResponse(null, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const b = parsed.data;

  const h = req.headers;
  const device = deviceClass(h.get('user-agent'));
  if (device === 'bot') return quiet();

  const jar = await cookies();
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  const secret = process.env.ANALYTICS_INGEST_SECRET;
  if (!secret || secret.length < 32) { console.error('analytics.ingest_secret_missing'); return quiet(); } // analytics must never break the page

  if (b.kind === 'consent') {
    // A denial is recorded under a throw-away id that is NOT stored in a cookie: no identifier is kept for a person who said no.
    const aid = b.granted ? (jar.get(AID_COOKIE)?.value ?? newId()) : newId();
    const tok = signIngest(secret, b.granted ? 'consent:true' : 'consent:false', { session: aid, userId });
    const { error } = await supabase.rpc('ingest_consent', { p_session: aid, p_user: userId, p_granted: b.granted, p_version: ANALYTICS_NOTICE_VERSION, p_exp: tok.exp, p_sig: tok.sig });
    if (error) return new NextResponse(null, { status: error.code === 'AN429' || /rate/i.test(error.message) ? 429 : 400 });
    const res = quiet();
    res.cookies.set(CONSENT_COOKIE, `${ANALYTICS_NOTICE_VERSION}:${b.granted ? 'granted' : 'denied'}`, COOKIE_BASE);
    if (b.granted) res.cookies.set(AID_COOKIE, aid, COOKIE_BASE);
    else res.cookies.delete(AID_COOKIE);
    return res;
  }

  const aid = jar.get(AID_COOKIE)?.value;
  if (!aid) return quiet(); // no consent, no event

  const ctx = {
    path: b.path,
    locale: b.locale ?? null,
    referrer_host: referrerHost(b.referrer),
    device_class: device,
    country: edgeCountry(h),
    ip_hash: dailyIpHash(clientIp(h), process.env.ANALYTICS_HASH_SECRET),
  };
  if (!process.env.ANALYTICS_HASH_SECRET) console.error('analytics.hash_secret_missing');

  // company_id is null in 10a-1; the tenant resolver is wired in 10b (never taken from the request body).
  const tok = signIngest(secret, b.kind === 'events' ? 'events' : 'search', { session: aid, userId, companyId: null });
  const gate = { p_exp: tok.exp, p_sig: tok.sig };
  const { error } =
    b.kind === 'events'
      ? await supabase.rpc('ingest_events', { p_session: aid, p_user: userId, p_company: null, p_events: b.events, p_ctx: ctx, ...gate })
      : await supabase.rpc('ingest_search', {
          p_session: aid, p_user: userId, p_company: null, p_ctx: ctx, ...gate,
          p_search: { origin: b.origin ?? null, destination: b.destination ?? null, travel_date: b.travelDate ?? null, filters: b.filters ?? {}, results_count: b.resultsCount },
        });
  if (error) return new NextResponse(null, { status: /rate/i.test(error.message) ? 429 : 400 });
  return quiet();
}
