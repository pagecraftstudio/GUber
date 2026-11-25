'use server';

import { redirect } from 'next/navigation';
import type { AdminActionState } from '@/features/admin/action-state';
import { ROLE_SETS } from '@/features/platform/permissions';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import { actingService } from './service';
import { actingMessage } from './text';

const text = (fd: FormData, k: string): string => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '');
const failure = (e: unknown): AdminActionState => {
  const c = toClientError(e);
  const reason = c.fields?.reason;
  return { status: 'error', message: actingMessage(reason ?? c.detail, c.message) };
};

/** "Open dashboard" on a company page: starts a read-only session, then goes to that company's dashboard. The company id is a target, never authority: Postgres checks the role. */
export async function enterActingAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(ROLE_SETS.actingStaff);
  try {
    await actingService.enter(ctx, { companyId: text(fd, 'companyId'), reason: text(fd, 'reason') });
  } catch (e) {
    return failure(e);
  }
  redirect('/dashboard');
}

/** Banner button: switch THIS session to write (super_admin only; support is refused by the database). */
export async function confirmActingWriteAction(): Promise<void> {
  const ctx = await getPlatformServiceContext(ROLE_SETS.actingStaff);
  try {
    await actingService.confirmWrite(ctx);
  } catch {
    redirect('/dashboard?error=forbidden'); // support, an ended session or an inactive company: the dashboard says "not allowed"
  }
  redirect('/dashboard');
}

/** Banner button: end the session and go back to the company page (its id comes from the session the database reported, not from the form). */
export async function exitActingAction(): Promise<void> {
  const ctx = await getPlatformServiceContext(ROLE_SETS.actingStaff);
  const back = ctx.auth.membership?.companyId;
  try {
    await actingService.exit(ctx);
  } catch {
    // an expired or already-ended session is fine: leaving is what was asked
  }
  redirect(back ? `/admin/companies/${back}` : '/admin');
}
