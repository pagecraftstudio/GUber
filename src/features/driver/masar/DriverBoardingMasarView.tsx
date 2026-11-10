'use client';
import { WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { RouteLine } from '@/ds/domain/RouteLine';
import { OccupancyBar } from '@/ds/domain/RouteLine';
import { EmptyState, ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, formatNumber, formatPercent, formatTime } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { Input } from '@/ds/primitives/Input';
import type { BoardingStats, DriverTrip } from '../driverApi';
import { QrScanner } from '../QrScanner';

export type Outcome = { kind: 'ok' | 'dup' | 'bad'; text: string; /** a retry can help (no signal, rate limit, unknown) */ retryable?: boolean };

/** Driver screens are English today (no Arabic copy exists), so digits and dates are English too (plan 5.7). Times follow the phone's own time zone, as the old screen did. */
const when = (iso: string) => `${formatDate(iso, 'en', { style: 'long' })}, ${formatTime(iso, 'en')}`;

export interface DriverBoardingViewProps {
  trips: DriverTrip[] | null;
  loadError: string | null;
  onReload: () => void;
  tripId: string;
  onSelectTrip: (id: string) => void;
  stats: BoardingStats | null;
  outcome: Outcome | null;
  onRetry: () => void;
  scanning: boolean;
  onToggleScan: () => void;
  onScanToken: (t: string) => void;
  manual: string;
  onManualChange: (v: string) => void;
  onSubmitManual: () => void;
  busy: boolean;
  online: boolean;
}

function Stat({ label, value, id }: { label: string; value: number | undefined; id: string }) {
  return (
    <div className="rounded-ds-md border border-line-default bg-surface-card p-3 text-center">
      <dt className="text-[13px] text-ink-secondary">{label}</dt>
      <dd className="mt-1 text-[32px] leading-none font-medium text-ink-primary tabular-nums" data-testid={`stat-${id}`}>{value === undefined ? '–' : formatNumber(value, 'en')}</dd>
    </div>
  );
}

/** Mobile-first boarding screen: big targets (56px scan, 48px fields), result you can read at arm's length, clear no-signal state. All behaviour lives in DriverBoarding. */
export function DriverBoardingMasarView(p: DriverBoardingViewProps) {
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

  const header = <h1 className="text-2xl font-medium text-ink-primary">Boarding</h1>;
  const offline = !p.online ? (
    <InlineAlert tone="warning" title="You are offline" action={<WifiOff size={18} strokeWidth={1.5} aria-hidden="true" />}>Boarding needs a connection. Scans are not saved until the signal is back.</InlineAlert>
  ) : null;

  if (p.loadError) return <div className="space-y-4">{header}{offline}<ErrorState title="Could not load your trips" description={p.loadError} onRetry={p.onReload} retryLabel="Try again" /></div>;
  if (!p.trips) return <div className="space-y-4">{header}{offline}<SkeletonRegion label="Loading your trips"><div className="space-y-2">{[0, 1].map((i) => <div key={i} className="space-y-2 rounded-ds-md border border-line-default p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>)}</div></SkeletonRegion></div>;
  if (p.trips.length === 0) return <div className="space-y-4">{header}{offline}<EmptyState title="No trips are assigned to you right now" description="When your company assigns you a trip it shows up here." /></div>;

  const trip = p.trips.find((t) => t.trip_id === p.tripId);
  const several = p.trips.length > 1;
  const pct = p.stats && p.stats.expected > 0 ? p.stats.boarded / p.stats.expected : 0;

  return (
    <div className="space-y-5">
      {header}
      {offline}

      {p.trips.length > 1 ? (
      <section aria-label="Assigned trips" className="space-y-2">
        <ul className="space-y-2">
          {p.trips.map((t) => {
            const on = t.trip_id === p.tripId;
            return (
              <li key={t.trip_id}>
                <button type="button" aria-pressed={on} onClick={() => p.onSelectTrip(t.trip_id)}
                  className={cx('flex min-h-16 w-full items-center justify-between gap-3 rounded-ds-md border bg-surface-card p-3 text-start', FOCUS, on ? 'border-action' : 'border-line-default hover:bg-surface-sunken')}>
                  <span className="min-w-0">
                    <span className="block text-base font-medium break-words text-ink-primary"><bdi dir="auto">{t.origin_name}</bdi> → <bdi dir="auto">{t.destination_name}</bdi></span>
                    <span className="mt-0.5 block text-[13px] text-ink-secondary tabular-nums">{when(t.departure_at)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge domain="trip" value={t.status} lang="en" /><span className="text-[13px] text-ink-secondary tabular-nums">{formatNumber(t.boarded, 'en')} / {formatNumber(t.expected, 'en')}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}

      {trip ? (
        <section aria-label="Selected trip" className="space-y-4 rounded-ds-md border border-line-default bg-surface-card p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] text-ink-secondary">{trip.company_name}</p>{several ? null : <p className="text-base font-medium text-ink-primary tabular-nums">{when(trip.departure_at)}</p>}</div>{several ? null : <StatusBadge domain="trip" value={trip.status} lang="en" />}</div>
          <RouteLine stops={[{ name: trip.origin_name, time: formatTime(trip.departure_at, 'en') }, { name: trip.destination_name, time: formatTime(trip.arrival_at, 'en') }]} />
        </section>
      ) : null}

      <section aria-label="Boarding progress" className="space-y-3">
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Expected" value={p.stats?.expected} id="expected" />
          <Stat label="Boarded" value={p.stats?.boarded} id="boarded" />
          <Stat label="Remaining" value={p.stats?.remaining} id="remaining" />
        </dl>
        {p.stats ? <OccupancyBar tone="action" booked={p.stats.boarded} capacity={Math.max(p.stats.expected, 1)} label="Boarding progress" figures={`${formatNumber(p.stats.boarded, 'en')} of ${formatNumber(p.stats.expected, 'en')} (${formatPercent(pct, 'en')})`} /> : null}
      </section>

      {p.outcome ? (
        <div data-testid="scan-outcome">
          <InlineAlert
            tone={p.outcome.kind === 'ok' ? 'success' : p.outcome.kind === 'dup' ? 'warning' : 'error'}
          >
            <p className="text-lg font-medium">{p.outcome.text}</p>
            {p.outcome.kind === 'bad' && p.outcome.retryable ? <div className="mt-3"><Button variant="secondary" size="lg" fullWidth loading={p.busy} onClick={p.onRetry} className="!h-12">Try again</Button></div> : null}
          </InlineAlert>
        </div>
      ) : null}

      <div ref={camera}><QrScanner active={p.scanning} onToken={p.onScanToken} /></div>

      <form onSubmit={(e) => { e.preventDefault(); p.onSubmitManual(); }} className="space-y-2">
        <label className="block text-sm font-medium text-ink-primary" htmlFor="manual-code">Or enter the code</label>
        <Input id="manual-code" size="lg" dir="ltr" value={p.manual} onChange={(e) => p.onManualChange(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="MALAKY:TICKET:…" maxLength={200} className="!h-12" />
        <Button type="submit" variant="secondary" size="lg" fullWidth loading={p.busy} disabled={!p.manual.trim()} className="!h-12">Board passenger</Button>
      </form>

      <div className="sticky bottom-0 -mx-4 border-t border-line-default bg-surface-page px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button size="lg" fullWidth variant={p.scanning ? 'secondary' : 'primary'} onClick={p.onToggleScan} className="!h-14 text-lg">{p.scanning ? 'Stop camera' : 'Scan ticket with camera'}</Button>
      </div>
    </div>
  );
}
