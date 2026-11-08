'use client';
import { useOptimistic } from 'react';
import { SaveStatus, viewOfInline } from '@/components/dashboard/SaveStatus';
import { useDashLang } from './lang';
import { PAGE_AR } from './messages';
import { useInlineSave } from './useAutosave';
import { setBusStatusAction, setDriverStatusAction, setRouteActiveAction, type AutoResult } from './autosave-actions';

const sel = 'rounded-lg border border-slate-200 bg-transparent p-1.5 text-xs dark:border-slate-700';
type Opt = readonly [value: string, label: string];

/** Select that saves the moment it changes, shows the new value immediately and rolls back by itself if the server refuses. */
function AutoSelect({ id, value, options, label, save }: { id: string; value: string; options: readonly Opt[]; label: string; save: (id: string, v: string) => Promise<AutoResult> }) {
  const lang = useDashLang();
  const [shown, setShown] = useOptimistic(value);
  const { pending, result, run } = useInlineSave();
  return (
    <div className="flex flex-col gap-0.5">
      <select aria-label={label} value={shown} disabled={pending} onChange={(e) => { const v = e.target.value; run(() => save(id, v), () => setShown(v)); }} className={sel}>
        {options.map(([v, l]) => <option key={v} value={v}>{lang === 'ar' ? PAGE_AR[l] ?? l : l}</option>)}
      </select>
      <SaveStatus view={viewOfInline(result, pending)} />
    </div>
  );
}

export const BusStatusSelect = ({ id, value, plate }: { id: string; value: string; plate: string }) =>
  <AutoSelect id={id} value={value} label={`Status for ${plate}`} save={setBusStatusAction} options={[['active', 'Active'], ['maintenance', 'Maintenance'], ['inactive', 'Inactive']]} />;

export const DriverStatusSelect = ({ id, value, name }: { id: string; value: string; name: string }) =>
  <AutoSelect id={id} value={value} label={`Status for ${name}`} save={setDriverStatusAction} options={[['active', 'Active'], ['inactive', 'Inactive']]} />;

/** Route on/off switch: flips immediately, saves in the background. */
export function RouteActiveSwitch({ id, isActive, name }: { id: string; isActive: boolean; name: string }) {
  const lang = useDashLang();
  const [shown, setShown] = useOptimistic(isActive);
  const { pending, result, run } = useInlineSave();
  const label = shown ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive');
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" role="switch" aria-checked={shown} aria-label={`${name}: ${label}`} disabled={pending}
        onClick={() => run(() => setRouteActiveAction(id, !shown), () => setShown(!shown))}
        className="inline-flex min-h-8 items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
        <span className={`relative h-5 w-9 rounded-full transition-colors ${shown ? 'bg-emerald-600' : 'bg-slate-400'}`}>
          <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${shown ? 'start-[1.125rem]' : 'start-0.5'}`} />
        </span>{label}
      </button>
      <SaveStatus view={viewOfInline(result, pending)} />
    </div>
  );
}
