// P7c follow-up: platform moderation of ratings. NOT RUN when written: run `npx vitest run src/features/ratings src/app/admin` before approving.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { adminRatingsService } from './admin-service';
import { RATINGS_PAGE, ratingsListSchema, setHiddenSchema, type PlatformRatingRow } from './admin-types';

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
const row = (i: number): PlatformRatingRow => ({
  rating_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, company_id: U, company_name: 'Delta', driver_id: V, driver_name: 'Hassan', trip_id: V,
  origin_name: 'Cairo', destination_name: 'Alexandria', departure_at: '2026-11-24T06:00:00+00:00', trip_stars: 4, driver_stars: 5, created_at: `2026-11-24T10:${String(59 - i).padStart(2, '0')}:00.123456+00:00`, hidden_at: null,
});
const fakeDb = (data: unknown, error: { code?: string; message: string } | null = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { db: { rpc } as never, rpc };
};
const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('query parsing', () => {
  it('defaults to all, no filters', () => {
    expect(ratingsListSchema.parse({})).toEqual({ show: 'all' });
  });
  it('accepts a company, a visibility and a microsecond keyset cursor', () => {
    const q = ratingsListSchema.parse({ company: U, show: 'hidden', before: '2026-11-24T10:59:00.123456+00:00', beforeId: V });
    expect(q.show).toBe('hidden');
  });
  it('rejects a cursor with only half of it, a bad uuid and an unknown visibility', () => {
    expect(ratingsListSchema.safeParse({ before: '2026-11-24T10:59:00+00:00' }).success).toBe(false);
    expect(ratingsListSchema.safeParse({ beforeId: V }).success).toBe(false);
    expect(ratingsListSchema.safeParse({ company: 'nope' }).success).toBe(false);
    expect(ratingsListSchema.safeParse({ show: 'everything' }).success).toBe(false);
  });
  it('the hide form: boolean from "true"/"false" only, ids must be uuids', () => {
    expect(setHiddenSchema.parse({ ratingId: U, hidden: 'true' })).toMatchObject({ hidden: true, show: 'all' });
    expect(setHiddenSchema.parse({ ratingId: U, hidden: 'false' }).hidden).toBe(false);
    expect(setHiddenSchema.safeParse({ ratingId: U, hidden: 'yes' }).success).toBe(false);
    expect(setHiddenSchema.safeParse({ ratingId: 'x', hidden: 'true' }).success).toBe(false);
  });
});

describe('adminRatingsService', () => {
  it('asks for one row more than a page and builds the cursor from the last row SHOWN', async () => {
    const rows = Array.from({ length: RATINGS_PAGE + 1 }, (_, i) => row(i));
    const { db, rpc } = fakeDb(rows);
    const page = await adminRatingsService.list({ db }, { show: 'all' });
    expect(rpc).toHaveBeenCalledWith('platform_list_ratings', { p_company_id: null, p_visibility: 'all', p_before: null, p_before_id: null, p_limit: RATINGS_PAGE + 1 });
    expect(page.rows).toHaveLength(RATINGS_PAGE);
    expect(page.next).toEqual({ before: rows[RATINGS_PAGE - 1]!.created_at, beforeId: rows[RATINGS_PAGE - 1]!.rating_id });
  });
  it('a short page has no cursor', async () => {
    const { db } = fakeDb([row(1), row(2)]);
    const page = await adminRatingsService.list({ db }, { show: 'visible', company: U });
    expect(page.next).toBeNull();
    expect(page.rows.map((r) => r.ratingId)).toEqual([row(1).rating_id, row(2).rating_id]);
  });
  it('passes the filters and cursor through, and maps rows without any rater field', async () => {
    const { db, rpc } = fakeDb([row(1)]);
    const page = await adminRatingsService.list({ db }, { show: 'hidden', company: U, before: '2026-11-24T10:59:00+00:00', beforeId: V });
    expect(rpc).toHaveBeenCalledWith('platform_list_ratings', expect.objectContaining({ p_company_id: U, p_visibility: 'hidden', p_before: '2026-11-24T10:59:00+00:00', p_before_id: V }));
    expect(Object.keys(page.rows[0]!).join(',')).not.toMatch(/rater|user|booking|customer/i);
  });
  it('a database refusal throws (the page shows an error state), it is not turned into an empty list', async () => {
    const { db } = fakeDb(null, { code: '42501', message: 'not allowed' });
    await expect(adminRatingsService.list({ db }, { show: 'all' })).rejects.toBeTruthy();
  });
  it('setHidden sends only the rating id and the flag', async () => {
    const { db, rpc } = fakeDb(null);
    await adminRatingsService.setHidden({ db }, U, true);
    expect(rpc).toHaveBeenCalledWith('set_trip_rating_hidden', { p_rating_id: U, p_hidden: true });
  });
  it('setHidden refuses a malformed id before any call', async () => {
    const { db, rpc } = fakeDb(null);
    await expect(adminRatingsService.setHidden({ db }, 'not-an-id', true)).rejects.toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('structure (the database is the real lock; these keep the first lock from being removed)', () => {
  it('the page and the action both demand super_admin', () => {
    expect(read('app/admin/ratings/page.tsx')).toMatch(/getPlatformServiceContext\(ROLE_SETS\.superAdminOnly\)/);
    expect(read('features/ratings/admin-actions.ts')).toMatch(/getPlatformServiceContext\(ROLE_SETS\.superAdminOnly\)/);
  });
  it('the nav shows Ratings to super_admin only', () => {
    expect(read('features/platform/nav.ts')).toMatch(/href: '\/admin\/ratings'[^\n]*roles: ROLE_SETS\.superAdminOnly/);
  });
  it('nothing in the moderation code names a rater column', () => {
    for (const f of ['features/ratings/admin-types.ts', 'features/ratings/admin-service.ts', 'features/ratings/admin-actions.ts', 'components/admin/masar/RatingsModerationView.tsx']) {
      expect(read(f), f).not.toMatch(/rater_user_id|rater_id|customer_id|booking_id/);
    }
  });
});
