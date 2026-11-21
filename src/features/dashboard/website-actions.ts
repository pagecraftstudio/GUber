'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { websiteService } from '@/features/website/service';
import { FONT_PAIRS } from '@/features/site/theme';
import { pageSlugFrom } from '@/features/website/page-slug';
import { pagesService } from '@/features/website/pages-service';
import { publishService } from '@/features/website/publish-service';
import { sectionImageService } from '@/features/website/section-image-service';
import { MAX_IMAGE_BYTES as IMAGE_MAX_BYTES } from '@/features/media/sniff';
import { errorState, successState, type FormState } from './form-state';

/**
 * Draft website editor actions (website.write, enforced again by the service and by RLS). No company id is read from the form:
 * the context derives it from the session. Every id from the form is only ever used together with that company filter.
 * Publishing is NOT here (M3E-4): nothing in this file can make content public.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const LIST = '/dashboard/website/pages';
const FLOW = '/dashboard/website';          // the three-step flow (customize, preview, publish) draws from the same draft
const DESIGN = '/dashboard/website/design';   // the visual editor re-renders after every draft change made on either screen

async function ctx(permission = 'website.write'): Promise<TenantServiceContext> {
  return createTenantServiceContext(await createClient(), await requireTenant(permission));
}
async function run(paths: string[], message: Extract<FormState, { status: 'success' }>['message'], work: (c: TenantServiceContext) => Promise<void>, permission = 'website.write'): Promise<FormState> {
  try { await work(await ctx(permission)); } catch (e) { return errorState(e); }
  for (const p of [...paths, DESIGN, FLOW]) revalidatePath(p);
  return successState(message);
}
const pagePath = (id: string) => `${LIST}/${id}`;

export async function createPageFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run([LIST], 'created', async (c) => {
    await pagesService.createPage(c, { slug: str(f, 'slug').toLowerCase(), title: { en: str(f, 'titleEn'), ar: str(f, 'titleAr') } });
  });
}

export async function savePageMetaFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const id = str(f, 'pageId');
  return run([LIST, pagePath(id)], 'saved', async (c) => {
    await pagesService.updatePage(c, id, {
      title: { en: str(f, 'titleEn'), ar: str(f, 'titleAr') },
      seoTitle: { en: str(f, 'seoTitleEn'), ar: str(f, 'seoTitleAr') },
      seoDescription: { en: str(f, 'seoDescEn'), ar: str(f, 'seoDescAr') },
      isPublished: f.get('isPublished') === null ? undefined : str(f, 'isPublished') === '1',
    });
  });
}

export async function deletePageFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  try { await pagesService.deletePage(await ctx(), str(f, 'pageId')); } catch (e) { return errorState(e); }
  revalidatePath(LIST);
  redirect(LIST); // after the try: redirect() signals by throwing and must not be caught
}

export async function addSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const id = str(f, 'pageId');
  return run([pagePath(id)], 'created', async (c) => { await pagesService.addSection(c, id, { type: str(f, 'type') }); });
}

/** Visual editor: add a section at a position (0 = top). Same permission, same service validation as every other draft change. */
export async function insertSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const id = str(f, 'pageId');
  return run([pagePath(id)], 'created', async (c) => { await pagesService.insertSection(c, id, { type: str(f, 'type'), index: Number(str(f, 'index')) }); });
}

export async function saveSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const pageId = str(f, 'pageId');
  return run([pagePath(pageId)], 'saved', async (c) => {
    let content: unknown;
    try { content = JSON.parse(str(f, 'content') || '{}'); } catch { throw new AppError('validation', { detail: 'invalid_section_content' }); }
    await pagesService.updateSection(c, str(f, 'sectionId'), { content });
  });
}

export async function toggleSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const pageId = str(f, 'pageId');
  return run([pagePath(pageId)], 'saved', async (c) => { await pagesService.updateSection(c, str(f, 'sectionId'), { isEnabled: str(f, 'enabled') === '1' }); });
}

export async function deleteSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const pageId = str(f, 'pageId');
  return run([pagePath(pageId)], 'deleted', async (c) => { await pagesService.deleteSection(c, str(f, 'sectionId')); });
}

