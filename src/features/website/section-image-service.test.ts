import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { AppError } from '@/lib/errors';
import { makeSectionImageService } from './section-image-service';
import type { PagesRepository } from './pages-repository';

const SEC = '00000000-0000-4000-8000-000000000601';
const OLD = '00000000-0000-4000-8000-000000000701';
const NEW = '00000000-0000-4000-8000-000000000702';
const section = (o: Record<string, unknown> = {}, type = 'hero') => ({ id: SEC, pageId: SEC, type, sortOrder: 0, isEnabled: true, content: { title: { en: 'Hi' }, ...o }, updatedAt: '' });
const png = new Uint8Array(32);
const both = tenantCtx(['website.write', 'media.write']);

function mk(stored: unknown = section({ image_media_id: OLD, image_position: 'full' }), mediaOver: Record<string, unknown> = {}, pagesOver: Record<string, unknown> = {}) {
  const pages = { getSection: vi.fn().mockResolvedValue(stored), updateSection: vi.fn().mockResolvedValue({}), ...pagesOver } as unknown as PagesRepository;
  const media = { uploadImage: vi.fn().mockResolvedValue({ mediaId: NEW, path: 'c/website_image/x.png' }), removeImage: vi.fn().mockResolvedValue(undefined), ...mediaOver };
  return { pages, media, svc: makeSectionImageService({ pages, media }) };
}
const saved = (m: ReturnType<typeof mk>) => (m.pages.updateSection as ReturnType<typeof vi.fn>).mock.calls[0]![2] as { content: Record<string, unknown> };

describe('permissions: website.write AND media.write, nothing touched without them', () => {
  it.each([['website.write only', ['website.write']], ['media.write only', ['media.write']], ['read only', ['website.read', 'media.read']]])('upload refused with %s', async (_n, perms) => {
    const m = mk();
    await expect(m.svc.setImage(tenantCtx(perms), { sectionId: SEC, filename: 'a.png' }, png)).rejects.toMatchObject({ code: 'forbidden' });
    expect(m.pages.getSection).not.toHaveBeenCalled(); expect(m.media.uploadImage).not.toHaveBeenCalled();
  });
  it('remove needs both; position needs only website.write (no file involved)', async () => {
    const m = mk();
    await expect(m.svc.removeImage(tenantCtx(['website.write']), { sectionId: SEC })).rejects.toMatchObject({ code: 'forbidden' });
    await m.svc.setPosition(tenantCtx(['website.write']), { sectionId: SEC, position: 'beside' });
    expect(saved(m).content.image_position).toBe('beside');
  });
});

describe('setImage', () => {
  it('uploads as website_image, points the section at the new id, then discards the previous one', async () => {
    const m = mk();
    await m.svc.setImage(both, { sectionId: SEC, filename: 'banner.png' }, png);
    expect(m.media.uploadImage).toHaveBeenCalledWith(expect.anything(), { kind: 'website_image', filename: 'banner.png' }, png);
    expect(saved(m).content).toMatchObject({ title: { en: 'Hi' }, image_media_id: NEW, image_position: 'full' });   // text and chosen position kept
    expect(m.media.removeImage).toHaveBeenCalledWith(expect.anything(), OLD);
  });
  it('first image defaults to "beside"', async () => {
    const m = mk(section());
    await m.svc.setImage(both, { sectionId: SEC, filename: 'a.png' }, png);
    expect(saved(m).content).toMatchObject({ image_media_id: NEW, image_position: 'beside' });
    expect(m.media.removeImage).not.toHaveBeenCalled();
  });
  it('if pointing the section fails: the NEW upload is discarded, the OLD image is kept', async () => {
    const m = mk(undefined, {}, { updateSection: vi.fn().mockRejectedValue(new AppError('internal')) });
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.png' }, png)).rejects.toMatchObject({ code: 'internal' });
    expect(m.media.removeImage).toHaveBeenCalledTimes(1);
    expect(m.media.removeImage).toHaveBeenCalledWith(expect.anything(), NEW);
  });
  it('if the upload fails nothing is changed', async () => {
    const m = mk(undefined, { uploadImage: vi.fn().mockRejectedValue(new AppError('validation', { detail: 'image_type_not_supported' })) });
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.svg' }, png)).rejects.toMatchObject({ detail: 'image_type_not_supported' });
    expect(m.pages.updateSection).not.toHaveBeenCalled(); expect(m.media.removeImage).not.toHaveBeenCalled();
  });
  it('a failed discard of the previous file never fails the upload', async () => {
    const m = mk(undefined, { removeImage: vi.fn().mockRejectedValue(new Error('storage down')) });
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.png' }, png)).resolves.toBeUndefined();
  });
  it('another company\'s (or missing) section is not_found before any upload', async () => {
    const m = mk(null);
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.png' }, png)).rejects.toMatchObject({ code: 'not_found' });
    expect(m.media.uploadImage).not.toHaveBeenCalled();
  });
  it('a section type without an image slot is refused before any upload', async () => {
    const m = mk(section({}, 'faq'));
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.png' }, png)).rejects.toMatchObject({ code: 'validation', detail: 'section_has_no_image' });
    expect(m.media.uploadImage).not.toHaveBeenCalled();
  });
  it('input is strict: a company_id or a non-uuid section id is refused', async () => {
    const m = mk();
    await expect(m.svc.setImage(both, { sectionId: SEC, filename: 'a.png', company_id: 'x' }, png)).rejects.toMatchObject({ code: 'validation' });
    await expect(m.svc.setImage(both, { sectionId: '../x', filename: 'a.png' }, png)).rejects.toMatchObject({ code: 'validation' });
    expect(m.pages.getSection).not.toHaveBeenCalled();
  });
});

describe('removeImage and setPosition', () => {
  it('remove drops the image and its position, keeps the text, then discards the file', async () => {
    const m = mk();
    await m.svc.removeImage(both, { sectionId: SEC });
    expect(saved(m).content).toEqual({ title: { en: 'Hi' } });
    expect(m.media.removeImage).toHaveBeenCalledWith(expect.anything(), OLD);
  });
  it('position accepts only beside | full', async () => {
    const m = mk();
    for (const position of ['left', 'FULL', '', 1, null]) await expect(m.svc.setPosition(both, { sectionId: SEC, position })).rejects.toMatchObject({ code: 'validation' });
    expect(m.pages.updateSection).not.toHaveBeenCalled();
    await m.svc.setPosition(both, { sectionId: SEC, position: 'full' });
    expect(saved(m).content).toMatchObject({ image_media_id: OLD, image_position: 'full' });
  });
});
