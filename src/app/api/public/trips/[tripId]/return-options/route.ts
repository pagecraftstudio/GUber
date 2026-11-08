import type { NextRequest } from 'next/server';
import { invalidRequest, publicRpc, TRIPS_CACHE } from '@/lib/public-search/handler';
import { publicReturnOptionRowSchema, tripIdSchema } from '@/lib/public-search/schema';

/**
 * GET /api/public/trips/:tripId/return-options - the bookable return times of one public go-and-return trip.
 * Takes no query parameters. Seat counts change with every booking, so it uses the short trips cache policy.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  if ([...request.nextUrl.searchParams.keys()].length > 0 || !tripIdSchema.safeParse(tripId).success) return invalidRequest();
  return publicRpc('public_search.return_options', 'public_trip_return_options', { p_trip_id: tripId }, publicReturnOptionRowSchema, TRIPS_CACHE);
}
