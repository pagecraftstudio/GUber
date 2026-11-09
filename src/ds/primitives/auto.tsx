'use client';
import { useOptimistic, useState, type ComponentProps, type ReactNode } from 'react';
import { SaveStatus, viewOfInline } from '../feedback/SaveStatus';
import { useInlineSave, type AutoResult } from '../hooks/useInlineSave';
import { cx, FOCUS } from './cx';
import { controlClass } from './Input';
import { Switch } from './Choice';
import { DigitInput } from './Input';

export type AutoOption = readonly [value: string, label: string];
type Labels = ComponentProps<typeof SaveStatus>['labels'];

/** Select that saves the moment it changes, shows the new value at once and rolls back by itself if the server refuses. Behaviour copied from InlineControls. */
export function AutoSelect({ id, value, options, label, save, labels }: { id: string; value: string; options: readonly AutoOption[]; label: string; save: (id: string, v: string) => Promise<AutoResult>; labels: Labels }) {
  const [shown, setShown] = useOptimistic(value);
  const { pending, result, run } = useInlineSave();
  return (
    <div className="flex flex-col gap-1">
      <select aria-label={label} value={shown} disabled={pending} onChange={(e) => { const v = e.target.value; run(() => save(id, v), () => setShown(v)); }} className={cx(controlClass(false), 'h-8 w-auto text-[13px]')}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <SaveStatus view={viewOfInline(result, pending)} labels={labels} />
    </div>
  );
}

/** On/off switch: flips immediately, saves in the background, rolls back if refused. */
export function AutoSwitch({ id, checked, label, save, labels }: { id: string; checked: boolean; label: ReactNode; save: (id: string, next: boolean) => Promise<AutoResult>; labels: Labels }) {
  const [shown, setShown] = useOptimistic(checked);
  const { pending, result, run } = useInlineSave();
  return (
    <div className="flex flex-col gap-1">
      <Switch checked={shown} disabled={pending} label={label} onChange={(next) => run(() => save(id, next), () => setShown(next))} />
      <SaveStatus view={viewOfInline(result, pending)} labels={labels} />
    </div>
  );
}

/** Text or amount input that saves on blur and on Enter, only when the value changed. Digits are normalised as typed. */
export function AutoInput({ id, value, label, save, labels, kind = 'decimal', className }: { id: string; value: string; label: string; save: (id: string, v: string) => Promise<AutoResult>; labels: Labels; kind?: 'decimal' | 'integer' | 'identifier'; className?: string }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  const { pending, result, run } = useInlineSave();
  const commit = () => { if (draft.trim() === saved.trim()) return; const v = draft; run(async () => { const r = await save(id, v); if (r.ok) setSaved(v); return r; }); };
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <DigitInput kind={kind} aria-label={label} value={draft} disabled={pending} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setDraft(saved); }} className={cx('h-8 text-[13px]', FOCUS)} />
      <SaveStatus view={viewOfInline(result, pending)} labels={labels} />
    </div>
  );
}
