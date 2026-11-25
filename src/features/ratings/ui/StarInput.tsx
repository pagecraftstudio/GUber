'use client';
import { useId } from 'react';

/**
 * 1-5 stars as a radio group: native radios (keyboard arrows, screen readers), stars drawn over them. The visible shape is a filled or outlined star,
 * so the value never depends on colour alone. `label` names the group; `describe(n)` is the accessible text of one option.
 */
export function StarInput({ label, value, onChange, describe, disabled }: { label: string; value: number; onChange: (n: number) => void; describe: (n: number) => string; disabled?: boolean }) {
  const name = useId();
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-sm text-ink-secondary">{label}</legend>
      <div className="flex gap-1" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="relative cursor-pointer">
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" aria-label={describe(n)} />
            <span aria-hidden="true" className={`flex h-11 w-11 items-center justify-center rounded-md border text-2xl leading-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${n <= value ? 'border-line-strong bg-surface-sunken text-ink-primary' : 'border-line-default text-ink-secondary'}`}>
              {n <= value ? '★' : '☆'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Read-only stars + number, for a company or driver average. */
export function StarsDisplay({ average, label }: { average: number; label: string }) {
  const full = Math.round(average);
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-1 text-ink-primary" dir="ltr">
      <span aria-hidden="true">{'★'.repeat(full)}{'☆'.repeat(5 - full)}</span>
    </span>
  );
}
