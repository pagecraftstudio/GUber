'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { BOARD_MESSAGES, BoardError, createDriverApi, type BoardingStats, type DriverTrip } from './driverApi';
import { QrScanner } from './QrScanner';

type Outcome = { kind: 'ok' | 'dup' | 'bad'; text: string };
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

  useEffect(() => {
    api.myTrips().then((t) => { setTrips(t); if (t[0]) setTripId(t[0].trip_id); }).catch((e) => setLoadError(BOARD_MESSAGES[e instanceof BoardError ? e.code : 'unknown']));
  }, [api]);
  useEffect(() => { setStats(null); if (tripId) api.stats(tripId).then(setStats).catch(() => setStats(null)); }, [api, tripId]);

  const submit = useCallback(async (raw: string) => {
    const token = raw.trim();
    if (!tripId || !token || busy) return;
    setBusy(true);
    try {
      const r = await api.board(tripId, token);
      setStats({ expected: r.expected, boarded: r.boarded, remaining: r.remaining });
      setOutcome(r.result === 'boarded'
        ? { kind: 'ok', text: `Boarded: ticket ${r.ticket_index}` }
        : { kind: 'dup', text: `Already boarded (ticket ${r.ticket_index}, ${fmt(r.boarded_at)})` });
      setManual('');
    } catch (e) {
      setOutcome({ kind: 'bad', text: BOARD_MESSAGES[e instanceof BoardError ? e.code : 'unknown'] });
    } finally { setBusy(false); }
  }, [api, tripId, busy]);

  const trip = trips?.find((t) => t.trip_id === tripId);
  const pct = stats && stats.expected > 0 ? Math.round((stats.boarded / stats.expected) * 1000) / 10 : 0;
  const tone = outcome?.kind === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : outcome?.kind === 'dup' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-300 bg-red-50 text-red-800';

  if (loadError) return <p role="alert" className="text-sm text-red-600">{loadError}</p>;
  if (!trips) return <p className="text-sm text-slate-500">Loading your trips…</p>;
  if (trips.length === 0) return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No trips are assigned to you right now.</p>;

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        Trip
        <select value={tripId} onChange={(e) => { setTripId(e.target.value); setOutcome(null); }} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">
          {trips.map((t) => <option key={t.trip_id} value={t.trip_id}>{t.origin_name} → {t.destination_name} · {fmt(t.departure_at)}</option>)}
        </select>
      </label>
      {trip ? <p className="text-xs text-slate-500">{trip.company_name} · status: {trip.status}</p> : null}

      <dl className="grid grid-cols-3 gap-3 text-center" aria-label="Boarding progress">
        {([['Expected', stats?.expected], ['Boarded', stats?.boarded], ['Remaining', stats?.remaining]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">{k}</dt><dd className="text-2xl font-semibold" data-testid={`stat-${k.toLowerCase()}`}>{v ?? '–'}</dd>
          </div>
        ))}
      </dl>
      <div className="h-2 overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-slate-500">Boarding progress: {pct}%</p>

      {outcome ? <div role="status" aria-live="polite" className={`rounded-lg border p-4 text-base font-medium ${tone}`} data-testid="scan-outcome">{outcome.text}</div> : null}

      <button type="button" onClick={() => setScanning((s) => !s)} className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700">
        {scanning ? 'Stop camera' : 'Scan ticket with camera'}
      </button>
      <QrScanner active={scanning} onToken={(t) => void submit(t)} />

      <form onSubmit={(e) => { e.preventDefault(); void submit(manual); }} className="space-y-2">
        <label className="block text-sm font-medium text-slate-700" htmlFor="manual-code">Or enter the code</label>
        <input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false}
               placeholder="MALAKY:TICKET:…" className="w-full rounded-md border border-slate-300 px-3 py-2.5 font-mono text-xs" maxLength={200} />
        <button type="submit" disabled={busy || !manual.trim()} className="w-full rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-60">Board passenger</button>
      </form>
    </div>
  );
}
