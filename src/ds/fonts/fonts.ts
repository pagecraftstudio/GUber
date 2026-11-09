import localFont from 'next/font/local';

/**
 * Self-hosted IBM Plex (D3). Files come from the OFL-licensed @fontsource packages, copied here so the build
 * never reaches a font CDN. Weights 400/500/600 only (plan 6.3); all three exist for both families.
 * Subsets: Latin for IBM Plex Sans, Arabic for IBM Plex Sans Arabic. Latin comes first in the stack so Latin
 * characters (booking references, phone numbers) use Plex Sans and Arabic characters fall through to Plex Arabic.
 */
export const plexLatin = localFont({
  variable: '--font-latin',
  display: 'swap',
  src: [
    { path: './ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
});

export const plexArabic = localFont({
  variable: '--font-arabic',
  display: 'swap',
  src: [
    { path: './ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './ibm-plex-sans-arabic-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './ibm-plex-sans-arabic-arabic-600-normal.woff2', weight: '600', style: 'normal' },
  ],
});
