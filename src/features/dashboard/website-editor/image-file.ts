/** Quick, friendly browser pre-check for image pickers. NOT security: the server sniffs the real bytes and the database re-checks. */
export const IMAGE_MAX_BYTES = 2_097_152;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

export function imageFileProblem(file: { size: number; type: string }, lang: 'en' | 'ar'): string | null {
  if (file.size > IMAGE_MAX_BYTES) return lang === 'ar' ? 'حجم الملف أكبر من 2 ميجابايت.' : 'The file is larger than 2 MB.';
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) return lang === 'ar' ? 'استخدم صورة PNG أو JPEG أو WebP.' : 'Use a PNG, JPEG or WebP image.';
  return null;
}
