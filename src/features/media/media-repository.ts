import { mapDbError } from '@/lib/db/map-error';
import type { TenantServiceContext } from '@/lib/service/context';
import { z } from 'zod';

const reservedSchema = z.object({ id: z.uuid(), path: z.string().min(1) });
export type ReservedMedia = z.infer<typeof reservedSchema>;
export const MEDIA_BUCKET = 'company-public';

/** Everything goes through the caller's own client: RLS, the 0048 RPCs and the Storage policies are the locks, not this code. */
export type MediaRepository = {
  reserve(ctx: TenantServiceContext, a: { kind: string; mime: string; size: number; filename: string }): Promise<ReservedMedia>;
  upload(ctx: TenantServiceContext, path: string, bytes: Uint8Array, mime: string): Promise<{ ok: boolean }>;
  discard(ctx: TenantServiceContext, id: string): Promise<void>;
  /** Storage path of a live image of THIS company (null when missing or deleted). */
  findPath(ctx: TenantServiceContext, id: string): Promise<string | null>;
};

export const mediaRepository: MediaRepository = {
  async reserve(ctx, a) {
    const res = await ctx.db.rpc('reserve_media', { p_kind: a.kind, p_mime: a.mime, p_size: a.size, p_filename: a.filename });
    if (res.error) throw mapDbError(res.error);
    const parsed = reservedSchema.safeParse(res.data);
    if (!parsed.success) throw mapDbError({ code: 'XX000', message: 'reserve_media returned an unexpected shape' });
    return parsed.data;
  },
  async upload(ctx, path, bytes, mime) {
    const res = await ctx.db.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    return { ok: !res.error };
  },
  async findPath(ctx, id) {
    const res = await ctx.db.from('media').select('storage_path').eq('company_id', ctx.companyId).eq('id', id).eq('bucket', MEDIA_BUCKET).is('deleted_at', null).maybeSingle();
    if (res.error) throw mapDbError(res.error);
    return (res.data as { storage_path: string } | null)?.storage_path ?? null;
  },
  async discard(ctx, id) {
    const res = await ctx.db.rpc('discard_media', { p_id: id });
    if (res.error) throw mapDbError(res.error);
  },
};
