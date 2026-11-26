import type { SupabaseClient } from '@supabase/supabase-js';
import { mapDbError } from '@/lib/db/map-error';
import { AppError } from '@/lib/errors';
import { reviewRawSchema, toReviewPage, type ReviewPage, type ReviewQuery } from './types';

type Db = { readonly db: SupabaseClient };

/** Super admin only. Both calls run as the signed-in user; Postgres decides the role and refuses self-review (0067), so nothing here is authority. */
export const securityReviewService = {
  async list({ db }: Db, q: ReviewQuery): Promise<ReviewPage> {
    const { data, error } = await db.rpc('platform_security_review', { p_days: q.days, p_only_unreviewed: q.show === 'open' });
    if (error) throw mapDbError(error);
    const p = reviewRawSchema.safeParse(data);
    if (!p.success) throw new AppError('internal', { cause: p.error });
    return toReviewPage(p.data, q.show);
  },
  async markReviewed({ db }: Db, id: string, note: string | undefined): Promise<void> {
    const { error } = await db.rpc('platform_review_audit_entry', { p_audit_id: id, p_note: note ?? null });
    if (error) throw mapDbError(error);
  },
};
