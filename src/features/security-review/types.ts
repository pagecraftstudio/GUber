import { z } from 'zod';

/** The three entries a reviewer must look at (same list as 0067). */
export const REVIEW_ACTIONS = ['acting.started', 'acting.write_enabled', 'platform.login_new_device'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  'acting.started': 'Opened a company dashboard (read-only)',
  'acting.write_enabled': 'Switched a company dashboard to editing',
  'platform.login_new_device': 'Signed in from a new device',
};

export const reviewQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('7').transform(Number),
  show: z.enum(['open', 'all']).default('open'),
});
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;

const rawItem = z.object({
  id: z.string().uuid(), created_at: z.string(), action: z.string(),
  actor_id: z.string().uuid().nullable(), actor_name: z.string().nullable(), actor_email: z.string().nullable(),
  company_id: z.string().uuid().nullable(), company_name: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  reviewed_at: z.string().nullable(), reviewed_by_name: z.string().nullable(), review_note: z.string().nullable(), can_review: z.boolean(),
});
export const reviewRawSchema = z.object({ days: z.number(), unreviewed: z.number(), items: z.array(rawItem) });

export interface ReviewItem {
  id: string; createdAt: string; action: string; actorName: string; actorEmail: string; companyName: string | null;
  reason: string | null; device: string | null; reviewedAt: string | null; reviewedBy: string | null; note: string | null; canReview: boolean;
}
export interface ReviewPage { days: number; unreviewed: number; items: ReviewItem[] }

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
export function toReviewPage(raw: z.infer<typeof reviewRawSchema>, show: 'open' | 'all'): ReviewPage {
  const items = raw.items
    .filter((r) => show === 'all' || r.reviewed_at === null)
    .map((r): ReviewItem => ({
      id: r.id, createdAt: r.created_at, action: r.action, actorName: r.actor_name ?? 'Unknown', actorEmail: r.actor_email ?? '',
      companyName: r.company_name, reason: str(r.metadata.reason), device: str(r.metadata.device),
      reviewedAt: r.reviewed_at, reviewedBy: r.reviewed_by_name, note: r.review_note, canReview: r.can_review,
    }));
  return { days: raw.days, unreviewed: raw.unreviewed, items };
}

export const markReviewedSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
  days: z.enum(['7', '30', '90']).default('7'),
  show: z.enum(['open', 'all']).default('open'),
});
