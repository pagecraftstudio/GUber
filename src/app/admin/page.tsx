
import { PlatformOverviewMasar } from '@/components/admin/masar/PlatformMasarViews';


import { platformOverviewService } from '@/features/platform/service';
import type { PlatformOverview } from '@/features/platform/schema';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';

export const metadata = { title: 'Admin overview' };
export const dynamic = 'force-dynamic'; // live platform numbers, never cached

async function load(): Promise<{ data: PlatformOverview } | { error: string }> {
  const ctx = await getPlatformServiceContext(); // guard: 404 / login redirect happens here, outside the try
  try {
    return { data: await platformOverviewService.getOverview(ctx) };
  } catch (e) {
    return { error: toClientError(e).message }; // safe message only; raw cause stays server-side
  }
}


export default async function AdminOverviewPage() {
  const res = await load();
  return <PlatformOverviewMasar res={res} />; // presentation only: same load, same guard
}
