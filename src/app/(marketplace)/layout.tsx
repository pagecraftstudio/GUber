import type { Metadata } from 'next';
import '@/ui/ui.css';

// Public customer marketplace. This is the only indexable surface; dashboard/admin/driver/operator-login stay noindex (root layout).
export const metadata: Metadata = {
  title: 'MALAKY Bus - Book university bus trips',
  description: 'Search and book intercity bus trips to Galala University from independent transport operators.',
  robots: { index: true, follow: true },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
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
