'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import type { Lang } from '@/ds/format';
import { formatNumber } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { StarsDisplay } from '@/features/ratings/ui/StarInput';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';
import { createDriverScreensApi, licenseState, ScreenError, type DriverProfile as Profile } from './driverScreensApi';

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-default py-3">
      <dt className="text-sm text-ink-secondary">{label}</dt>
      <dd className="min-w-0 text-end text-base text-ink-primary tabular-nums break-words" data-testid={testId}>{children}</dd>
    </div>
  );
}

/** My profile: the caller's own driver record (driver_my_profile, 0060) with a licence-expiry warning. Read only: licence data is the company's to change. */
export function DriverProfile({ lang = 'ar' }: { lang?: Lang }) {
  const x = DRIVER_SCREENS_TEXT[lang];
  const p = x.profile;
  const api = useMemo(() => createDriverScreensApi(getSupabaseBrowser()), []);
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.myProfile().then(setData).catch((e) => setError(x.errors[e instanceof ScreenError ? e.code : 'unknown']));
  }, [api, x.errors]);
  useEffect(() => { load(); }, [load]);

  const header = <h1 className="text-2xl font-medium text-ink-primary">{p.title}</h1>;
  if (error) return <div className="space-y-4">{header}<ErrorState title={p.loadErrorTitle} description={error} onRetry={load} retryLabel={p.retry} /></div>;
  if (!data) return <div className="space-y-4">{header}<SkeletonRegion label={p.loading}><div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div></SkeletonRegion></div>;

  const rated = typeof data.rating_count === 'number' ? { count: data.rating_count, average: data.rating_average === null || data.rating_average === undefined ? null : Number(data.rating_average), distribution: data.rating_distribution ?? [] } : null;
  const state = licenseState(data.license_days_left);
  const days = data.license_days_left ?? 0;
  const day = data.license_expiry ?? '';
  const warning =
    state === 'expired' ? <InlineAlert tone="error" title={p.expiredTitle}>{p.expiredBody(day, Math.abs(days), lang)}</InlineAlert>
    : state === 'soon' ? <InlineAlert tone="warning" title={p.soonTitle}>{p.soonBody(day, days, lang)}</InlineAlert>
    : state === 'unknown' ? <InlineAlert tone="info" title={p.unknownTitle}>{p.unknownBody}</InlineAlert>
    : null;

  return (
    <div className="space-y-5">
      {header}
      <p className="text-lg font-medium text-ink-primary">{data.full_name}</p>
      {warning}
      <dl>
        {data.company_name ? <Row label={p.company}>{data.company_name}</Row> : null}
        <Row label={p.phone}>{data.phone ? <Identifier value={data.phone} /> : p.notOnFile}</Row>
        <Row label={p.licenseNumber}>{data.license_number ? <Identifier value={data.license_number} /> : p.notOnFile}</Row>
        <Row label={p.licenseExpiry} testId="license-expiry">
          {data.license_expiry ? <>{p.expiryValue(data.license_expiry, lang)}{state === 'ok' ? <span className="block text-[13px] text-ink-secondary">{p.okHint(days, lang)}</span> : null}</> : p.notOnFile}
        </Row>
        <Row label={p.tripsCompleted}>{formatNumber(data.trips_completed, lang)}</Row>
        {rated !== null ? (
          <Row label={p.rating} testId="rating">
            {rated.count > 0 && rated.average !== null ? (
              <>
                <StarsDisplay average={rated.average} label={`${formatNumber(rated.average, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / ${formatNumber(5, lang)}`} />
                <span className="ms-2">{formatNumber(rated.average, lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="block text-[13px] text-ink-secondary">{p.ratingCount(rated.count, lang)}</span>
              </>
            ) : p.ratingNone}
          </Row>
        ) : null}
      </dl>
      {rated !== null && rated.count > 0 ? (
        <ul className="space-y-1 text-sm text-ink-secondary" aria-label={p.rating}>
          {[5, 4, 3, 2, 1].map((n) => <li key={n}>{p.ratingBar(n, rated.distribution[n - 1] ?? 0, lang)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
