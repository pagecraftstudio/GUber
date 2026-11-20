import { AppError } from '@/lib/errors';
import { expectFound, expectList, expectMaybe, expectOne } from '@/lib/db/query';
import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import type { PageCreate, PageUpdate } from './content-schema';
import {
  PAGE_SELECT, SECTION_SELECT, toDraftPage, toDraftSection,
  type DraftPage, type DraftSection, type PageRow, type SectionRow,
} from './pages-types';
import type { SectionType } from '@/features/site/sections';

/**
 * Draft pages/sections. company_id always comes from ctx (never from input) and every statement also filters by it; RLS
 * (website.write) and the 0046 triggers are the second and third lock. Nothing here touches is_published on settings or
 * publications: only publish_website / unpublish_website do.
 */
export type PagesRepository = {
  listPages(ctx: TenantServiceContext): Promise<DraftPage[]>;
  getPage(ctx: TenantServiceContext, id: string): Promise<DraftPage | null>;
  createPage(ctx: TenantServiceContext, input: PageCreate): Promise<DraftPage>;
  updatePage(ctx: TenantServiceContext, id: string, patch: PageUpdate): Promise<DraftPage>;
  deletePage(ctx: TenantServiceContext, id: string): Promise<void>;
  listSections(ctx: TenantServiceContext, pageId: string): Promise<DraftSection[]>;
  addSection(ctx: TenantServiceContext, pageId: string, type: SectionType, content: Record<string, unknown>): Promise<DraftSection>;
  getSection(ctx: TenantServiceContext, id: string): Promise<DraftSection | null>;
  updateSection(ctx: TenantServiceContext, id: string, patch: { content?: Record<string, unknown>; isEnabled?: boolean }): Promise<DraftSection>;
  deleteSection(ctx: TenantServiceContext, id: string): Promise<void>;
  setSectionOrder(ctx: TenantServiceContext, pageId: string, orderedIds: string[]): Promise<void>;
};

export const pagesRepository: PagesRepository = {
  async listPages(ctx) {
    return expectList<PageRow, DraftPage>(
      await ctx.db.from('website_pages').select(PAGE_SELECT).eq('company_id', ctx.companyId).order('is_home', { ascending: false }).order('created_at'),
      toDraftPage,
    );
  },
  async getPage(ctx, id) {
    return expectMaybe<PageRow, DraftPage>(await ctx.db.from('website_pages').select(PAGE_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle(), toDraftPage);
  },
  async createPage(ctx, input) {
    const row = { company_id: ctx.companyId, slug: input.slug, title: input.title, seo_title: input.seoTitle ?? null, seo_description: input.seoDescription ?? null, is_home: false };
    return expectOne<PageRow, DraftPage>(await ctx.db.from('website_pages').insert(row).select(PAGE_SELECT).single(), toDraftPage);
  },
  async updatePage(ctx, id, patch) {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.seoTitle !== undefined) row.seo_title = patch.seoTitle;
    if (patch.seoDescription !== undefined) row.seo_description = patch.seoDescription;
    if (patch.isPublished !== undefined) row.is_published = patch.isPublished;
    return expectFound<PageRow, DraftPage>(await ctx.db.from('website_pages').update(row).eq('company_id', ctx.companyId).eq('id', id).select(PAGE_SELECT).maybeSingle(), toDraftPage);
  },
  async deletePage(ctx, id) {
    // Home is never deletable: the .eq('is_home', false) makes that true even if a caller skipped the service check.
    const res = await ctx.db.from('website_pages').delete().eq('company_id', ctx.companyId).eq('id', id).eq('is_home', false).select('id');
    if (res.error) throw mapDbError(res.error);
    if (!res.data?.length) throw new AppError('not_found');
  },
  async listSections(ctx, pageId) {
    return expectList<SectionRow, DraftSection>(
      await ctx.db.from('website_sections').select(SECTION_SELECT).eq('company_id', ctx.companyId).eq('page_id', pageId).order('sort_order'),
      toDraftSection,
    );
  },
  async addSection(ctx, pageId, type, content) {
    const last = await ctx.db.from('website_sections').select('sort_order').eq('company_id', ctx.companyId).eq('page_id', pageId).order('sort_order', { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw mapDbError(last.error);
    const row = { company_id: ctx.companyId, page_id: pageId, type, content, sort_order: (last.data?.sort_order ?? -1) + 1 };
    return expectOne<SectionRow, DraftSection>(await ctx.db.from('website_sections').insert(row).select(SECTION_SELECT).single(), toDraftSection);
  },
  async getSection(ctx, id) {
    return expectMaybe<SectionRow, DraftSection>(await ctx.db.from('website_sections').select(SECTION_SELECT).eq('company_id', ctx.companyId).eq('id', id).maybeSingle(), toDraftSection);
  },
  async updateSection(ctx, id, patch) {
    const row: Record<string, unknown> = {};
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.isEnabled !== undefined) row.is_enabled = patch.isEnabled;
    return expectFound<SectionRow, DraftSection>(await ctx.db.from('website_sections').update(row).eq('company_id', ctx.companyId).eq('id', id).select(SECTION_SELECT).maybeSingle(), toDraftSection);
  },
  async deleteSection(ctx, id) {
    const res = await ctx.db.from('website_sections').delete().eq('company_id', ctx.companyId).eq('id', id).select('id');
    if (res.error) throw mapDbError(res.error);
    if (!res.data?.length) throw new AppError('not_found');
  },
  /** sort_order has no unique constraint, so a partial failure leaves a valid (if odd) order, never a broken one. */
  async setSectionOrder(ctx, pageId, orderedIds) {
    for (const [i, id] of orderedIds.entries()) {
      const res = await ctx.db.from('website_sections').update({ sort_order: i }).eq('company_id', ctx.companyId).eq('page_id', pageId).eq('id', id).select('id');
      if (res.error) throw mapDbError(res.error);
      if (!res.data?.length) throw new AppError('not_found');
    }
  },
};
