import { z } from 'zod';
import { AppError, parseInput } from '@/lib/errors';
import { mapDbError } from '@/lib/db/map-error';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { can } from '@/lib/auth/permissions';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { mediaService } from '@/features/media/media-service';
import { websiteService } from './service';
import { pagesService } from './pages-service';
import { previewService } from './preview-service';
import { publishService } from './publish-service';
import { computeWizardState, type WizardState } from './wizard-state';
import { canonicalSort, planContentWrite, readHomeContent, type HomeContent } from './wizard-content';
import type { WebsiteSettings } from './types';

const starterSchema = z.object({ created_home: z.boolean(), seeded_sections: z.number().int(), created_settings: z.boolean() });
export type StarterResult = { createdHome: boolean; seededSections: number; createdSettings: boolean };

const fail = (detail: string): never => { throw new AppError('validation', { detail }); };
const lz = (max: number) => z.strictObject({ en: z.string().max(max), ar: z.string().max(max) });
const filled = (v: string | null | undefined) => !!v && v.trim() !== '';

export const identityInputSchema = z.strictObject({ titleEn: z.string().max(120), titleAr: z.string().max(120), primaryColor: z.string().max(7), secondaryColor: z.string().max(7) });
export const contactInputSchema = z.strictObject({
  email: z.string().max(254), phone: z.string().max(40), whatsapp: z.string().max(40),
  addressEn: z.string().max(300), addressAr: z.string().max(300), footerEn: z.string().max(500), footerAr: z.string().max(500),
});
/** Canvas "site details" panel: the name is required; contact details are optional (publishing does not need them). */
export const detailsInputSchema = identityInputSchema.pick({ titleEn: true, titleAr: true }).extend(contactInputSchema.shape);
export const contentInputSchema = z.strictObject({
  hero: z.strictObject({ title: lz(120), subtitle: lz(300), ctaLabel: lz(40), ctaHref: z.string().max(2048) }),
  about: z.strictObject({ title: lz(120), body: lz(4000) }),
  faq: z.strictObject({ items: z.array(z.strictObject({ question: lz(200), answer: lz(1200) })).max(40) }),
  showRoutes: z.boolean(),
  showTrips: z.boolean(),
});
const logoInputSchema = z.strictObject({ filename: z.string().trim().max(255) });

export type WizardDeps = {
  /** ensure_starter_site (0049): idempotent, creates only what is missing, never public. */
  ensureStarter(ctx: TenantServiceContext): Promise<unknown>;
  settings: Pick<typeof websiteService, 'getSettings' | 'updateSettings'>;
  pages: Pick<typeof pagesService, 'listPages' | 'getPageWithSections' | 'addSection' | 'updateSection' | 'deleteSection' | 'reorderSections'>;
  preview: Pick<typeof previewService, 'getDraft'>;
  publish: Pick<typeof publishService, 'getState'>;
  media: Pick<typeof mediaService, 'uploadImage' | 'removeImage' | 'imagePath'>;
};

export const wizardDeps: WizardDeps = {
  async ensureStarter(ctx) {
    const res = await ctx.db.rpc('ensure_starter_site');
    if (res.error) throw mapDbError(res.error);
    return res.data;
  },
  settings: websiteService, pages: pagesService, preview: previewService, publish: publishService, media: mediaService,
};

export type WizardDraft = { settings: WebsiteSettings; content: HomeContent; logoPath: string | null };

/**
 * Setup wizard backend. Every method authorizes first (website.read / website.write; images also media.write), validates, then
 * composes the EXISTING services, so permissions, RLS, the strict section schemas and the 0046/0048 database guards apply unchanged.
 * The wizard adds no table and no new way to reach the database.
 */
