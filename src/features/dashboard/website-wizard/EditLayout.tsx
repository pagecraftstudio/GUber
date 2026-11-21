import type { ReactNode } from 'react';
import type { LiveDraft } from '@/features/website/preview-site';
import type { SiteTrip } from '@/features/site/trips-data';
import { LiveDraftProvider } from './LiveDraft';
import { LivePreview } from './LivePreview';

/** Form on one side, live preview on the other (stacked on narrow screens, preview sticky on wide ones). */
export function EditLayout({ initial, companyName, companySlug, logoPath, supabaseUrl, trips, children }: {
  initial: LiveDraft; companyName: string; companySlug: string; logoPath: string | null; supabaseUrl: string; trips: SiteTrip[]; children: ReactNode;
}) {
  return (
    <LiveDraftProvider initial={initial}>
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="min-w-0 space-y-5">{children}</div>
        <div className="min-w-0 xl:sticky xl:top-6"><LivePreview companyName={companyName} companySlug={companySlug} logoPath={logoPath} supabaseUrl={supabaseUrl} trips={trips} /></div>
      </div>
    </LiveDraftProvider>
  );
}
