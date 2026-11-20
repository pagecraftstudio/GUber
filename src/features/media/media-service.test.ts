import { describe, expect, it, vi } from 'vitest';
import { tenantCtx } from '@/test/helpers';
import { makeMediaService } from './media-service';
import type { MediaRepository } from './media-repository';
import { MAX_IMAGE_BYTES, sniffImage } from './sniff';

const ID = '00000000-0000-4000-8000-000000000501';
const PATH = '00000000-0000-4000-8000-000000000101/logo/x.png';
const png = (n = 64) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(n).fill(1)]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(1)]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 1, 1]);
const enc = (s: string) => new TextEncoder().encode(s);

function mk(over: Partial<Record<keyof MediaRepository, unknown>> = {}) {
  const repo = {
    reserve: vi.fn().mockResolvedValue({ id: ID, path: PATH }), upload: vi.fn().mockResolvedValue({ ok: true }),
    discard: vi.fn().mockResolvedValue(undefined), ...over,
  } as unknown as MediaRepository;
  return { repo, svc: makeMediaService(repo) };
}
const writer = tenantCtx(['media.write']);

describe('sniffImage: the bytes decide, not the name or the claimed type', () => {
  it('recognises PNG, JPEG and WebP', () => {
    expect(sniffImage(png())?.mime).toBe('image/png');
    expect(sniffImage(jpg)?.mime).toBe('image/jpeg');
    expect(sniffImage(webp)?.mime).toBe('image/webp');
  });
  it.each([
    ['svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['html', '<!doctype html><script>alert(1)</script>'], ['gif', 'GIF89a......'], ['pdf', '%PDF-1.7 ........'], ['empty-ish', 'abc'],
  ])('refuses %s', (_n, s) => expect(sniffImage(enc(s))).toBeNull());
  it('a RIFF file that is not WebP (e.g. WAV) is refused', () => expect(sniffImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45, 0]))).toBeNull());
});

describe('uploadImage', () => {
  it('needs media.write and touches nothing without it', async () => {
    const { repo, svc } = mk();
    await expect(svc.uploadImage(tenantCtx(['media.read']), { kind: 'logo', filename: 'a.png' }, png())).rejects.toMatchObject({ code: 'forbidden' });
    expect(repo.reserve).not.toHaveBeenCalled();
  });
  it('reserves with the DETECTED mime and size, uploads to the reserved path, returns the media id', async () => {
    const { repo, svc } = mk();
    const bytes = jpg;
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'evil.svg' }, bytes)).resolves.toEqual({ mediaId: ID, path: PATH });
    expect(repo.reserve).toHaveBeenCalledWith(expect.anything(), { kind: 'logo', mime: 'image/jpeg', size: bytes.length, filename: 'evil.svg' });
    expect(repo.upload).toHaveBeenCalledWith(expect.anything(), PATH, bytes, 'image/jpeg');
  });
  it('an SVG renamed to .png is refused before the database is reached', async () => {
    const { repo, svc } = mk();
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'logo.png' }, enc('<svg onload=alert(1)></svg>'))).rejects.toMatchObject({ code: 'validation', detail: 'image_type_not_supported' });
    expect(repo.reserve).not.toHaveBeenCalled();
  });
  it('empty and oversized files are refused before the database is reached', async () => {
    const { repo, svc } = mk();
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'a.png' }, new Uint8Array(0))).rejects.toMatchObject({ detail: 'image_too_large' });
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1); big.set(png(), 0);
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'a.png' }, big)).rejects.toMatchObject({ detail: 'image_too_large' });
    expect(repo.reserve).not.toHaveBeenCalled();
  });
  it('unknown kind and a client-supplied company are refused', async () => {
    const { repo, svc } = mk();
    await expect(svc.uploadImage(writer, { kind: 'avatar', filename: 'a' }, png())).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'a', company_id: 'other' }, png())).rejects.toMatchObject({ code: 'validation' });
    expect(repo.reserve).not.toHaveBeenCalled();
  });
  it('a failed Storage upload discards the reservation and reports a generic internal error', async () => {
    const { repo, svc } = mk({ upload: vi.fn().mockResolvedValue({ ok: false }) });
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'a.png' }, png())).rejects.toMatchObject({ code: 'internal' });
    expect(repo.discard).toHaveBeenCalledWith(expect.anything(), ID);
  });
  it('quota / rate-limit refusals from the database pass through and nothing is uploaded', async () => {
    const { repo, svc } = mk({ reserve: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { code: 'plan_limit' })) });
    await expect(svc.uploadImage(writer, { kind: 'logo', filename: 'a.png' }, png())).rejects.toMatchObject({ code: 'plan_limit' });
    expect(repo.upload).not.toHaveBeenCalled();
  });
});

describe('removeImage', () => {
  it('needs media.write and a uuid', async () => {
    const { repo, svc } = mk();
    await expect(svc.removeImage(tenantCtx([]), ID)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.removeImage(writer, '../x')).rejects.toMatchObject({ code: 'validation' });
    expect(repo.discard).not.toHaveBeenCalled();
    await svc.removeImage(writer, ID);
    expect(repo.discard).toHaveBeenCalledWith(expect.anything(), ID);
  });
});
