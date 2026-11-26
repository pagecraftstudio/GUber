import type { Metadata } from 'next';
import { AnalyticsRoot } from '@/components/analytics/AnalyticsRoot';

// Public customer marketplace. This is the only indexable surface; dashboard/admin/driver/operator-login stay noindex (root layout).
export const metadata: Metadata = {
  title: { absolute: 'MASAR - Book university bus trips' },
  description: 'Search and book intercity bus trips to Galala University from independent transport operators.',
  robots: { index: true, follow: true },
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Consent banner + page views (P10). Records nothing until the visitor agrees. */}
      <AnalyticsRoot />
    </>
  );
}
