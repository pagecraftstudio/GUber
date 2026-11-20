import { mapDbError } from '@/lib/db/map-error';
import { expectList } from '@/lib/db/query';
import type { TenantServiceContext } from '@/lib/service/context';
import { PUBLICATION_SELECT, toPublicationVersion, VERSION_HISTORY_LIMIT, type PublicationRow, type PublicationVersion } from './publish-types';

export type RpcOutcome = { data: unknown; error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null };

/** The three publish RPCs take no company: 0046 derives it from the caller's membership and website.publish permission. */
export type PublishRepository = {
  isPublished(ctx: TenantServiceContext): Promise<boolean>;
  listVersions(ctx: TenantServiceContext): Promise<PublicationVersion[]>;
  publish(ctx: TenantServiceContext, note: string | null): Promise<RpcOutcome>;
  rollback(ctx: TenantServiceContext, version: number): Promise<RpcOutcome>;
  unpublish(ctx: TenantServiceContext): Promise<RpcOutcome>;
};

export const publishRepository: PublishRepository = {
  async isPublished(ctx) {
    const res = await ctx.db.from('website_settings').select('is_published').eq('company_id', ctx.companyId).maybeSingle();
    if (res.error) throw mapDbError(res.error);
    return res.data?.is_published === true;
  },
  async listVersions(ctx) {
    return expectList<PublicationRow, PublicationVersion>(
      await ctx.db.from('website_publications').select(PUBLICATION_SELECT).eq('company_id', ctx.companyId).order('version', { ascending: false }).limit(VERSION_HISTORY_LIMIT),
      toPublicationVersion,
    );
  },
  async publish(ctx, note) { return (await ctx.db.rpc('publish_website', { p_note: note })) as RpcOutcome; },
  async rollback(ctx, version) { return (await ctx.db.rpc('rollback_website', { p_version: version })) as RpcOutcome; },
  async unpublish(ctx) { return (await ctx.db.rpc('unpublish_website')) as RpcOutcome; },
};
