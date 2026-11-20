import { AppError, parseInput } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { issueFromDbMessage } from './preview-service';
import { publishRepository, type PublishRepository, type RpcOutcome } from './publish-repository';
import { publishInputSchema, rollbackInputSchema } from './publish-schema';
import type { PublishState } from './publish-types';

/**
 * Publish / rollback / unpublish. The database does the real work atomically (0046: company-row lock, live subscription, checklist,
 * snapshot, one current publication, audit). This layer: authorize (website.publish, a different permission from website.write, so a
 * website editor can save drafts but not go live), validate, call, and translate the database's refusals into AppError.
 */
function unwrap(res: RpcOutcome): number | null {
  const e = res.error;
  if (!e) return typeof res.data === 'number' ? res.data : null;
  const text = `${e.message ?? ''}`;
  if (e.code === '23514') throw new AppError('business_rule', { detail: `publish_${issueFromDbMessage(text)}`, cause: e });
  if (e.code === '22023') throw new AppError('business_rule', { detail: 'publish_invalid_content', cause: e });
  if (e.code === '42501' && /no active subscription/i.test(text)) throw new AppError('subscription_required', { cause: e });
  if (e.code === 'P0002') throw new AppError('not_found', { cause: e });
  throw mapDbError(e); // 42501 -> forbidden, PT429 -> rate_limited, anything unknown -> internal
}

export function makePublishService(repo: PublishRepository) {
  return {
    async getState(ctx: TenantServiceContext): Promise<PublishState> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      const [isPublished, versions] = await Promise.all([repo.isPublished(ctx), repo.listVersions(ctx)]);
      return { isPublished, versions };
    },
    async publish(ctx: TenantServiceContext, input: unknown): Promise<number> {
      requirePermission(ctx, PERMISSIONS.websitePublish);
      const { note } = parseInput(publishInputSchema, input);
      const v = unwrap(await repo.publish(ctx, note ? note : null));
      if (v === null) throw new AppError('internal', { cause: new Error('publish_website returned no version') });
      return v;
    },
    async rollback(ctx: TenantServiceContext, input: unknown): Promise<number> {
      requirePermission(ctx, PERMISSIONS.websitePublish);
      const { version } = parseInput(rollbackInputSchema, input);
      const v = unwrap(await repo.rollback(ctx, version));
      if (v === null) throw new AppError('internal', { cause: new Error('rollback_website returned no version') });
      return v;
    },
    async unpublish(ctx: TenantServiceContext): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websitePublish);
      unwrap(await repo.unpublish(ctx));
    },
  };
}
export type PublishService = ReturnType<typeof makePublishService>;
export const publishService = makePublishService(publishRepository);
