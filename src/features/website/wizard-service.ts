import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { websiteService } from './service';
import { pagesService } from './pages-service';
import { previewService } from './preview-service';
import { publishService } from './publish-service';
import { computeWizardState, type WizardState } from './wizard-state';

const starterSchema = z.object({ created_home: z.boolean(), seeded_sections: z.number().int(), created_settings: z.boolean() });
export type StarterResult = { createdHome: boolean; seededSections: number; createdSettings: boolean };

export type WizardDeps = {
  /** ensure_starter_site (0049): idempotent, creates only what is missing, never public. */
  ensureStarter(ctx: TenantServiceContext): Promise<unknown>;
  settings: Pick<typeof websiteService, 'getSettings'>;
  pages: Pick<typeof pagesService, 'listPages' | 'getPageWithSections'>;
  preview: Pick<typeof previewService, 'getDraft'>;
  publish: Pick<typeof publishService, 'getState'>;
};

export const wizardDeps: WizardDeps = {
  async ensureStarter(ctx) {
    const res = await ctx.db.rpc('ensure_starter_site');
    if (res.error) throw mapDbError(res.error);
    return res.data;
  },
  settings: websiteService, pages: pagesService, preview: previewService, publish: publishService,
};

/**
 * Setup wizard backend. open(): create the starter if the draft is empty (website.write), then report where the owner is.
 * state(): read-only version for people who may look but not edit (website.read). Both use the existing services, so every
 * permission, RLS rule and validator that already guards the draft guards the wizard too.
 */
export function makeWizardService(d: WizardDeps) {
  async function state(ctx: TenantServiceContext): Promise<WizardState> {
    requirePermission(ctx, PERMISSIONS.websiteRead);
    const [settings, pages, draft, pub] = await Promise.all([
      d.settings.getSettings(ctx), d.pages.listPages(ctx), d.preview.getDraft(ctx), d.publish.getState(ctx),
    ]);
    const home = pages.find((p) => p.isHome) ?? null;
    const homeSections = home ? (await d.pages.getPageWithSections(ctx, home.id)).sections : [];
    return computeWizardState({ settings, home, homeSections, draft, isPublished: pub.isPublished });
  }
  return {
    state,
    async open(ctx: TenantServiceContext): Promise<{ starter: StarterResult; state: WizardState }> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const parsed = starterSchema.safeParse(await d.ensureStarter(ctx));
      if (!parsed.success) throw new AppError('internal', { cause: new Error('ensure_starter_site returned an unexpected shape') });
      const s = parsed.data;
      return { starter: { createdHome: s.created_home, seededSections: s.seeded_sections, createdSettings: s.created_settings }, state: await state(ctx) };
    },
  };
}
export type WizardService = ReturnType<typeof makeWizardService>;
export const wizardService = makeWizardService(wizardDeps);
