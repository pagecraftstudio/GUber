'use client';
import { useEffect, useId, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { inputClass } from '@/components/dashboard/FormParts';
import { blankRow, moveRow, type StopRow } from '@/features/stops/draft';
import type { StopIssue } from '@/features/stops/validate';
import { useDashLang } from './lang';
import { STOP_UI, stopIssueText } from './messages';

export type RowErrors = Partial<Record<'name' | 'address' | 'coords' | 'offsetMinutes' | 'stopType', string>>;
/** index -> field -> issue code (from validateStopList or from the server). */
export type StopErrorMap = Record<number, RowErrors>;

export const issuesToMap = (issues: readonly StopIssue[]): { rows: StopErrorMap; list: string[] } => {
  const rows: StopErrorMap = {};
  const list: string[] = [];
  for (const i of issues) {
    if (i.index === null) list.push(i.code);
    else (rows[i.index] ??= {})[i.field as keyof RowErrors] = i.code;
  }
  return { rows, list };
};

/**
 * Ordered stop list. Reordering uses real buttons (Move up / Move down), so it works with keyboard, touch and screen
 * readers; there is no drag-and-drop to need an alternative for. Every structural change is announced in a polite live region.
 */
export function StopsEditor({ rows, setRows, errors, listErrors, showErrors, readOnly = false }: {
  rows: StopRow[]; setRows: Dispatch<SetStateAction<StopRow[]>>; errors: StopErrorMap; listErrors: string[]; showErrors: boolean; readOnly?: boolean;
}) {
  const lang = useDashLang();
  const T = STOP_UI[lang];
  const base = useId();
  const [announce, setAnnounce] = useState('');
  const focusId = useRef<string | null>(null);
  useEffect(() => {
    if (focusId.current) { document.getElementById(focusId.current)?.focus(); focusId.current = null; }
  });

  const label = (r: StopRow) => r.name.trim() || T.unnamed;
  const patch = (uid: string, p: Partial<StopRow>) => setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...p } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= rows.length) return; // end of list: aria-disabled button, nothing happens and focus stays
    const r = rows[i]!;
    focusId.current = `${base}-${r.uid}-${dir === -1 ? 'up' : 'down'}`;
    setRows(moveRow(rows, i, to));
    setAnnounce(T.moved(label(r), to + 1, rows.length));
  };
  const remove = (i: number) => {
    const r = rows[i]!;
    const next = rows.filter((_, k) => k !== i);
    const neighbour = next[Math.min(i, next.length - 1)];
    focusId.current = neighbour ? `${base}-${neighbour.uid}-remove` : `${base}-add`;
    setRows(next);
    setAnnounce(T.removed(label(r), next.length));
  };
  const add = () => {
    const last = rows[rows.length - 1];
    const row = blankRow(last && /^\d+$/.test(last.offsetMinutes) ? Number(last.offsetMinutes) : 0);
    focusId.current = `${base}-${row.uid}-name`;
    setRows([...rows, row]);
    setAnnounce(T.added(rows.length + 1));
  };

  const err = (i: number, f: keyof RowErrors) => (showErrors && errors[i]?.[f] ? stopIssueText(lang, errors[i]![f]!) : null);
  const btn = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-primary hover:bg-surface-sunken';

  return (
    <fieldset className="min-w-0 space-y-3 rounded-2xl border border-line-default p-4">
      <legend className="px-1 text-sm font-bold">{T.title}</legend>
      <p id={`${base}-help`} className="text-xs text-ink-secondary">{T.help}</p>
      <div role="status" aria-live="polite" className="sr-only">{announce}</div>
      {showErrors && listErrors.length > 0 && (
        <ul role="alert" className="list-disc space-y-1 rounded-xl border border-status-error-fg bg-status-error-bg py-3 pe-3 ps-7 text-sm font-semibold text-status-error-fg">
          {listErrors.map((c) => <li key={c}>{stopIssueText(lang, c)}</li>)}
        </ul>
      )}
      {rows.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-secondary">{T.empty}</p>}
      <ol aria-label={T.list} className="space-y-3">
        {rows.map((r, i) => {
          const id = (f: string) => `${base}-${r.uid}-${f}`;
          const e = { name: err(i, 'name'), address: err(i, 'address'), coords: err(i, 'coords'), offset: err(i, 'offsetMinutes'), type: err(i, 'stopType') };
          const dsc = (key: string, has: boolean, hint?: string) => [hint ? id(`${key}-h`) : '', has ? id(`${key}-e`) : ''].filter(Boolean).join(' ') || undefined;
          return (
            <li key={r.uid} className="rounded-xl border border-line-default bg-surface-page p-3" aria-label={`${T.stop(i + 1, rows.length)}: ${label(r)}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-ink-secondary">{T.stop(i + 1, rows.length)}</p>
                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" id={id('up')} aria-disabled={i === 0} aria-label={T.up(label(r))} onClick={() => move(i, -1)} className={`${btn} ${i === 0 ? 'opacity-50' : ''}`}><ArrowUp size={15} aria-hidden="true" /></button>
                    <button type="button" id={id('down')} aria-disabled={i === rows.length - 1} aria-label={T.down(label(r))} onClick={() => move(i, 1)} className={`${btn} ${i === rows.length - 1 ? 'opacity-50' : ''}`}><ArrowDown size={15} aria-hidden="true" /></button>
                    <button type="button" id={id('remove')} aria-label={T.remove(label(r))} onClick={() => remove(i)} className={`${btn} text-status-error-fg`}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={id('name')} className="block text-xs font-semibold text-ink-secondary">{T.name}<span aria-hidden="true" className="text-status-error-fg"> *</span></label>
                  <input id={id('name')} value={r.name} readOnly={readOnly} required maxLength={120} onChange={(ev) => patch(r.uid, { name: ev.target.value })} aria-invalid={e.name ? true : undefined} aria-describedby={dsc('name', !!e.name)} className={inputClass(!!e.name)} />
                  {e.name && <p id={id('name-e')} className="mt-1 text-xs font-semibold text-status-error-fg">{e.name}</p>}
                </div>
                <div>
                  <label htmlFor={id('type')} className="block text-xs font-semibold text-ink-secondary">{T.type}</label>
                  <select id={id('type')} value={r.stopType} disabled={readOnly} onChange={(ev) => patch(r.uid, { stopType: ev.target.value as StopRow['stopType'] })} aria-describedby={dsc('type', !!e.type)} className={inputClass(!!e.type)}>
                    <option value="both">{T.both}</option><option value="pickup">{T.pickup}</option><option value="dropoff">{T.dropoff}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={id('off')} className="block text-xs font-semibold text-ink-secondary">{T.offset}<span aria-hidden="true" className="text-status-error-fg"> *</span></label>
                  <input id={id('off')} type="number" inputMode="numeric" min={0} max={32767} step={1} value={r.offsetMinutes} readOnly={readOnly} required onChange={(ev) => patch(r.uid, { offsetMinutes: ev.target.value })} aria-invalid={e.offset ? true : undefined} aria-describedby={dsc('off', !!e.offset)} className={inputClass(!!e.offset)} />
                  {e.offset && <p id={id('off-e')} className="mt-1 text-xs font-semibold text-status-error-fg">{e.offset}</p>}
                </div>
                <div>
                  <label htmlFor={id('addr')} className="block text-xs font-semibold text-ink-secondary">{T.address}</label>
                  <input id={id('addr')} value={r.address} readOnly={readOnly} maxLength={300} onChange={(ev) => patch(r.uid, { address: ev.target.value })} aria-invalid={e.address ? true : undefined} aria-describedby={dsc('addr', !!e.address)} className={inputClass(!!e.address)} />
                  {e.address && <p id={id('addr-e')} className="mt-1 text-xs font-semibold text-status-error-fg">{e.address}</p>}
                </div>
                <div>
                  <label htmlFor={id('lat')} className="block text-xs font-semibold text-ink-secondary">{T.lat}</label>
                  <input id={id('lat')} dir="ltr" inputMode="decimal" value={r.latitude} readOnly={readOnly} onChange={(ev) => patch(r.uid, { latitude: ev.target.value })} aria-invalid={e.coords ? true : undefined} aria-describedby={dsc('lat', !!e.coords, T.coordsHint)} className={inputClass(!!e.coords)} />
                  <p id={id('lat-h')} className="mt-1 text-xs text-ink-secondary">{T.coordsHint}</p>
                </div>
                <div>
                  <label htmlFor={id('lng')} className="block text-xs font-semibold text-ink-secondary">{T.lng}</label>
                  <input id={id('lng')} dir="ltr" inputMode="decimal" value={r.longitude} readOnly={readOnly} onChange={(ev) => patch(r.uid, { longitude: ev.target.value })} aria-invalid={e.coords ? true : undefined} aria-describedby={dsc('lat', !!e.coords)} className={inputClass(!!e.coords)} />
                </div>
                {e.coords && <p id={id('lat-e')} className="text-xs font-semibold text-status-error-fg sm:col-span-2">{e.coords}</p>}
                <label className="flex min-h-11 items-center gap-2 text-xs font-semibold text-ink-secondary sm:col-span-2">
                  <input type="checkbox" checked={r.isActive} disabled={readOnly} onChange={(ev) => patch(r.uid, { isActive: ev.target.checked })} className="h-4 w-4" />{T.active}
                </label>
              </div>
            </li>
          );
        })}
      </ol>
      {!readOnly && <button type="button" id={`${base}-add`} onClick={add} disabled={rows.length >= 200} className={`${btn} w-full sm:w-auto`}><Plus size={15} aria-hidden="true" />{T.add}</button>}
    </fieldset>
  );
}
