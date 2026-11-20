import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import { AppError } from '@/lib/errors';
import type { TenantServiceContext } from '@/lib/service/context';
import { publicSiteSchema, SUPPORTED_SCHEMA_VERSIONS, type PublicSite } from '@/features/site/schema';

/**
 * Draft preview (migration 0047, preview_website_draft). The database builds the draft EXACTLY as publish would snapshot it, so a
 * preview that renders is a site that can be published, and a checklist failure is shown here before anyone clicks Publish.
 *
 * Outcome is a value, not an exception, for the expected "draft is not publishable yet" case. The reason is one of a FIXED set of
 * codes mapped from the database's own messages; the raw message is never passed on (it could one day contain content).
 */
export type PreviewIssue = 'settings_missing' | 'title_required' | 'home_page_required' | 'home_section_required' | 'too_large' | 'invalid_content';
export type PreviewResult = { ok: true; data: PublicSite } | { ok: false; issue: PreviewIssue };

const ISSUES: Array<[RegExp, PreviewIssue]> = [
  [/website settings are missing/i, 'settings_missing'],
  [/site title is required/i, 'title_required'],
  [/published home page is required/i, 'home_page_required'],
  [/home page needs at least one enabled section/i, 'home_section_required'],
  [/too large to publish/i, 'too_large'],
];

export type PreviewRpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type PreviewRepository = { fetch(ctx: TenantServiceContext): Promise<PreviewRpcResult> };

export const previewRepository: PreviewRepository = {
  async fetch(ctx) { return (await ctx.db.rpc('preview_website_draft')) as PreviewRpcResult; },
};

export function makePreviewService(repo: PreviewRepository) {
  return {
    async getDraft(ctx: TenantServiceContext): Promise<PreviewResult> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      const { data, error } = await repo.fetch(ctx);
      if (error) {
        if (error.code === '42501') throw new AppError('forbidden');
        if (error.code === '23514') return { ok: false, issue: ISSUES.find(([re]) => re.test(error.message ?? ''))?.[1] ?? 'invalid_content' };
        if (error.code === '22023') return { ok: false, issue: 'invalid_content' };
        throw new AppError('internal', { cause: new Error(`preview_website_draft failed (${error.code ?? 'unknown'})`) });
      }
      const parsed = publicSiteSchema.safeParse(data);
      if (!parsed.success || !SUPPORTED_SCHEMA_VERSIONS.includes(parsed.data.site.schema_version)) throw new AppError('internal', { cause: new Error('preview_website_draft returned an unexpected shape') });
      return { ok: true, data: parsed.data };
    },
  };
}
export const previewService = makePreviewService(previewRepository);
