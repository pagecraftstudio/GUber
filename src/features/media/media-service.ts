import { AppError, parseInput } from '@/lib/errors';
import { PERMISSIONS } from '@/lib/auth/permission-keys';
import { requirePermission } from '@/lib/service/authorize';
import type { TenantServiceContext } from '@/lib/service/context';
import { z } from 'zod';
import { mediaRepository, type MediaRepository } from './media-repository';
import { MAX_IMAGE_BYTES, sniffImage } from './sniff';

export const uploadInputSchema = z.strictObject({
  kind: z.enum(['logo', 'website_image']),
  filename: z.string().trim().max(255),
});

/**
 * Upload an image: authorize -> validate the bytes -> reserve (database: permission, plan quota, rate limit, audit, path) ->
 * upload to Storage (policy: only a reserved path) -> on failure discard the reservation. The MIME type stored is the one
 * detected from the bytes, never the one the browser claimed. Returns the media id to reference from website settings.
 */
export function makeMediaService(repo: MediaRepository) {
  return {
    async uploadImage(ctx: TenantServiceContext, input: unknown, bytes: Uint8Array): Promise<{ mediaId: string; path: string }> {
      requirePermission(ctx, PERMISSIONS.mediaWrite);
      const { kind, filename } = parseInput(uploadInputSchema, input);
      if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) throw new AppError('validation', { detail: 'image_too_large' });
      const type = sniffImage(bytes);
      if (!type) throw new AppError('validation', { detail: 'image_type_not_supported' });

      const reserved = await repo.reserve(ctx, { kind, mime: type.mime, size: bytes.length, filename });
      const up = await repo.upload(ctx, reserved.path, bytes, type.mime);
      if (!up.ok) {
        await repo.discard(ctx, reserved.id).catch(() => undefined); // a failed discard leaves an unreferenced row, never a usable image
        throw new AppError('internal', { cause: new Error('image upload to storage failed') });
      }
      return { mediaId: reserved.id, path: reserved.path };
    },
    /** Path for building the public URL of an own image. Needs media.read, like the table. */
    async imagePath(ctx: TenantServiceContext, mediaId: string): Promise<string | null> {
      requirePermission(ctx, PERMISSIONS.mediaRead);
      parseInput(z.uuid(), mediaId);
      return repo.findPath(ctx, mediaId);
    },
    /** Paths of own images, for drawing the editor. Needs media.read; at most 50 ids per call. */
    async imageEntries(ctx: TenantServiceContext, ids: string[]): Promise<Record<string, { path: string; mime: string }>> {
      requirePermission(ctx, PERMISSIONS.mediaRead);
      const clean = parseInput(z.array(z.uuid()).max(50), [...new Set(ids)]);
      return repo.findEntries(ctx, clean);
    },
    async removeImage(ctx: TenantServiceContext, mediaId: string): Promise<void> {
      requirePermission(ctx, PERMISSIONS.mediaWrite);
      parseInput(z.uuid(), mediaId);
      await repo.discard(ctx, mediaId);
    },
  };
}
export type MediaService = ReturnType<typeof makeMediaService>;
export const mediaService = makeMediaService(mediaRepository);
