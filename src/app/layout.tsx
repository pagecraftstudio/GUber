import type { Metadata } from 'next';
import './globals.css';
import { plexArabic, plexLatin } from '@/ds/fonts/fonts';

export const metadata: Metadata = {
  title: { default: 'MASAR', template: '%s · MASAR' },
  robots: { index: false, follow: false }, // app/dashboard host: nothing here should be indexed
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexLatin.variable} ${plexArabic.variable}`}>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
