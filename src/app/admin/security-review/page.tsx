import { SecurityReviewView } from '@/components/admin/masar/SecurityReviewView';
import type { RawSearchParams } from '@/features/auth/search-params';
import { ROLE_SETS } from '@/features/platform/permissions';
import { securityReviewService } from '@/features/security-review/service';
import { reviewQuerySchema, type ReviewPage } from '@/features/security-review/types';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { firstParams } from '@/lib/validation/common';

export const metadata = { title: 'Security review · Admin' };
export const dynamic = 'force-dynamic';

/** Acting-as and new-device entries waiting for a second pair of eyes. Super admin only (nav hides it, this guard and the RPC both refuse everyone else). */
export default async function SecurityReviewPage({ searchParams }: { searchParams: RawSearchParams }) {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const raw = Object.fromEntries(Object.entries(firstParams(await searchParams)).filter(([, v]) => v !== undefined && v !== ''));
  const parsed = reviewQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : reviewQuerySchema.parse({});
  const notice = raw.notice === 'reviewed' || raw.notice === 'error' ? raw.notice : null;
  let page: { data: ReviewPage } | { error: string };
  try {
    page = { data: await securityReviewService.list(ctx, query) };
  } catch (e) {
    page = { error: toClientError(e).message };
  }
  return <SecurityReviewView query={query} page={page} notice={notice} />;
}
