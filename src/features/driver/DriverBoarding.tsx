'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { BOARD_MESSAGES, BoardError, createDriverApi, type BoardingStats, type DriverTrip } from './driverApi';
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

  const submit = useCallback(async (raw: string) => {
    const token = raw.trim();
    if (!tripId || !token || busy) return;
    setLastToken(token);
    setBusy(true);
    try {
      const r = await api.board(tripId, token);
      setStats({ expected: r.expected, boarded: r.boarded, remaining: r.remaining });
      setOutcome(r.result === 'boarded'
        ? { kind: 'ok', text: `Boarded: ticket ${r.ticket_index}` }
        : { kind: 'dup', text: `Already boarded (ticket ${r.ticket_index}, ${fmt(r.boarded_at)})` });
      setManual('');
    } catch (e) {
      const code = e instanceof BoardError ? e.code : 'unknown';
      setOutcome({ kind: 'bad', text: BOARD_MESSAGES[code], retryable: RETRYABLE.has(code) });
    } finally { setBusy(false); }
  }, [api, tripId, busy]);

  return (
    <DriverBoardingMasarView
      trips={trips} loadError={loadError} onReload={loadTrips}
      tripId={tripId} onSelectTrip={(id) => { setTripId(id); setOutcome(null); }}
      stats={stats} outcome={outcome} onRetry={() => void submit(lastToken)}
      scanning={scanning} onToggleScan={() => setScanning((x) => !x)} onScanToken={(t) => void submit(t)}
      manual={manual} onManualChange={setManual} onSubmitManual={() => void submit(manual)} busy={busy} online={online}
    />
  );
}
