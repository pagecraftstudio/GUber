import { compactStyle, sectionStyleWrite } from '@/features/site/section-style';
import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { pagesRepository, type PagesRepository } from './pages-repository';
import {
  managedKeys, pageCreateSchema, pageUpdateSchema, parseSectionContent, sectionCreateSchema, sectionInsertSchema, sectionReorderSchema, sectionUpdateSchema,
} from './content-schema';
import { SECTION_DEFAULTS } from './section-fields';
import type { DraftPage, DraftSection } from './pages-types';

export const MAX_SECTIONS_PER_PAGE = 40;

const fail = (detail: string): never => { throw new AppError('validation', { detail }); };

/** Draft editing only. Order everywhere: authorize -> validate -> repository. Publishing lives in publish-service (M3E-4). */
export function makePagesService(repo: PagesRepository) {
  return {
    async listPages(ctx: TenantServiceContext): Promise<DraftPage[]> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      return repo.listPages(ctx);
    },
    async getPageWithSections(ctx: TenantServiceContext, pageId: string): Promise<{ page: DraftPage; sections: DraftSection[] }> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      const page = await repo.getPage(ctx, pageId);
      if (!page) throw new AppError('not_found');
      return { page, sections: await repo.listSections(ctx, pageId) };
    },
    /** Companies start with no website_pages row. The home page is created on first editor visit (write permission only). */
    async ensureHomePage(ctx: TenantServiceContext): Promise<DraftPage[]> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const pages = await repo.listPages(ctx);
      return pages.some((p) => p.isHome) ? pages : [await repo.createHomePage(ctx), ...pages];
    },
    async createPage(ctx: TenantServiceContext, input: unknown): Promise<DraftPage> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      return repo.createPage(ctx, parseInput(pageCreateSchema, input));
    },
    async updatePage(ctx: TenantServiceContext, id: string, input: unknown): Promise<DraftPage> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const patch = parseInput(pageUpdateSchema, input);
      if (patch.isPublished === false) {
        const page = await repo.getPage(ctx, id);
        if (page?.isHome) fail('home_always_published');
      }
      return repo.updatePage(ctx, id, patch);
    },
    async deletePage(ctx: TenantServiceContext, id: string): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const page = await repo.getPage(ctx, id);
      if (!page) throw new AppError('not_found');
      if (page.isHome) throw new AppError('business_rule', { detail: 'home_not_deletable' });
      await repo.deletePage(ctx, id);
    },
    async addSection(ctx: TenantServiceContext, pageId: string, input: unknown): Promise<DraftSection> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const { type, content } = parseInput(sectionCreateSchema, input);
      const parsed = parseSectionContent(type, content);
      if (!parsed.success) throw new AppError('validation', { detail: 'invalid_section_content' });
      if (!(await repo.getPage(ctx, pageId))) throw new AppError('not_found');
      return repo.addSection(ctx, pageId, type, parsed.data);
    },
    /**
     * Visual editor: add a section AT a position. Appends first (one insert, default heading only), then moves it into place with the
     * same reorder the move buttons use, so a failure between the two leaves a valid page with the new section at the bottom.
     */
    async insertSection(ctx: TenantServiceContext, pageId: string, input: unknown): Promise<DraftSection> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const { type, index } = parseInput(sectionInsertSchema, input);
      const parsed = parseSectionContent(type, SECTION_DEFAULTS[type] ?? {});
      if (!parsed.success) throw new AppError('internal', { cause: new Error('section defaults do not satisfy the write schema') });
      if (!(await repo.getPage(ctx, pageId))) throw new AppError('not_found');
      const existing = await repo.listSections(ctx, pageId);
      if (existing.length >= MAX_SECTIONS_PER_PAGE) throw new AppError('business_rule', { detail: 'too_many_sections' });
      const created = await repo.addSection(ctx, pageId, type, parsed.data);
      const at = Math.min(index, existing.length);
      if (at < existing.length) {
        const ids = existing.map((s) => s.id);
        ids.splice(at, 0, created.id);
        await repo.setSectionOrder(ctx, pageId, ids);
      }
      return created;
    },
    async updateSection(ctx: TenantServiceContext, id: string, input: unknown): Promise<DraftSection> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const patch = parseInput(sectionUpdateSchema, input);
      let content: Record<string, unknown> | undefined;
      if (patch.content !== undefined) {
        const current = await repo.getSection(ctx, id);
        if (!current) throw new AppError('not_found');
        const parsed = parseSectionContent(current.type, patch.content); // validated against the section's STORED type, never a client-supplied one
        if (!parsed.success) throw new AppError('validation', { detail: 'invalid_section_content' });
        const managed = managedKeys(current.type);
        const kept = Object.fromEntries(managed.filter((k) => current.content[k] !== undefined).map((k) => [k, current.content[k]]));
        content = { ...Object.fromEntries(Object.entries(parsed.data).filter(([k]) => !managed.includes(k))), ...kept };
      }
      return repo.updateSection(ctx, id, { content, isEnabled: patch.isEnabled });
    },
    /** The stored style of one section (for merging a single change over it). Needs website.read. */
    async getSectionForStyle(ctx: TenantServiceContext, id: string): Promise<{ section: Record<string, unknown> }> {
      requirePermission(ctx, PERMISSIONS.websiteRead);
      const current = await repo.getSection(ctx, id);
      if (!current) throw new AppError('not_found');
      const st = current.content.style;
      return { section: st && typeof st === 'object' ? (st as Record<string, unknown>) : {} };
    },
    /** E4: set the look of one section. Only the style key changes; everything else in the content is carried over and re-validated. */
    async setSectionStyle(ctx: TenantServiceContext, id: string, input: unknown): Promise<DraftSection> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const style = compactStyle(parseInput(sectionStyleWrite, input));
      const current = await repo.getSection(ctx, id);
      if (!current) throw new AppError('not_found');
      const { style: _old, ...rest } = current.content;
      const parsed = parseSectionContent(current.type, Object.keys(style).length > 0 ? { ...rest, style } : rest);
      if (!parsed.success) throw new AppError('validation', { detail: 'invalid_section_content' });
      return repo.updateSection(ctx, id, { content: parsed.data });
    },
    async deleteSection(ctx: TenantServiceContext, id: string): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      await repo.deleteSection(ctx, id);
    },
    async reorderSections(ctx: TenantServiceContext, pageId: string, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const { orderedIds } = parseInput(sectionReorderSchema, input);
      const existing = (await repo.listSections(ctx, pageId)).map((s) => s.id);
      const same = existing.length === orderedIds.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => existing.includes(id));
      if (!same) fail('order_mismatch');
      await repo.setSectionOrder(ctx, pageId, orderedIds);
    },
  };
}
export type PagesService = ReturnType<typeof makePagesService>;
export const pagesService = makePagesService(pagesRepository);
