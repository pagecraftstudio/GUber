import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEnv } from '@/lib/env';
import { logOperationFailure, logger } from '@/lib/log';
import { failureReportSchema, MAX_REPORT_BYTES } from '@/lib/log/report-schema';

/**
 * Receives failure reports for the operations that run BROWSER -> SUPABASE (customer booking / cancel / QR, driver
 * boarding). Those calls never pass through this server, so without a report the server log would be blind to them.
 *
 * Trust model: the report is UNVERIFIED client input. It is logged with source=client_report and is never used for any
 * decision. What keeps it safe:
 *   - same-origin only (Origin must equal NEXT_PUBLIC_SITE_URL) and a signed-in Supabase session (validated with getUser());
 *   - body capped at 1 KiB and validated by a strict schema of enums/numbers/UUIDs (no free text, no tokens, no names);
 *   - the user id comes from the verified session, never from the body;
 *   - answers 204 with no body, reveals nothing.
 * Volume control is a Vercel Firewall rate-limit rule on /api/telemetry/* (docs/RATE-LIMITING.md); this route is cheap by design.
 */
export const dynamic = 'force-dynamic';

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
const reject = (status: number) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const site = new URL(getEnv().NEXT_PUBLIC_SITE_URL).origin;
  const origin = request.headers.get('origin');
  if (origin !== site) return reject(403);
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reject(415);

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_REPORT_BYTES) return reject(413);
  const raw = await request.text();
  if (raw.length > MAX_REPORT_BYTES) return reject(413);

  let json: unknown;
  try { json = JSON.parse(raw); } catch { return reject(400); }
  const parsed = failureReportSchema.safeParse(json);
  if (!parsed.success) return reject(422);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return reject(401);

  try {
    logOperationFailure({ ...parsed.data, userId: data.user.id, requestId: request.headers.get('x-vercel-id') ?? undefined, source: 'client_report' });
  } catch {
    logger.error('telemetry.log_failed');
  }
  return noContent();
}

// Anything but POST is not part of this endpoint.
export const GET = () => reject(405);
