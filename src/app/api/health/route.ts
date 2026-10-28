import { NextResponse } from 'next/server';

/**
 * Liveness probe for uptime monitors. Answers only "this deployment serves requests".
 * It does NOT touch Supabase and returns no configuration, so it is safe to expose and cheap to poll.
 * Database health is checked separately (docs/OPERATIONS.md section 2).
 */
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return NextResponse.json({ status: 'ok', ...(sha ? { release: sha.slice(0, 7) } : {}) }, { headers });
}
export function HEAD() { return new NextResponse(null, { status: 200, headers }); }
