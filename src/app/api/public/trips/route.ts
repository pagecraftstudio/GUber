import type { NextRequest } from 'next/server';
import { invalidRequest, publicRpc, TRIPS_CACHE } from '@/lib/public-search/handler';
import { publicTripRowSchema, queryObject, searchQuerySchema } from '@/lib/public-search/schema';

/**
 * GET /api/public/trips?origin=&destination=&date=YYYY-MM-DD&companyId=&limit=&offset=
 * Anonymous marketplace search. Same data an anonymous browser got from the public_search_trips RPC, now behind a
 * server route so Vercel Firewall rate limits and the CDN apply (docs/RATE-LIMITING.md section 3).
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const obj = queryObject(request.nextUrl.searchParams);
  const parsed = obj ? searchQuerySchema.safeParse(obj) : null;
  if (!parsed?.success) return invalidRequest();
  const q = parsed.data;
  return publicRpc('public_search.trips', 'public_search_trips', {
    p_origin: q.origin ?? null, p_destination: q.destination ?? null, p_date: q.date ?? null,
    p_company_id: q.companyId ?? null, p_limit: q.limit ?? 50, p_offset: q.offset ?? 0,
  }, publicTripRowSchema, TRIPS_CACHE);
}
