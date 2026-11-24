'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import type { Lang } from '@/ds/format';
import { BOARD_MESSAGES, BoardError, createDriverApi, type BoardErrorCode, type BoardingStats, type DriverTrip, type ScanCard } from './driverApi';
import { arBoardMessages, DRIVER_TEXT } from './driver-text';
import { DriverBoardingMasarView, type Outcome } from './masar/DriverBoardingMasarView';

const RETRYABLE = new Set(['network', 'rate_limited', 'unknown']);
const msg = (code: BoardErrorCode, lang: Lang) => (lang === 'ar' ? arBoardMessages : BOARD_MESSAGES)[code];

export function DriverBoarding({ lang = 'en' }: { lang?: Lang }) {
  const x = DRIVER_TEXT[lang];
  const api = useMemo(() => createDriverApi(getSupabaseBrowser()), []);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [tripId, setTripId] = useState<string>('');
  const [stats, setStats] = useState<BoardingStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [card, setCard] = useState<ScanCard | null>(null);
  const [loadErrorCode, setLoadErrorCode] = useState<BoardErrorCode | null>(null);
  const [lastToken, setLastToken] = useState('');
  const [online, setOnline] = useState(true);

  const loadTrips = useCallback(() => {
    setLoadErrorCode(null);
    api.myTrips().then((t) => { setTrips(t); setTripId((cur) => cur || t[0]?.trip_id || ''); }).catch((e) => setLoadErrorCode(e instanceof BoardError ? e.code : 'unknown'));
  }, [api]);
  useEffect(() => { loadTrips(); }, [loadTrips]);
  // a result sentence is text in the language it was written in: switching language clears it instead of leaving a stale one
  useEffect(() => { setOutcome(null); }, [lang]);
  // Reflect the phone's connection so the driver knows a scan will not go through (the server stays the only authority).
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync); window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  useEffect(() => { setStats(null); if (tripId) api.stats(tripId).then(setStats).catch(() => setStats(null)); }, [api, tripId]);

  // Step 1: any code (signed MASAR QR, typed MASAR ID, ticket QR) -> one card. Reading it changes nothing on the server.
  const submit = useCallback(async (raw: string) => {
    const code = raw.trim();
    if (!tripId || !code || busy) return;
    setLastToken(code);
    setBusy(true);
    setOutcome(null);
    try {
      setCard(await api.scanIdentity(tripId, code));
      setManual('');
    } catch (e) {
      setCard(null);
      const c = e instanceof BoardError ? e.code : 'unknown';
      setOutcome({ kind: 'bad', text: msg(c, lang), retryable: RETRYABLE.has(c) });
    } finally { setBusy(false); }
  }, [api, tripId, busy, lang]);

  // Step 2: the driver confirms (D2). The server checks every rule again; the card is only what the driver saw.
  const confirm = useCallback(async () => {
    const ticketId = card?.booking?.ticket_id;
    if (!tripId || !card?.can_board || !ticketId || busy) return;
    setBusy(true);
    try {
      const r = await api.confirmBoarding(tripId, ticketId);
      setStats({ expected: r.expected, boarded: r.boarded, remaining: r.remaining });
      const who = card.student?.name ? ` ${card.student.name}${r.subscriber ? ` (${x.subscriberDirection(r.subscriber.direction)})` : ''}` : x.ticketNo(r.ticket_index, lang);
      setOutcome(r.result === 'boarded' ? { kind: 'ok', text: x.boardedOk(who) } : { kind: 'dup', text: x.alreadyBoarded(who, r.boarded_at, lang) });
      setCard(null);
    } catch (e) {
      const c = e instanceof BoardError ? e.code : 'unknown';
      setOutcome({ kind: 'bad', text: msg(c, lang), retryable: false });
      setCard(null);
    } finally { setBusy(false); }
  }, [api, tripId, card, busy, x, lang]);

  return (
    <DriverBoardingMasarView
      trips={trips} loadError={loadErrorCode ? msg(loadErrorCode, lang) : null} onReload={loadTrips}
      tripId={tripId} onSelectTrip={(id) => { setTripId(id); setOutcome(null); setCard(null); }}
      stats={stats} outcome={outcome} card={card} onConfirm={() => void confirm()} onCloseCard={() => setCard(null)} onRetry={() => void submit(lastToken)}
      scanning={scanning} onToggleScan={() => setScanning((x) => !x)} onScanToken={(t) => void submit(t)}
      manual={manual} onManualChange={setManual} onSubmitManual={() => void submit(manual)} busy={busy} online={online} lang={lang}
    />
  );
}
