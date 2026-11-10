import type { Metadata } from 'next';
import '@/ui/ui.css';
import { DsScope } from '@/ds/shell/DsScope';
import { isSurfaceScoped } from '@/ds/scope';
import { DsFlagProvider } from '@/ds/shell/flag';

// Public customer marketplace. This is the only indexable surface; dashboard/admin/driver/operator-login stay noindex (root layout).
export const metadata: Metadata = {
  title: { absolute: 'MASAR - Book university bus trips' },
  description: 'Search and book intercity bus trips to Galala University from independent transport operators.',
  robots: { index: true, follow: true },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  // Legacy Cairo / Plus Jakarta Sans link stays ONLY while this surface is not flipped (plan 5.3: unflipped = unchanged).
  // Once the surface is in DS_SURFACES the page uses self-hosted IBM Plex and makes no font-CDN request.
  // The link and the CSP allowance are deleted at the end of Phase 6 (Step C).
  const flipped = isSurfaceScoped('marketplace', null);
  return (
    <DsScope surface="marketplace">
      {!flipped && (
        <>
          {/* React 19 hoists and de-duplicates these into <head>. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            rel="stylesheet"
            precedence="default"
            href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          />
        </>
      )}
      <DsFlagProvider value={flipped}>{children}</DsFlagProvider>
    </DsScope>
  );
}
