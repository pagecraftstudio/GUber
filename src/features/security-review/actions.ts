'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROLE_SETS } from '@/features/platform/permissions';
import { getPlatformServiceContext } from '@/lib/service/server';
import { securityReviewService } from './service';
import { markReviewedSchema } from './types';

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');
const val = (fd: FormData, k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : undefined);

/** "Mark reviewed" on one entry. Super admin only; the database also refuses reviewing your own entry. */
export async function markReviewedAction(formData: FormData): Promise<void> {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const parsed = markReviewedSchema.safeParse({ id: val(formData, 'id'), note: val(formData, 'note'), days: val(formData, 'days') || undefined, show: val(formData, 'show') || undefined });
  const back = new URLSearchParams();
  let notice: 'reviewed' | 'error' = 'error';
  if (parsed.success) {
    back.set('days', parsed.data.days);
    back.set('show', parsed.data.show);
    try {
      await securityReviewService.markReviewed(ctx, parsed.data.id, parsed.data.note);
      notice = 'reviewed';
    } catch (e) {
      if (isNextSignal(e)) throw e;
    }
  }
  back.set('notice', notice);
  revalidatePath('/admin/security-review');
  redirect(`/admin/security-review?${back.toString()}`);
}
