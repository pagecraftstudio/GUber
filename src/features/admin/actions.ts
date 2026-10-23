'use server';

import { ROLE_SETS } from '@/features/platform/permissions';
import { revalidatePath } from 'next/cache';
import { companyService } from '@/features/companies/service';
import { subscriptionService } from '@/features/subscriptions/service';
import { buildInviteUrl } from '@/features/users/invite-link';
import { toClientError } from '@/lib/errors';
import { getPlatformServiceContext } from '@/lib/service/server';
import type { AdminActionState } from './action-state';

/**
 * Server Actions for superadmin company management. Rules every action follows:
 *  1. The platform guard runs FIRST and OUTSIDE try/catch (it redirects or 404s by throwing).
 *  2. The role set is passed to the guard, but the service and Postgres authorise again (assert_platform).
 *  3. The company id in the form is a TARGET, never authority: it is validated as a uuid and the RPC authorises.
 *  4. Errors go through toClientError(): safe message + field codes, never SQL, never the raw cause.
 *  5. Nothing here logs. Invite tokens exist only in the returned state of the request that created them.
 * Next.js checks Origin against Host on every Server Action POST (CSRF defence).
 */

const SUPER_ADMIN = ROLE_SETS.superAdminOnly;
const NOTE_WRITERS = ROLE_SETS.noteWriters;
const SUB_WRITERS = ROLE_SETS.subscriptionWriters;

function field(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

function failure(e: unknown, alias: Record<string, string> = {}): AdminActionState {
  const c = toClientError(e);
  const fields = c.fields ? Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [alias[k] ?? k, v])) : undefined;
  return { status: 'error', message: c.message, ...(fields ? { fields } : {}) };
}

function refresh(companyId?: string): void {
  revalidatePath('/admin');
  revalidatePath('/admin/companies');
  revalidatePath('/admin/subscriptions');
  if (companyId) revalidatePath(`/admin/companies/${companyId}`);
}

export async function createCompanyAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUPER_ADMIN);
  try {
    const created = await companyService.createCompany(ctx, {
      name: field(fd, 'name'),
      slug: field(fd, 'slug'),
      contactName: field(fd, 'contactName'),
      contactEmail: field(fd, 'contactEmail'),
      contactPhone: field(fd, 'contactPhone'),
      legalName: field(fd, 'legalName'),
      country: field(fd, 'country'),
      planCode: field(fd, 'planCode'),
      trialDays: field(fd, 'trialDays'),
      ownerEmail: field(fd, 'ownerEmail'),
    });
    refresh();
    return {
      status: 'ok',
      message: 'Company created.',
      companyId: created.companyId,
      inviteUrl: buildInviteUrl(created.token),
      inviteExpiresAt: created.expiresAt,
    };
  } catch (e) {
    return failure(e, { email: 'ownerEmail' }); // the invite RPC reports its email problems under "email"
  }
}

export async function updateCompanyAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUPER_ADMIN);
  const companyId = field(fd, 'companyId');
  try {
    const { changed } = await companyService.updateCompany(ctx, companyId, {
      name: field(fd, 'name'),
      legalName: field(fd, 'legalName'),
      taxNumber: field(fd, 'taxNumber'),
      contactName: field(fd, 'contactName'),
      contactEmail: field(fd, 'contactEmail'),
      contactPhone: field(fd, 'contactPhone'),
      country: field(fd, 'country'),
    });
    refresh(companyId);
    return { status: 'ok', message: changed ? 'Changes saved.' : 'No changes to save.', companyId };
  } catch (e) {
    return failure(e);
  }
}

export async function setCompanyStatusAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUPER_ADMIN);
  const companyId = field(fd, 'companyId');
  try {
    await companyService.setCompanyStatus(ctx, companyId, { status: field(fd, 'status'), reason: field(fd, 'reason') });
    refresh(companyId);
    return { status: 'ok', companyId };
  } catch (e) {
    return failure(e);
  }
}

export async function addCompanyNoteAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(NOTE_WRITERS);
  const companyId = field(fd, 'companyId');
  try {
    await companyService.addCompanyNote(ctx, companyId, { body: field(fd, 'body') });
    refresh(companyId);
    return { status: 'ok', message: 'Note added.', companyId };
  } catch (e) {
    return failure(e);
  }
}

export async function inviteOwnerAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUPER_ADMIN);
  const companyId = field(fd, 'companyId');
  try {
    const invite = await companyService.inviteOwner(ctx, companyId, { email: field(fd, 'email') });
    refresh(companyId);
    return { status: 'ok', message: 'Invite created.', companyId, inviteUrl: buildInviteUrl(invite.token), inviteExpiresAt: invite.expiresAt };
  } catch (e) {
    return failure(e);
  }
}

export async function revokeInviteAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUPER_ADMIN);
  const companyId = field(fd, 'companyId');
  try {
    await companyService.revokeInvite(ctx, field(fd, 'inviteId'));
    refresh(companyId);
    return { status: 'ok', message: 'Invite revoked.', companyId };
  } catch (e) {
    return failure(e);
  }
}

// ---------------------------------------------------------------- Phase 7.4: subscriptions (super_admin + billing)

export async function assignSubscriptionAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUB_WRITERS);
  const companyId = field(fd, 'companyId');
  try {
    await subscriptionService.assign(ctx, companyId, {
      planCode: field(fd, 'planCode'),
      billingInterval: field(fd, 'billingInterval'),
      status: field(fd, 'status'),
      periodDays: field(fd, 'periodDays'),
    });
    refresh(companyId);
    return { status: 'ok', message: 'Subscription assigned.', companyId };
  } catch (e) {
    return failure(e);
  }
}

export async function setSubscriptionStatusAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUB_WRITERS);
  const companyId = field(fd, 'companyId');
  try {
    await subscriptionService.setStatus(ctx, field(fd, 'subscriptionId'), { status: field(fd, 'status'), reason: field(fd, 'reason') });
    refresh(companyId);
    return { status: 'ok', companyId };
  } catch (e) {
    return failure(e);
  }
}

export async function setSubscriptionPeriodAction(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUB_WRITERS);
  const companyId = field(fd, 'companyId');
  try {
    await subscriptionService.setPeriod(ctx, field(fd, 'subscriptionId'), { days: field(fd, 'days'), from: field(fd, 'from') });
    refresh(companyId);
    return { status: 'ok', companyId };
  } catch (e) {
    return failure(e, { days: 'days' });
  }
}

export async function expireStaleSubscriptionsAction(_prev: AdminActionState, _fd: FormData): Promise<AdminActionState> {
  const ctx = await getPlatformServiceContext(SUB_WRITERS);
  try {
    const { expired } = await subscriptionService.expireStale(ctx);
    refresh();
    return { status: 'ok', message: expired === 0 ? 'Nothing to expire.' : `${expired} subscription(s) marked expired.` };
  } catch (e) {
    return failure(e);
  }
}