/** Swap with the neighbour. The new order is computed from the server's own list, so a stale browser cannot reorder foreign rows. */
export async function moveSectionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const pageId = str(f, 'pageId'), sectionId = str(f, 'sectionId'), dir = str(f, 'dir') === 'up' ? -1 : 1;
  return run([pagePath(pageId)], 'saved', async (c) => {
    const ids = (await pagesService.getPageWithSections(c, pageId)).sections.map((s) => s.id);
    const i = ids.indexOf(sectionId), j = i + dir;
    if (i < 0) throw new AppError('not_found');
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await pagesService.reorderSections(c, pageId, { orderedIds: ids });
  });
}

/** Going live is a separate permission (website.publish). Nothing else in this file can make content public. */
const PUBLISH = '/dashboard/website';
export async function publishWebsiteFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run([PUBLISH], 'saved', async (c) => { await publishService.publish(c, { note: str(f, 'note') }); }, 'website.publish');
}
export async function rollbackWebsiteFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run([PUBLISH], 'saved', async (c) => { await publishService.rollback(c, { version: Number(str(f, 'version')) }); }, 'website.publish');
}
export async function unpublishWebsiteFormAction(_prev: FormState, _f: FormData): Promise<FormState> {
  return run([PUBLISH], 'saved', async (c) => { await publishService.unpublish(c); }, 'website.publish');
}

/** Section images (hero banner). The file is read here, but its type is decided by the server from the bytes, never by what the browser says. */
export async function uploadSectionImageFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const file = f.get('file');
  if (!(file instanceof File) || file.size === 0) return errorState(new AppError('validation', { detail: 'image_type_not_supported' }));
  if (file.size > IMAGE_MAX_BYTES) return errorState(new AppError('validation', { detail: 'image_too_large' }));
  const pageId = str(f, 'pageId');
  return run([pagePath(pageId)], 'saved', async (c) => {
    await sectionImageService.setImage(c, { sectionId: str(f, 'sectionId'), filename: file.name }, new Uint8Array(await file.arrayBuffer()));
  });
}
export async function removeSectionImageFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run([pagePath(str(f, 'pageId'))], 'saved', async (c) => { await sectionImageService.removeImage(c, { sectionId: str(f, 'sectionId') }); });
}
export async function setSectionImagePositionFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run([pagePath(str(f, 'pageId'))], 'saved', async (c) => { await sectionImageService.setPosition(c, { sectionId: str(f, 'sectionId'), position: str(f, 'position') }); });
}

/** The Look panel (E3): fonts, colours and button shape. Every value is checked against the fixed lists in site/theme.ts and again by the settings schema and the database CHECKs. */
export async function saveLookFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const patch: Record<string, string> = {};
  const pairId = str(f, 'fontPair');
  if (pairId) {
    const pair = FONT_PAIRS.find((p) => p.id === pairId);
    if (!pair) return errorState(new AppError('validation', { detail: 'invalid_font' }));
    patch.fontHeading = pair.heading; patch.fontBody = pair.body;
  }
  for (const k of ['buttonStyle', 'primaryColor', 'secondaryColor'] as const) { const v = str(f, k); if (v) patch[k] = v; }
  if (Object.keys(patch).length === 0) return errorState(new AppError('validation', { detail: 'nothing_to_save' }));
  return run(['/dashboard/website/design', '/dashboard/website'], 'saved', async (c) => { await websiteService.updateSettings(c, patch); });
}

/** Canvas: add a page from its name(s). The address is made from the English name; the page starts with one section so it is never blank. Redirects into the new page. */
export async function addPageFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let id: string;
  try {
    const c = await ctx();
    const taken = (await pagesService.listPages(c)).map((p) => p.slug);
    const titleEn = str(f, 'titleEn'), titleAr = str(f, 'titleAr');
    const page = await pagesService.createPage(c, { slug: pageSlugFrom(titleEn, taken), title: { en: titleEn, ar: titleAr } });
    await pagesService.insertSection(c, page.id, { type: 'about', index: 0 });
    id = page.id;
  } catch (e) { return errorState(e); }
  revalidatePath(FLOW);
  redirect(`${FLOW}?${new URLSearchParams({ step: 'design', page: id })}`); // after the try: redirect() signals by throwing
}
