'use client';
import { WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { RouteLine } from '@/ds/domain/RouteLine';
import { RollingNumber } from '@/ds/data/RollingNumber';
import { OccupancyBar } from '@/ds/domain/RouteLine';
import { EmptyState, ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, formatNumber, formatTime, type Lang } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { Input } from '@/ds/primitives/Input';
import type { BoardingStats, DriverTrip, ScanCard as ScanCardData } from '../driverApi';
import { DRIVER_TEXT } from '../driver-text';
import { QrScanner } from '../QrScanner';
import { ScanCard } from './ScanCard';

export type Outcome = { kind: 'ok' | 'dup' | 'bad'; text: string; /** a retry can help (no signal, rate limit, unknown) */ retryable?: boolean };

/** Digits and dates follow the driver's language (plan 5.7). Times follow the phone's own time zone, as the old screen did. */
const when = (iso: string, lang: Lang) => `${formatDate(iso, lang, { style: 'long' })}, ${formatTime(iso, lang)}`;

export interface DriverBoardingViewProps {
  trips: DriverTrip[] | null;
  loadError: string | null;
  onReload: () => void;
  tripId: string;
  onSelectTrip: (id: string) => void;
  stats: BoardingStats | null;
  outcome: Outcome | null;
  card: ScanCardData | null;
  onConfirm: () => void;
  onCloseCard: () => void;
  onRetry: () => void;
  scanning: boolean;
  onToggleScan: () => void;
  onScanToken: (t: string) => void;
  manual: string;
  onManualChange: (v: string) => void;
  onSubmitManual: () => void;
  busy: boolean;
  online: boolean;
  /** driver language; English when omitted (the screen's original behaviour) */
  lang?: Lang;
}

function Stat({ label, value, id, lang }: { label: string; value: number | undefined; id: string; lang: Lang }) {
  return (
    <div className="rounded-ds-md border border-line-default bg-surface-card p-3 text-center">
      <dt className="text-[13px] text-ink-secondary">{label}</dt>
      <dd className="mt-1 text-[32px] leading-none font-medium text-ink-primary tabular-nums" data-testid={`stat-${id}`}>{value === undefined ? '–' : <RollingNumber value={value} lang={lang} />}</dd>
    </div>
  );
}

/** Mobile-first boarding screen: big targets (56px scan, 48px fields), result you can read at arm's length, clear no-signal state. All behaviour lives in DriverBoarding. */
export function DriverBoardingMasarView(p: DriverBoardingViewProps) {
  const lang: Lang = p.lang ?? 'en';
  const x = DRIVER_TEXT[lang];
  // A short buzz so the driver can look at the passenger, not the screen. Where the phone has no vibration motor nothing happens.
  useEffect(() => {
    if (!p.outcome || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(p.outcome.kind === 'ok' ? 60 : [80, 60, 80]);
  }, [p.outcome]);

  // Opening the camera brings it into view: the scan button is pinned at the bottom, the camera sits mid-page.
  const camera = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (p.scanning) camera.current?.scrollIntoView?.({ block: 'center' });
  }, [p.scanning]);

  const header = <h1 className="text-2xl font-medium text-ink-primary">{x.title}</h1>;
  const offline = !p.online ? (
    <InlineAlert tone="warning" title={x.offlineTitle} action={<WifiOff size={18} strokeWidth={1.5} aria-hidden="true" />}>{x.offlineBody}</InlineAlert>
  ) : null;

  if (p.loadError) return <div className="space-y-4">{header}{offline}<ErrorState title={x.loadErrorTitle} description={p.loadError} onRetry={p.onReload} retryLabel={x.retry} /></div>;
  if (!p.trips) return <div className="space-y-4">{header}{offline}<SkeletonRegion label={x.loadingTrips}><div className="space-y-2">{[0, 1].map((i) => <div key={i} className="space-y-2 rounded-ds-md border border-line-default p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>)}</div></SkeletonRegion></div>;
  if (p.trips.length === 0) return <div className="space-y-4">{header}{offline}<EmptyState title={x.emptyTitle} description={x.emptyBody} /></div>;

  const trip = p.trips.find((t) => t.trip_id === p.tripId);
  const several = p.trips.length > 1;

  return (
    <div className="space-y-5">
      {header}
      {offline}

      {p.trips.length > 1 ? (
      <section aria-label={x.assignedTrips} className="space-y-2">
        <ul className="space-y-2">
          {p.trips.map((t) => {
            const on = t.trip_id === p.tripId;
            return (
              <li key={t.trip_id}>
                <button type="button" aria-pressed={on} onClick={() => p.onSelectTrip(t.trip_id)}
                  className={cx('flex min-h-16 w-full items-center justify-between gap-3 rounded-ds-md border bg-surface-card p-3 text-start', FOCUS, on ? 'border-action' : 'border-line-default hover:bg-surface-sunken')}>
                  <span className="min-w-0">
                    <span className="block text-base font-medium break-words text-ink-primary"><bdi dir="auto">{t.origin_name}</bdi> → <bdi dir="auto">{t.destination_name}</bdi></span>
                    <span className="mt-0.5 block text-[13px] text-ink-secondary tabular-nums">{when(t.departure_at, lang)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge domain="trip" value={t.status} lang={lang} /><span className="text-[13px] text-ink-secondary tabular-nums">{formatNumber(t.boarded, lang)} / {formatNumber(t.expected, lang)}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}

      {trip ? (
        <section aria-label={x.selectedTrip} className="space-y-4 rounded-ds-md border border-line-default bg-surface-card p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] text-ink-secondary">{trip.company_name}</p>{several ? null : <p className="text-base font-medium text-ink-primary tabular-nums">{when(trip.departure_at, lang)}</p>}</div>{several ? null : <StatusBadge domain="trip" value={trip.status} lang={lang} />}</div>
          <RouteLine stops={[{ name: trip.origin_name, time: formatTime(trip.departure_at, lang) }, { name: trip.destination_name, time: formatTime(trip.arrival_at, lang) }]} />
        </section>
      ) : null}

      <section aria-label={x.progress} className="space-y-3">
        <dl className="grid grid-cols-3 gap-3">
          <Stat label={x.expected} value={p.stats?.expected} id="expected" lang={lang} />
          <Stat label={x.boarded} value={p.stats?.boarded} id="boarded" lang={lang} />
          <Stat label={x.remaining} value={p.stats?.remaining} id="remaining" lang={lang} />
        </dl>
        {p.stats ? <OccupancyBar tone="action" booked={p.stats.boarded} capacity={Math.max(p.stats.expected, 1)} label={x.progress} figures={x.figures(p.stats.boarded, p.stats.expected, lang)} /> : null}
      </section>

      {p.card ? <ScanCard card={p.card} busy={p.busy} onBoard={p.onConfirm} onClose={p.onCloseCard} lang={lang} /> : null}

      {p.outcome ? (
        <div key={`${p.outcome.kind}:${p.outcome.text}`} data-testid="scan-outcome" className="ds-outcome">
          <InlineAlert
            tone={p.outcome.kind === 'ok' ? 'success' : p.outcome.kind === 'dup' ? 'warning' : 'error'}
          >
            <p className="text-lg font-medium">{p.outcome.text}</p>
            {p.outcome.kind === 'bad' && p.outcome.retryable ? <div className="mt-3"><Button variant="secondary" size="lg" fullWidth loading={p.busy} onClick={p.onRetry} className="!h-12">{x.retry}</Button></div> : null}
          </InlineAlert>
        </div>
      ) : null}

      <div ref={camera}><QrScanner active={p.scanning} onToken={p.onScanToken} unavailableText={x.cameraUnavailable} /></div>

      <form onSubmit={(e) => { e.preventDefault(); p.onSubmitManual(); }} className="space-y-2">
        <label className="block text-sm font-medium text-ink-primary" htmlFor="manual-code">{x.manualLabel}</label>
        <Input id="manual-code" size="lg" dir="ltr" value={p.manual} onChange={(e) => p.onManualChange(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder={x.manualPlaceholder} maxLength={200} className="!h-12" />
        <Button type="submit" variant="secondary" size="lg" fullWidth loading={p.busy} disabled={!p.manual.trim()} className="!h-12">{x.checkPassenger}</Button>
      </form>

      <div className="sticky bottom-0 -mx-4 border-t border-line-default bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button size="lg" fullWidth variant={p.scanning ? 'secondary' : 'primary'} onClick={p.onToggleScan} className="!h-14 text-lg">{p.scanning ? x.stopCamera : x.scanCamera}</Button>
      </div>
    </div>
  );
}
