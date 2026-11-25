import { RatingsModerationView } from '@/components/admin/masar/RatingsModerationView';
import { adminRatingsService } from '@/features/ratings/admin-service';
import { ratingsListSchema, type RatingsPage } from '@/features/ratings/admin-types';
import { ROLE_SETS } from '@/features/platform/permissions';
import type { RawSearchParams } from '@/features/auth/search-params';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Ratings · Admin' };
export const dynamic = 'force-dynamic';

const NOTICES = ['hidden', 'restored', 'error'] as const;

/** Rating moderation. Super admin only (the nav hides it from other roles; this guard and the RPC both refuse them). Shows stars, driver and trip, never the rater. */
export default async function AdminRatingsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const raw = Object.fromEntries(Object.entries(firstParams(await searchParams)).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = ratingsListSchema.safeParse(raw);
  const query = parsed.success ? parsed.data : ratingsListSchema.parse({});
  const notice = NOTICES.find((n) => n === raw.notice) ?? null;

  let page: { data: RatingsPage } | { error: string };
  try {
    page = { data: await adminRatingsService.list(ctx, query) };
  } catch (e) {
    page = { error: toClientError(e).message };
  }
  return <RatingsModerationView query={query} page={page} notice={notice} ignored={!parsed.success} />;
}
