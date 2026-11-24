'use client';

import { ArrowRight, RefreshCw, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { EmptyState, ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import type { Lang } from '@/ds/format';
import { IconButton } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { arBoardMessages } from './driver-text';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';
import { BOARD_MESSAGES, BoardError, createDriverApi, type BoardErrorCode, type DriverTrip } from './driverApi';
import { groupTrips } from './trip-groups';

function TripCard({ t, lang }: { t: DriverTrip; lang: Lang }) {
  const x = DRIVER_SCREENS_TEXT[lang].today;
  return (
    <li>
      <Link href={`/driver/trips/${t.trip_id}`} aria-label={x.openTrip(t.origin_name, t.destination_name)}
        className={cx('block min-h-14 rounded-ds-md border border-line-default bg-surface-card p-4 hover:bg-surface-sunken', FOCUS)}>
        <span className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-base font-medium text-ink-primary">
            <bdi>{t.origin_name}</bdi><ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0 rtl:rotate-180" /><bdi>{t.destination_name}</bdi>
          </span>
          <StatusBadge domain="trip" value={t.status} />
        </span>
        <span className="mt-1 block text-sm text-ink-secondary tabular-nums">{x.window(t.departure_at, t.arrival_at, lang)}</span>
        <span className="mt-1 block text-sm text-ink-secondary tabular-nums">{x.boardedOf(t.boarded, t.expected, lang)}</span>
      </Link>
    </li>
  );
}

function Group({ title, hint, trips, lang }: { title: string; hint?: string; trips: DriverTrip[]; lang: Lang }) {
  if (trips.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium text-ink-primary">{title}</h2>
      {hint ? <p className="text-sm text-ink-secondary">{hint}</p> : null}
      <ul className="space-y-2">{trips.map((t) => <TripCard key={t.trip_id} t={t} lang={lang} />)}</ul>
    </section>
  );
}

/** Today: the driver's assigned trips grouped into "still open" (earlier days, not ended), today and upcoming. Read only; every row opens the trip manifest. */
export function DriverToday({ lang = 'ar' }: { lang?: Lang }) {
  const x = DRIVER_SCREENS_TEXT[lang].today;
  const api = useMemo(() => createDriverApi(getSupabaseBrowser()), []);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [errorCode, setErrorCode] = useState<BoardErrorCode | null>(null);
  const [online, setOnline] = useState(true);

  const load = useCallback(() => {
    setErrorCode(null);
    api.myTrips().then(setTrips).catch((e) => setErrorCode(e instanceof BoardError ? e.code : 'unknown'));
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync); window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);

  const groups = useMemo(() => (trips ? groupTrips(trips, new Date()) : null), [trips]);
  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-medium text-ink-primary">{x.title}</h1>
      <IconButton label={x.refresh} icon={<RefreshCw size={18} strokeWidth={1.5} />} onClick={load} />
    </div>
  );
  const offline = !online ? <InlineAlert tone="warning" title={x.offlineTitle} action={<WifiOff size={18} strokeWidth={1.5} aria-hidden="true" />}>{x.offlineBody}</InlineAlert> : null;

  if (errorCode) {
    const text = (lang === 'ar' ? arBoardMessages : BOARD_MESSAGES)[errorCode];
    return <div className="space-y-4">{header}{offline}<ErrorState title={x.loadErrorTitle} description={text} onRetry={load} retryLabel={x.retry} /></div>;
  }
  if (!groups) {
    return <div className="space-y-4">{header}{offline}<SkeletonRegion label={x.loading}><div className="space-y-2">{[0, 1].map((i) => <div key={i} className="space-y-2 rounded-ds-md border border-line-default p-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>)}</div></SkeletonRegion></div>;
  }
  if (groups.earlier.length + groups.today.length + groups.upcoming.length === 0) {
    return <div className="space-y-4">{header}{offline}<EmptyState title={x.emptyTitle} description={x.emptyBody} /></div>;
  }
  return (
    <div className="space-y-6">
      {header}{offline}
      <Group title={x.earlier} hint={x.earlierHint} trips={groups.earlier} lang={lang} />
      <Group title={x.todayHeading} trips={groups.today} lang={lang} />
      <Group title={x.upcoming} trips={groups.upcoming} lang={lang} />
    </div>
  );
}