export function makeWizardService(d: WizardDeps) {
  async function homeWithSections(ctx: TenantServiceContext) {
    const home = (await d.pages.listPages(ctx)).find((p) => p.isHome);
    if (!home) return null;
    return { home, sections: (await d.pages.getPageWithSections(ctx, home.id)).sections };
  }

  async function state(ctx: TenantServiceContext): Promise<WizardState> {
    requirePermission(ctx, PERMISSIONS.websiteRead);
    const [settings, draft, pub, h] = await Promise.all([d.settings.getSettings(ctx), d.preview.getDraft(ctx), d.publish.getState(ctx), homeWithSections(ctx)]);
    return computeWizardState({ settings, home: h?.home ?? null, homeSections: h?.sections ?? [], draft, isPublished: pub.isPublished });
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

    /** Everything the step forms show, in one read. */
    async read(ctx: TenantServiceContext): Promise<WizardDraft> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      const [settings, h] = await Promise.all([d.settings.getSettings(ctx), homeWithSections(ctx)]);
      const logoPath = settings.logoMediaId && can(ctx.auth, PERMISSIONS.mediaRead) ? await d.media.imagePath(ctx, settings.logoMediaId) : null;
      return { settings, content: readHomeContent(h?.sections ?? []), logoPath };
    },

    async saveIdentity(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const v = parseInput(identityInputSchema, input);
      if (!filled(v.titleEn) && !filled(v.titleAr)) fail('title_required');
      await d.settings.updateSettings(ctx, { siteTitle: { en: v.titleEn, ar: v.titleAr }, primaryColor: v.primaryColor, secondaryColor: v.secondaryColor });
    },

    async saveDetails(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const v = parseInput(detailsInputSchema, input);
      if (!filled(v.titleEn) && !filled(v.titleAr)) fail('title_required');
      await d.settings.updateSettings(ctx, {
        siteTitle: { en: v.titleEn, ar: v.titleAr },
        contactEmail: v.email.trim() || null, contactPhone: v.phone.trim() || null, contactWhatsapp: v.whatsapp.trim() || null,
        contactAddress: { en: v.addressEn, ar: v.addressAr }, footerText: { en: v.footerEn, ar: v.footerAr },
      });
    },

    async saveContact(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const v = parseInput(contactInputSchema, input);
      if (!filled(v.email) && !filled(v.phone) && !filled(v.whatsapp)) fail('contact_required');
      await d.settings.updateSettings(ctx, {
        contactEmail: v.email.trim() || null, contactPhone: v.phone.trim() || null, contactWhatsapp: v.whatsapp.trim() || null,
        contactAddress: { en: v.addressEn, ar: v.addressAr }, footerText: { en: v.footerEn, ar: v.footerAr },
      });
    },

    async saveContent(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const want = parseInput(contentInputSchema, input);
      if (!filled(want.hero.title.en) && !filled(want.hero.title.ar)) fail('hero_title_required');
      const h = await homeWithSections(ctx);
      if (!h) throw new AppError('business_rule', { detail: 'home_page_missing' });
      const ops = planContentWrite(h.sections, want);
      for (const o of ops.filter((x) => x.op === 'delete')) await d.pages.deleteSection(ctx, o.id);
      for (const o of ops.filter((x) => x.op === 'update')) await d.pages.updateSection(ctx, o.id, { content: o.content, isEnabled: o.isEnabled });
      let added = false;
      for (const o of ops.filter((x) => x.op === 'add')) { await d.pages.addSection(ctx, h.home.id, { type: o.type, content: o.content }); added = true; }
      if (added) {
        const now = (await d.pages.getPageWithSections(ctx, h.home.id)).sections;
        const want2 = canonicalSort(now).map((s) => s.id);
        if (want2.some((id, i) => id !== now[i]!.id)) await d.pages.reorderSections(ctx, h.home.id, { orderedIds: want2 });
      }
    },

    /** Upload, point the settings at the new image, then retire the old one. A failure half way leaves the previous logo in place. */
    async setLogo(ctx: TenantServiceContext, input: unknown, bytes: Uint8Array): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      requirePermission(ctx, PERMISSIONS.mediaWrite);
      const { filename } = parseInput(logoInputSchema, input);
      const previous = (await d.settings.getSettings(ctx)).logoMediaId;
      const up = await d.media.uploadImage(ctx, { kind: 'logo', filename }, bytes);
      try { await d.settings.updateSettings(ctx, { logoMediaId: up.mediaId }); }
      catch (e) { await d.media.removeImage(ctx, up.mediaId).catch(() => undefined); throw e; }
      if (previous) await d.media.removeImage(ctx, previous).catch(() => undefined);
    },

    async removeLogo(ctx: TenantServiceContext): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      requirePermission(ctx, PERMISSIONS.mediaWrite);
      const previous = (await d.settings.getSettings(ctx)).logoMediaId;
      await d.settings.updateSettings(ctx, { logoMediaId: null });
      if (previous) await d.media.removeImage(ctx, previous).catch(() => undefined);
    },
  };
}
export type WizardService = ReturnType<typeof makeWizardService>;
export const wizardService = makeWizardService(wizardDeps);
