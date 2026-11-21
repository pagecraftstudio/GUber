'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { BOARD_MESSAGES, BoardError, createDriverApi, type BoardingStats, type DriverTrip, type ScanCard } from './driverApi';
import { DriverBoardingMasarView, type Outcome } from './masar/DriverBoardingMasarView';

const RETRYABLE = new Set(['network', 'rate_limited', 'unknown']);
const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function DriverBoarding() {
  const api = useMemo(() => createDriverApi(getSupabaseBrowser()), []);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [tripId, setTripId] = useState<string>('');
  const [stats, setStats] = useState<BoardingStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [card, setCard] = useState<ScanCard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState('');
  const [online, setOnline] = useState(true);

  const loadTrips = useCallback(() => {
    setLoadError(null);
    api.myTrips().then((t) => { setTrips(t); setTripId((cur) => cur || t[0]?.trip_id || ''); }).catch((e) => setLoadError(BOARD_MESSAGES[e instanceof BoardError ? e.code : 'unknown']));
  }, [api]);
  useEffect(() => { loadTrips(); }, [loadTrips]);
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
      setOutcome({ kind: 'bad', text: BOARD_MESSAGES[c], retryable: RETRYABLE.has(c) });
    } finally { setBusy(false); }
  }, [api, tripId, busy]);

  // Step 2: the driver confirms (D2). The server checks every rule again; the card is only what the driver saw.
  const confirm = useCallback(async () => {
    const ticketId = card?.booking?.ticket_id;
    if (!tripId || !card?.can_board || !ticketId || busy) return;
    setBusy(true);
    try {
      const r = await api.confirmBoarding(tripId, ticketId);
      setStats({ expected: r.expected, boarded: r.boarded, remaining: r.remaining });
      const who = card.student?.name ? ` ${card.student.name}${r.subscriber ? ` (Subscriber, ${r.subscriber.direction})` : ''}` : ` ticket ${r.ticket_index}`;
      setOutcome(r.result === 'boarded' ? { kind: 'ok', text: `Boarded:${who}` } : { kind: 'dup', text: `Already boarded (${who.trim()}, ${fmt(r.boarded_at)})` });
      setCard(null);
    } catch (e) {
      const c = e instanceof BoardError ? e.code : 'unknown';
      setOutcome({ kind: 'bad', text: BOARD_MESSAGES[c], retryable: false });
      setCard(null);
    } finally { setBusy(false); }
  }, [api, tripId, card, busy]);

  return (
    <DriverBoardingMasarView
      trips={trips} loadError={loadError} onReload={loadTrips}
      tripId={tripId} onSelectTrip={(id) => { setTripId(id); setOutcome(null); setCard(null); }}
      stats={stats} outcome={outcome} card={card} onConfirm={() => void confirm()} onCloseCard={() => setCard(null)} onRetry={() => void submit(lastToken)}
      scanning={scanning} onToggleScan={() => setScanning((x) => !x)} onScanToken={(t) => void submit(t)}
      manual={manual} onManualChange={setManual} onSubmitManual={() => void submit(manual)} busy={busy} online={online}
    />
  );
}
