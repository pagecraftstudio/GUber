import type { Metadata } from 'next';
import '@/ui/ui.css';

export const metadata: Metadata = {
  title: 'MALAKY Bus',
  description: 'Multi-tenant intercity bus booking and management platform.',
  robots: { index: false, follow: false }, // preview surface: not for search engines until Phase 6 tenant sites exist
};

export default function UiLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* React 19 hoists and de-duplicates these into <head>. Fonts are the ones the UI was designed with. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        precedence="default"
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
      />
      {children}
    </>
  );
}
