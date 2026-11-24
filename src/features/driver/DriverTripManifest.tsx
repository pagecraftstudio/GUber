'use client';

import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { ConfirmDialog } from '@/ds/feedback/Dialog';
import { EmptyState, ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import type { Lang } from '@/ds/format';
import { Identifier } from '@/ds/format/Identifier';
import { Button, IconButton } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { arBoardMessages, DRIVER_TEXT } from './driver-text';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';
import { BOARD_MESSAGES, BoardError, createDriverApi, type DriverTrip } from './driverApi';
import { createDriverScreensApi, ScreenError, type EndTripResult, type ManifestPassenger, type ScreenErrorCode } from './driverScreensApi';
import { isOpenTrip } from './trip-groups';

const boardingOf = (p: ManifestPassenger): 'not_boarded' | 'partial' | 'boarded' => (p.seats_boarded <= 0 ? 'not_boarded' : p.seats_boarded >= p.seats ? 'boarded' : 'partial');

function Passenger({ p, lang }: { p: ManifestPassenger; lang: Lang }) {
  const x = DRIVER_SCREENS_TEXT[lang].manifest;
  const seats = DRIVER_TEXT[lang].seats(p.seats, lang);
  return (
    <li className="space-y-1 border-b border-line-default py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-medium break-words text-ink-primary">{p.passenger_name}</p>
        <StatusBadge domain="boarding" value={boardingOf(p)} />
      </div>
      <p className="text-sm text-ink-secondary tabular-nums">
        {seats}{p.seats > 1 || p.seats_boarded > 0 ? ` · ${x.boardedOfSeats(p.seats_boarded, p.seats, lang)}` : ''}
        {p.is_subscriber ? <span className="ms-2 rounded-ds-md border border-line-default px-1.5 py-0.5 text-[12px] text-ink-primary">{x.subscriber}</span> : null}
      </p>
      {p.pickup_stop || p.dropoff_stop ? (
        <p className="text-[13px] text-ink-secondary">
          {p.pickup_stop ? <>{x.pickup}: <bdi>{p.pickup_stop}</bdi></> : null}
          {p.pickup_stop && p.dropoff_stop ? ' · ' : null}
          {p.dropoff_stop ? <>{x.dropoff}: <bdi>{p.dropoff_stop}</bdi></> : null}
        </p>
      ) : null}
      <p className="text-[13px] text-ink-muted">{x.reference}: <Identifier value={p.reference} /></p>
    </li>
  );
}

/**
 * Trip manifest + End trip. Everything the driver sees comes from two reads (their own assigned trips, and the manifest RPC, which refuses a trip that is not theirs);
 * ending is ONE call to driver_end_trip. The button mirrors the server rules (open status, after departure) only to save a pointless tap: the database decides.
 * The manifest carries no phone, email, price or payment (migration 0060).
 */
export function DriverTripManifest({ tripId, lang = 'ar' }: { tripId: string; lang?: Lang }) {
  const x = DRIVER_SCREENS_TEXT[lang];
  const m = x.manifest;
  const client = useMemo(() => getSupabaseBrowser(), []);
  const trips = useMemo(() => createDriverApi(client), [client]);
  const screens = useMemo(() => createDriverScreensApi(client), [client]);

  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [rows, setRows] = useState<ManifestPassenger[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [done, setDone] = useState<EndTripResult | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    // the trip header is optional: a finished trip is no longer in the "my trips" list, the manifest still opens
    const header = trips.myTrips().then((all) => all.find((t) => t.trip_id === tripId) ?? null).catch((e) => {
      if (e instanceof BoardError && e.code === 'not_signed_in') throw e;
      return null;
    });
    Promise.all([header, screens.manifest(tripId)])
      .then(([t, list]) => { setTrip(t); setRows(list); })
      .catch((e) => {
        if (e instanceof ScreenError) setLoadError(x.errors[e.code]);
        else if (e instanceof BoardError) setLoadError((lang === 'ar' ? arBoardMessages : BOARD_MESSAGES)[e.code]);
        else setLoadError(x.errors.unknown);
      });
  }, [trips, screens, tripId, x.errors, lang]);
  useEffect(() => { load(); }, [load]);

  const endTrip = async () => {
    setEndError(null);
    try {
      const r = await screens.endTrip(tripId);
      setDone(r);
      setTrip((cur) => (cur ? { ...cur, status: 'completed' } : cur));
    } catch (e) {
      const code: ScreenErrorCode = e instanceof ScreenError ? e.code : 'unknown';
      setEndError(x.errors[code]);
    } finally { setConfirming(false); }
  };

  const back = (
    <Link href="/driver" className={cx('inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-link underline-offset-2 hover:underline', FOCUS)}>
      <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" className="rtl:rotate-180" />{m.back}
    </Link>
  );

  if (loadError) return <div className="space-y-4">{back}<ErrorState title={m.loadErrorTitle} description={loadError} onRetry={load} retryLabel={m.retry} /></div>;
  if (!rows) return <div className="space-y-4">{back}<SkeletonRegion label={m.loading}><div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="space-y-2 border-b border-line-default py-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>)}</div></SkeletonRegion></div>;

  const open = trip ? isOpenTrip(trip.status) : false;
  const started = trip ? Date.now() >= new Date(trip.departure_at).getTime() : false;
  const canEnd = open && started && !done;
  const expected = rows.reduce((n, r) => n + r.seats, 0);
  const boarded = rows.reduce((n, r) => n + r.seats_boarded, 0);
  const remaining = Math.max(0, expected - boarded);

  return (
    <div className="space-y-5">
      {back}
      <header className="space-y-2">
        {trip ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 text-2xl font-medium text-ink-primary">
                <bdi>{trip.origin_name}</bdi><ArrowRight size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0 rtl:rotate-180" /><bdi>{trip.destination_name}</bdi>
              </h1>
              <StatusBadge domain="trip" value={trip.status} />
            </div>
            <p className="text-sm text-ink-secondary tabular-nums">{x.today.window(trip.departure_at, trip.arrival_at, lang)}</p>
          </>
        ) : <h1 className="text-2xl font-medium text-ink-primary">{m.tripLabel}</h1>}
        <p className="text-sm text-ink-secondary tabular-nums" data-testid="manifest-summary">{m.summary(boarded, expected, lang)}</p>
      </header>

      {done ? (
        <InlineAlert tone="info" title={m.doneTitle}>{done.changed ? m.doneBody(done.ended_at, done.boarded, done.expected, lang) : m.doneAlready}</InlineAlert>
      ) : null}
      {endError ? <InlineAlert tone="error">{endError}</InlineAlert> : null}

      {open && !done ? (
        <div className="space-y-2">
          <Link href={`/driver/boarding?trip=${encodeURIComponent(tripId)}`}
            className={cx('flex min-h-14 w-full items-center justify-center rounded-ds-md bg-action px-4 text-base font-medium text-on-action', FOCUS)}>{m.scan}</Link>
          <Button variant="secondary" size="lg" fullWidth disabled={!canEnd} onClick={() => setConfirming(true)} data-testid="end-trip">{m.endTrip}</Button>
          {!started ? <p className="text-[13px] text-ink-secondary">{m.endBeforeDeparture}</p> : null}
        </div>
      ) : null}

      <section aria-labelledby="manifest-passengers" className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 id="manifest-passengers" className="text-lg font-medium text-ink-primary">{m.passengers}</h2>
          <IconButton label={m.refresh} icon={<RefreshCw size={18} strokeWidth={1.5} />} onClick={load} />
        </div>
        {rows.length === 0 ? <EmptyState title={m.noPassengersTitle} description={m.noPassengersBody} /> : <ul>{rows.map((p) => <Passenger key={p.booking_id} p={p} lang={lang} />)}</ul>}
      </section>

      <ConfirmDialog open={confirming} tone="destructive" title={m.confirmTitle}
        description={<><p>{m.confirmBody(boarded, expected, lang)}</p>{remaining > 0 ? <p className="mt-2 font-medium text-ink-primary">{m.confirmRemaining(remaining, lang)}</p> : null}</>}
        confirmLabel={m.confirmYes} cancelLabel={m.confirmNo} onConfirm={endTrip} onCancel={() => setConfirming(false)} />
    </div>
  );
}
