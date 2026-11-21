import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { z } from 'zod';
import { mediaService, type MediaService } from '@/features/media/media-service';
import { pagesRepository, type PagesRepository } from './pages-repository';
import { HERO_IMAGE_POSITIONS, parseSectionContent } from './content-schema';
import type { SectionType } from '@/features/site/sections';

/** Which content key holds the image of which section type. One entry per type that can carry an image (E4 adds backgrounds here). */
export const IMAGE_SLOTS: Partial<Record<SectionType, string>> = { hero: 'image_media_id' };

const fileInput = z.strictObject({ sectionId: z.uuid(), filename: z.string().trim().max(255) });
const idInput = z.strictObject({ sectionId: z.uuid() });
const positionInput = z.strictObject({ sectionId: z.uuid(), position: z.enum(HERO_IMAGE_POSITIONS) });

/**
 * Section images (E2: hero banner). Same upload path as the logo (media service: bytes sniffed, plan quota, rate limit, audit,
 * reserved path), then the section's content points at the new media id. Order matters: upload -> point the draft at it -> only then
 * discard the previous file, and if pointing fails the new upload is discarded, so a failure never leaves the section without
 * its old image or with a dangling id. Discarding only soft-deletes the media row; published snapshots keep their own copy of the
 * path and the public bucket keeps the file, so replacing an image never breaks the live site before the next publish.
 */
export function makeSectionImageService(deps: { pages: PagesRepository; media: Pick<MediaService, 'uploadImage' | 'removeImage'> }) {
  const need = (ctx: TenantServiceContext) => { requirePermission(ctx, PERMISSIONS.websiteWrite); requirePermission(ctx, PERMISSIONS.mediaWrite); };
  async function load(ctx: TenantServiceContext, sectionId: string) {
    const s = await deps.pages.getSection(ctx, sectionId);   // company-filtered: another company's section is "not found"
    if (!s) throw new AppError('not_found');
    const slot = IMAGE_SLOTS[s.type];
    if (!slot) throw new AppError('validation', { detail: 'section_has_no_image' });
    return { s, slot };
  }
  async function save(ctx: TenantServiceContext, id: string, type: SectionType, content: Record<string, unknown>) {
    const parsed = parseSectionContent(type, content);
    if (!parsed.success) throw new AppError('validation', { detail: 'invalid_section_content' });
    await deps.pages.updateSection(ctx, id, { content: parsed.data });
  }
  return {
    async setImage(ctx: TenantServiceContext, input: unknown, bytes: Uint8Array): Promise<void> {
      need(ctx);
      const { sectionId, filename } = parseInput(fileInput, input);
      const { s, slot } = await load(ctx, sectionId);
      const previous = typeof s.content[slot] === 'string' ? (s.content[slot] as string) : null;
      const up = await deps.media.uploadImage(ctx, { kind: 'website_image', filename }, bytes);
      try { await save(ctx, s.id, s.type, { ...s.content, [slot]: up.mediaId, image_position: s.content.image_position ?? 'beside' }); }
      catch (e) { await deps.media.removeImage(ctx, up.mediaId).catch(() => undefined); throw e; }
      if (previous) await deps.media.removeImage(ctx, previous).catch(() => undefined);
    },
    async removeImage(ctx: TenantServiceContext, input: unknown): Promise<void> {
      need(ctx);
      const { sectionId } = parseInput(idInput, input);
      const { s, slot } = await load(ctx, sectionId);
      const previous = typeof s.content[slot] === 'string' ? (s.content[slot] as string) : null;
      const { [slot]: _gone, image_position: _pos, ...rest } = s.content;
      void _gone; void _pos;
      await save(ctx, s.id, s.type, rest);
      if (previous) await deps.media.removeImage(ctx, previous).catch(() => undefined);
    },
    async setPosition(ctx: TenantServiceContext, input: unknown): Promise<void> {
      requirePermission(ctx, PERMISSIONS.websiteWrite);
      const { sectionId, position } = parseInput(positionInput, input);
      const { s } = await load(ctx, sectionId);
      await save(ctx, s.id, s.type, { ...s.content, image_position: position });
    },
  };
}
export type SectionImageService = ReturnType<typeof makeSectionImageService>;
export const sectionImageService = makeSectionImageService({ pages: pagesRepository, media: mediaService });
