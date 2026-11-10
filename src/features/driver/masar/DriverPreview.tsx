'use client';
import { useState } from 'react';
import type { BoardingStats, DriverTrip } from '../driverApi';
import { DriverBoardingMasarView, type Outcome } from './DriverBoardingMasarView';

type Scenario = 'trips' | 'loading' | 'empty' | 'loadError' | 'offline';
const TRIPS: DriverTrip[] = [
  { trip_id: 'a', company_name: 'Delta Express', origin_name: 'Cairo, Ramses', destination_name: 'Alexandria, Sidi Gaber', departure_at: new Date(Date.now() + 40 * 60000).toISOString(), arrival_at: new Date(Date.now() + 230 * 60000).toISOString(), status: 'boarding', expected: 38, boarded: 12, remaining: 26 },
  { trip_id: 'b', company_name: 'Delta Express', origin_name: 'القاهرة', destination_name: 'الإسكندرية', departure_at: new Date(Date.now() + 5 * 3600000).toISOString(), arrival_at: new Date(Date.now() + 8 * 3600000).toISOString(), status: 'scheduled', expected: 20, boarded: 0, remaining: 20 },
];

/** FAKE data only. Codes: "dup" = already boarded, "bad" = invalid ticket, "net" = no signal, anything else boards. */
export function DriverPreview() {
  const [scenario, setScenario] = useState<Scenario>('trips');
  const [tripId, setTripId] = useState('a');
  const [boarded, setBoarded] = useState(12);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [last, setLast] = useState('');
  const expected = tripId === 'a' ? 38 : 20;
  const stats: BoardingStats = { expected, boarded: tripId === 'a' ? boarded : 0, remaining: expected - (tripId === 'a' ? boarded : 0) };

  const board = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setLast(code);
    if (code === 'dup') setOutcome({ kind: 'dup', text: 'Already boarded (ticket 3, 9 November 2026, 06:41)' });
    else if (code === 'bad') setOutcome({ kind: 'bad', text: 'Invalid ticket. Ask the passenger to reopen their ticket and try again.' });
    else if (code === 'net') setOutcome({ kind: 'bad', text: 'No connection. Check your signal, then try again. This scan was not recorded.', retryable: true });
    else { setBoarded((b) => Math.min(expected, b + 1)); setOutcome({ kind: 'ok', text: `Boarded: ticket ${boarded + 1}` }); }
    setManual('');
  };

  return (
    <div data-ds="masar" style={{ display: 'contents' }}>
      <div className="min-h-screen bg-surface-page text-ink-primary" data-preview="MASAR-DRIVER-PREVIEW">
        <div className="mx-auto max-w-md space-y-4 px-4 py-6">
          <div className="rounded-ds-md border border-line-default bg-surface-card p-3 text-[13px] text-ink-secondary">
            <p className="font-medium text-ink-primary">Preview with fake data. Nothing is sent.</p>
            <p className="mt-1">Type <code>dup</code>, <code>bad</code> or <code>net</code> as the code to see those results; anything else boards. The camera is real.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['trips', 'loading', 'empty', 'loadError', 'offline'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={scenario === s} onClick={() => { setScenario(s); setOutcome(null); }} className="h-9 rounded-ds-sm border border-line-strong bg-surface-card px-3 text-sm aria-pressed:border-action aria-pressed:font-medium">{s}</button>
              ))}
            </div>
          </div>
          <DriverBoardingMasarView
            trips={scenario === 'loading' ? null : scenario === 'empty' ? [] : TRIPS}
            loadError={scenario === 'loadError' ? 'No connection. Check your signal, then try again. This scan was not recorded.' : null}
            onReload={() => setScenario('trips')}
            tripId={tripId} onSelectTrip={(id) => { setTripId(id); setOutcome(null); }}
            stats={stats} outcome={outcome} onRetry={() => board(last === 'net' ? 'ok' : last)}
            scanning={scanning} onToggleScan={() => setScanning((s) => !s)} onScanToken={board}
            manual={manual} onManualChange={setManual} onSubmitManual={() => board(manual)} busy={false} online={scenario !== 'offline'}
          />
        </div>
      </div>
    </div>
  );
}
