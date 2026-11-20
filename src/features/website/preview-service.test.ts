import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { makePreviewService, type PreviewRepository } from './preview-service';

const site = { company: { name: 'A', slug: 'a' }, version: 0, published_at: '2030-01-01T00:00:00Z', site: { schema_version: 1, settings: {}, pages: [{ slug: '', is_home: true, sections: [] }], media: {} } };
const svc = (r: { data?: unknown; error?: { code?: string; message?: string } | null }) => {
  const fetch = vi.fn().mockResolvedValue({ data: r.data ?? null, error: r.error ?? null });
  return { service: makePreviewService({ fetch } as PreviewRepository), fetch };
};
const ctx = tenantCtx(['website.read']);

describe('preview service', () => {
  it('needs website.read and never reaches the database without it', async () => {
    const { service, fetch } = svc({ data: site });
    await expect(service.getDraft(tenantCtx([]))).rejects.toMatchObject({ code: 'forbidden' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns the parsed draft', async () => {
    const r = await svc({ data: site }).service.getDraft(ctx);
    expect(r).toMatchObject({ ok: true, data: { version: 0, company: { slug: 'a' } } });
  });
  it.each([
    ['website settings are missing', 'settings_missing'], ['site title is required', 'title_required'],
    ['a published home page is required', 'home_page_required'], ['the home page needs at least one enabled section', 'home_section_required'],
    ['site is too large to publish', 'too_large'], ['something unexpected', 'invalid_content'],
  ])('checklist failure "%s" becomes a fixed code', async (message, issue) => {
    expect(await svc({ error: { code: '23514', message } }).service.getDraft(ctx)).toEqual({ ok: false, issue });
  });
  it('content validation (22023) is a fixed code and never echoes the database message', async () => {
    const r = await svc({ error: { code: '22023', message: 'secret <b>content</b>' } }).service.getDraft(ctx);
    expect(r).toEqual({ ok: false, issue: 'invalid_content' });
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('permission error maps to forbidden, others to internal (message not leaked)', async () => {
    await expect(svc({ error: { code: '42501' } }).service.getDraft(ctx)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc({ error: { code: '08006', message: 'host db.internal unreachable' } }).service.getDraft(ctx)).rejects.toMatchObject({ code: 'internal' });
  });
  it('an unexpected or future-versioned shape is an error, never a guess', async () => {
    await expect(svc({ data: { nope: 1 } }).service.getDraft(ctx)).rejects.toMatchObject({ code: 'internal' });
    await expect(svc({ data: { ...site, site: { ...site.site, schema_version: 99 } } }).service.getDraft(ctx)).rejects.toMatchObject({ code: 'internal' });
  });
});
