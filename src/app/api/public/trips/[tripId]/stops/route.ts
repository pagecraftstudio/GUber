import type { NextRequest } from 'next/server';
import { invalidRequest, publicRpc, STOPS_CACHE } from '@/lib/public-search/handler';
import { publicStopRowSchema, tripIdSchema } from '@/lib/public-search/schema';

/** GET /api/public/trips/:tripId/stops - pickup/drop-off stops of one publicly bookable trip. Takes no query parameters. */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await ctx.params;
  if ([...request.nextUrl.searchParams.keys()].length > 0 || !tripIdSchema.safeParse(tripId).success) return invalidRequest();
  return publicRpc('public_search.stops', 'public_trip_stops', { p_trip_id: tripId }, publicStopRowSchema, STOPS_CACHE);
}
