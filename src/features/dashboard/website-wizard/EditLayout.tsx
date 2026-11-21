'use client';
import type { ReactNode } from 'react';
import type { LiveDraft } from '@/features/website/preview-site';
import type { SiteTrip } from '@/features/site/trips-data';
import { LiveDraftProvider, useLiveDraft } from './LiveDraft';
import { LivePreview } from './LivePreview';

type Props = { companyName: string; companySlug: string; logoPath: string | null; supabaseUrl: string; trips: SiteTrip[]; children: ReactNode };

function Inner({ children, ...preview }: Props) {
  const open = useLiveDraft()?.open ?? true;
  // Form first, a narrow preview beside it from tablet width up (sticky while you scroll the form). Hidden preview gives the form the room back.
  return (
    <div className={`grid gap-6 lg:items-start ${open ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : 'lg:grid-cols-[minmax(0,1fr)_10rem]'}`}>
      <div className="min-w-0 space-y-5">{children}</div>
      <div className="min-w-0 lg:sticky lg:top-6"><LivePreview {...preview} /></div>
    </div>
  );
}

export function EditLayout({ initial, ...rest }: Props & { initial: LiveDraft }) {
  return <LiveDraftProvider initial={initial}><Inner {...rest} /></LiveDraftProvider>;
}
