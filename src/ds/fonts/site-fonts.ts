import localFont from 'next/font/local';

/**
 * Extra typefaces a company can pick for its public website (E3). Self-hosted like the platform's own IBM Plex (fonts.ts): the
 * OFL-licensed @fontsource files are copied here, so the build never reaches a font CDN. Latin first in each stack so numbers and
 * Latin names use the Latin cut and Arabic text falls through to the Arabic cut. `preload: false`: only sites that choose the
 * font download it. The CSS stacks that use these variables live in features/site/theme.ts.
 */
// next/font needs every value written out as a literal (no helpers). Tajawal has no 600: its 700 file serves semibold.
export const cairoLatin = localFont({
  variable: '--font-cairo-latin', display: 'swap', preload: false,
  src: [
    { path: './cairo-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './cairo-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './cairo-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
});
export const cairoArabic = localFont({
  variable: '--font-cairo-arabic', display: 'swap', preload: false,
  src: [
    { path: './cairo-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './cairo-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './cairo-arabic-600-normal.woff2', weight: '600', style: 'normal' },
  ],
});
export const tajawalLatin = localFont({
  variable: '--font-tajawal-latin', display: 'swap', preload: false,
  src: [
    { path: './tajawal-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './tajawal-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './tajawal-latin-700-normal.woff2', weight: '600', style: 'normal' },
  ],
});
export const tajawalArabic = localFont({
  variable: '--font-tajawal-arabic', display: 'swap', preload: false,
  src: [
    { path: './tajawal-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './tajawal-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './tajawal-arabic-700-normal.woff2', weight: '600', style: 'normal' },
  ],
});

/** Put on the element that wraps a company site (and the editor canvas) so every chosen font's variable is defined inside it. */
export const SITE_FONT_CLASSES = [cairoLatin, cairoArabic, tajawalLatin, tajawalArabic].map((f) => f.variable).join(' ');
