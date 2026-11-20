import type { Localized } from '@/features/site/schema';
import type { SectionType } from '@/features/site/sections';

export type PageRow = {
  id: string; slug: string; title: Localized; is_home: boolean; is_published: boolean;
  seo_title: Localized | null; seo_description: Localized | null; updated_at: string;
};
export type SectionRow = {
  id: string; page_id: string; type: SectionType; sort_order: number; is_enabled: boolean; content: Record<string, unknown>; updated_at: string;
};
export const PAGE_SELECT = 'id, slug, title, is_home, is_published, seo_title, seo_description, updated_at';
export const SECTION_SELECT = 'id, page_id, type, sort_order, is_enabled, content, updated_at';

export type DraftPage = {
  id: string; slug: string; title: Localized; isHome: boolean; isPublished: boolean;
  seoTitle: Localized | null; seoDescription: Localized | null; updatedAt: string;
};
export type DraftSection = {
  id: string; pageId: string; type: SectionType; sortOrder: number; isEnabled: boolean; content: Record<string, unknown>; updatedAt: string;
};
export const toDraftPage = (r: PageRow): DraftPage => ({
  id: r.id, slug: r.slug, title: r.title, isHome: r.is_home, isPublished: r.is_published,
  seoTitle: r.seo_title, seoDescription: r.seo_description, updatedAt: r.updated_at,
});
export const toDraftSection = (r: SectionRow): DraftSection => ({
  id: r.id, pageId: r.page_id, type: r.type, sortOrder: r.sort_order, isEnabled: r.is_enabled, content: r.content, updatedAt: r.updated_at,
});
