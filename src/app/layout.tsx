import type { Metadata } from 'next';
import './globals.css';
import { plexArabic, plexLatin } from '@/ds/fonts/fonts';
import { THEME_SCRIPT } from '@/ds/theme/themeScript';
import { Splash } from '@/ds/splash/Splash';
import { SPLASH_SCRIPT } from '@/ds/splash/splashScript';

export const metadata: Metadata = {
  title: { default: 'MASAR', template: '%s · MASAR' },
  robots: { index: false, follow: false }, // app/dashboard host: nothing here should be indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexLatin.variable} ${plexArabic.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + SPLASH_SCRIPT }} /></head>
      <body data-ds="masar" className="min-h-screen bg-surface-page text-ink-primary antialiased"><Splash />{children}</body>
    </html>
  );
}
