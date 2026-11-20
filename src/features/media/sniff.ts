/**
 * Decides what a file REALLY is from its first bytes. The browser-supplied MIME type and file name are never trusted: they are
 * attacker-controlled. Only PNG, JPEG and WebP pass (never SVG or anything that can carry script). The database and the Storage
 * bucket enforce the same list again.
 */
export const MAX_IMAGE_BYTES = 2_097_152; // keep equal to 0048 (reserve_media + bucket file_size_limit)

export type ImageType = { mime: 'image/png' | 'image/jpeg' | 'image/webp'; ext: 'png' | 'jpg' | 'webp' };

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', ext: 'webp' };
  return null;
}
