'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROLE_SETS } from '@/features/platform/permissions';
import { getPlatformServiceContext } from '@/lib/service/server';
import { adminRatingsService } from './admin-service';
import { setHiddenSchema } from './admin-types';

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

/**
 * Hide or restore ONE rating (form post from /admin/ratings). Super admin only: the guard runs first (404 / redirect for anyone else), then the database checks the role again.
 * Nothing about the rater is in the form, and the company id in the form is only the page's filter, used to come back to the same list.
 */
export async function setRatingHiddenAction(formData: FormData): Promise<void> {
  const ctx = await getPlatformServiceContext(ROLE_SETS.superAdminOnly);
  const parsed = setHiddenSchema.safeParse({
    ratingId: formData.get('ratingId'), hidden: formData.get('hidden'),
    ...(typeof formData.get('company') === 'string' && formData.get('company') !== '' ? { company: formData.get('company') } : {}),
    show: formData.get('show') || 'all',
  });
  const back = new URLSearchParams();
  let notice: 'hidden' | 'restored' | 'error' = 'error';
  if (parsed.success) {
    if (parsed.data.company) back.set('company', parsed.data.company);
    back.set('show', parsed.data.show);
    try {
      await adminRatingsService.setHidden(ctx, parsed.data.ratingId, parsed.data.hidden);
      notice = parsed.data.hidden ? 'hidden' : 'restored';
    } catch (e) {
      if (isNextSignal(e)) throw e;
      notice = 'error';
    }
  }
  back.set('notice', notice);
  revalidatePath('/admin/ratings');
  redirect(`/admin/ratings?${back.toString()}`);
}
