import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/log';

/**
 * Receives CSP violation reports (Report-Only stage). Anonymous by nature (browsers send these without credentials),
 * so: tiny body cap, only whitelisted string fields are kept (directive + blocked origin + document path), no query strings,
 * no sample text, 204 always. Volume is limited by the Vercel Firewall rule on /api/csp-report (docs/RATE-LIMITING.md).
 */
export const dynamic = 'force-dynamic';
const MAX = 4096;
const strip = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try { const u = new URL(v); return `${u.origin}${u.pathname}`.slice(0, 200); } catch { return v.replace(/[?#].*$/, '').slice(0, 60); }
};

export async function POST(request: NextRequest) {
  const done = new NextResponse(null, { status: 204 });
  try {
    if (Number(request.headers.get('content-length') ?? '0') > MAX) return done;
    const raw = await request.text();
    if (raw.length > MAX) return done;
    const body = JSON.parse(raw) as Record<string, any>;
    const r = (body['csp-report'] ?? body) as Record<string, unknown>;
    logger.warn('csp.violation', {
      directive: typeof r['effective-directive'] === 'string' ? r['effective-directive'].slice(0, 40) : typeof r['violated-directive'] === 'string' ? r['violated-directive'].slice(0, 40) : undefined,
      blocked: strip(r['blocked-uri']),
      document: strip(r['document-uri']),
      disposition: r.disposition === 'enforce' ? 'enforce' : 'report',
    });
  } catch { /* malformed reports are ignored */ }
  return done;
}
