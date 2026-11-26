import { NextResponse, type NextRequest } from 'next/server';
import { analyticsService } from '@/features/analytics/service';
import { toCsv } from '@/features/analytics/csv';
import { exportQuerySchema } from '@/features/analytics/types';
import { ROLE_SETS } from '@/features/platform/permissions';
import { getPlatformServiceContext } from '@/lib/service/server';

export const dynamic = 'force-dynamic';

/** CSV of aggregates. Super admin only. Cells that look like spreadsheet formulas are neutralised (csv.ts). */
export async function GET(req: NextRequest) {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const q = exportQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return new NextResponse('Bad request', { status: 400 });
  try {
    const body =
      q.data.kind === 'gaps'
        ? toCsv(['origin', 'destination', 'searches', 'zero_searches', 'zero_rate'], (await analyticsService.gapsForExport(ctx, q.data.days)).map((r) => [r.origin, r.destination, r.searches, r.zeroSearches, r.zeroRate]))
        : toCsv(['surface', 'event', 'events', 'visitor_days'], (await analyticsService.usageForExport(ctx, q.data.days)).map((r) => [r.surface, r.event, r.events, r.visitorDays]));
    return new NextResponse(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="masar-${q.data.kind}-${q.data.days}d.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('Could not export', { status: 500 });
  }
}
