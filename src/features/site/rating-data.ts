import 'server-only';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { ratingsService } from '@/features/ratings/service';
import type { SiteRating } from './SiteRatingBadge';

/**
 * The company's public rating for its own site, through the anonymous RPC company_public_ratings (0061): the database decides whether the company is live and whether it has
 * enough ratings to show an average. company_id is the one resolve_tenant_by_slug returned, never taken from a URL or from content.
 * A failed read means NO badge, never an error page: the rating is decoration on a page whose job is to sell trips (same rule as the marketplace card).
 */
export const getSiteRating = cache(async (companyId: string): Promise<SiteRating | null> => {
  try {
    const env = getEnv();
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const rows = await ratingsService.companies({ db }, [companyId]);
    const row = rows.find((r) => r.companyId === companyId);          // defence in depth: never show another company's rating
    if (!row || (row.average !== null && !Number.isFinite(row.average))) return null;
    return { ratings: row.ratings, average: row.average };
  } catch {
    return null;
  }
});
