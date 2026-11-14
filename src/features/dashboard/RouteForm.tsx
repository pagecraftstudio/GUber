'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FormField, FormResult, inputClass, PlanLimitNotice, SubmitButton } from '@/components/dashboard/FormParts';
import { fingerprint, rowsFromStops, serializeStops, toDraft, type StopRow } from '@/features/stops/draft';
import type { Stop } from '@/features/stops/types';
import { validateStopList } from '@/features/stops/validate';
import { allowanceFor, blocksSubmit, type PlanUsage } from '@/features/subscriptions/usage';
import { liveUsage } from './CreateForms';
import { saveRouteFormAction } from './form-actions';
import { useDashLang } from './lang';
import { FORM_TEXT, fieldErrorText, ROUTE_UI } from './messages';
import { issuesToMap, StopsEditor, type StopErrorMap } from './StopsEditor';
import { useActionForm } from './useActionForm';

export type RouteFormRoute = { id: string; name: string; code: string | null; originName: string; destinationName: string; description: string | null };

/** Route fields + ordered stops in one form: one submit, one server action, one atomic stop save in Postgres. */
export function RouteForm({ route, stops, usage, readOnly = false }: { route?: RouteFormRoute; stops: Stop[]; usage: PlanUsage | null; readOnly?: boolean }) {
  const lang = useDashLang();
  const L = ROUTE_UI[lang];
  const uid = useId();
  const creating = !route;
  const [rows, setRows] = useState<StopRow[]>(() => rowsFromStops(stops));
  const [showErrors, setShowErrors] = useState(false);
  const fp = fingerprint(stops);
  const lastFp = useRef(fp);
  useEffect(() => { // server data changed (after a save): take the saved ids/order, so the next save updates instead of re-inserting
    if (lastFp.current !== fp) { lastFp.current = fp; setRows(rowsFromStops(stops)); setShowErrors(false); }
  }, [fp, stops]);

  const issues = useMemo(() => validateStopList(rows.map(toDraft)), [rows]);
  const clientMap = useMemo(() => issuesToMap(issues), [issues]);
  const [a11yMsg, setA11yMsg] = useState('');
  const limitBlocked = (st: Parameters<typeof liveUsage>[1]) => creating && blocksSubmit(allowanceFor(liveUsage(usage, st), 'max_routes'));
  const { state, pending, ref, onSubmit } = useActionForm(saveRouteFormAction, { isBlocked: limitBlocked });
  const current = liveUsage(usage, state);
  const blocked = creating && blocksSubmit(allowanceFor(current, 'max_routes'));

  // server-side stop errors ("3.name" -> code) are shown next to the row until the user edits again
  const serverMap = useMemo<StopErrorMap>(() => {
    const m: StopErrorMap = {};
    if (state.status !== 'error' || !state.fields) return m;
    for (const [k, v] of Object.entries(state.fields)) {
      const hit = /^(\d+)\.(name|address|latitude|longitude|offsetMinutes|stopType)$/.exec(k);
      if (hit) (m[Number(hit[1])] ??= {})[hit[2] === 'latitude' || hit[2] === 'longitude' ? 'coords' : (hit[2] as 'name')] = v;
    }
    return m;
  }, [state]);
  const errors = Object.keys(serverMap).length && !showErrors ? serverMap : clientMap.rows;
  const fieldErr = (n: string) => (state.status === 'error' && state.fields?.[n] ? fieldErrorText(lang, state.fields[n]!) : null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (readOnly) return e.preventDefault();
    setShowErrors(true);
    if (issues.length) {
      e.preventDefault();
      setA11yMsg(FORM_TEXT[lang].fixErrors(issues.length));
      const first = ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      requestAnimationFrame(() => (ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? first)?.focus());
      return;
    }
    setA11yMsg('');
    onSubmit(e);
  };

  return (
    <form ref={ref} onSubmit={submit} aria-labelledby={`${uid}-t`} className="space-y-4">
      <h2 id={`${uid}-t`} className="sr-only">{creating ? L.addRoute : L.editRoute}</h2>
      {route && <input type="hidden" name="id" value={route.id} />}
      {creating && <PlanLimitNotice usage={current} resource="max_routes" id={`${uid}-limit`} />}
      {readOnly && <p role="status" className="rounded-xl border border-line-strong bg-status-info-bg px-3.5 py-3 text-sm text-ink-link">{L.readOnly}</p>}
      <div className="grid gap-3 rounded-2xl border border-line-default bg-surface-card p-4 sm:grid-cols-2">
        <FormField name="name" label={L.name} required defaultValue={route?.name} error={fieldErr('name')} />
        <FormField name="code" label={L.code} defaultValue={route?.code ?? ''} error={fieldErr('code')} />
        <FormField name="originName" label={L.origin} required defaultValue={route?.originName} error={fieldErr('originName')} />
        <FormField name="destinationName" label={L.destination} required defaultValue={route?.destinationName} error={fieldErr('destinationName')} />
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-d`} className="block text-xs font-semibold text-ink-secondary">{L.description}</label>
          <textarea id={`${uid}-d`} name="description" rows={2} maxLength={1000} defaultValue={route?.description ?? ''} className={inputClass(false)} />
        </div>
      </div>
      <StopsEditor rows={rows} setRows={setRows} errors={errors} listErrors={clientMap.list} showErrors={showErrors || Object.keys(serverMap).length > 0} readOnly={readOnly} />
      <input type="hidden" name="stops" value={serializeStops(rows)} />
      <div role="alert" aria-live="assertive" className="sr-only">{a11yMsg}</div>
      {!readOnly && (
        <div className="space-y-3">
          <SubmitButton pending={pending} blocked={blocked} describedBy={`${uid}-limit`}>{creating ? L.create : L.save}</SubmitButton>
          {blocked && <p className="text-xs font-semibold text-status-error-fg">{FORM_TEXT[lang].limitBlocked}</p>}
        </div>
      )}
      <FormResult state={state} resource={creating ? 'max_routes' : undefined} />
    </form>
  );
}
