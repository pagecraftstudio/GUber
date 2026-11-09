'use client';
import { Check } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx, FOCUS } from './cx';

const box = 'size-5 shrink-0 accent-[var(--ds-action-primary)] border-line-strong';

export function Checkbox({ label, hint, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" {...rest} aria-describedby={hint ? `${id}-h` : rest['aria-describedby']} className={cx(box, 'mt-0.5', FOCUS)} />
      <label htmlFor={id} className="text-sm text-ink-primary">{label}{hint ? <span id={`${id}-h`} className="block text-[13px] text-ink-muted">{hint}</span> : null}</label>
    </div>
  );
}

export interface RadioOption { value: string; label: ReactNode; hint?: ReactNode; disabled?: boolean }
/** Native radios in a fieldset: arrow-key behaviour and grouping come from the browser. */
export function RadioGroup({ legend, name, value, onChange, options, error }: { legend: ReactNode; name: string; value: string; onChange: (v: string) => void; options: RadioOption[]; error?: ReactNode }) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-e` : undefined} className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-ink-primary">{legend}</legend>
      {options.map((o) => (
        <div key={o.value} className="flex items-start gap-3">
          <input id={`${id}-${o.value}`} type="radio" name={name} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className={cx(box, 'mt-0.5 rounded-full', FOCUS)} />
          <label htmlFor={`${id}-${o.value}`} className="text-sm text-ink-primary">{o.label}{o.hint ? <span className="block text-[13px] text-ink-muted">{o.hint}</span> : null}</label>
        </div>
      ))}
      {error ? <p id={`${id}-e`} className="text-[13px] text-status-error-fg">{error}</p> : null}
    </fieldset>
  );
}

/** role="switch" button. Controlled. Label is always visible, so state is never colour only. */
export function Switch({ checked, onChange, label, disabled, describedBy }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode; disabled?: boolean; describedBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-describedby={describedBy} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('inline-flex min-h-9 items-center gap-3 text-sm text-ink-primary disabled:cursor-not-allowed disabled:opacity-60 rounded-ds-sm', FOCUS)}>
      <span aria-hidden="true" className={cx('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-(--duration-ds-feedback)', checked ? 'border-action bg-action' : 'border-line-strong bg-surface-sunken')}>
        <span className={cx('absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full transition-[inset-inline-start] duration-(--duration-ds-feedback)', checked ? 'start-[1.125rem] bg-on-action' : 'start-0.5 bg-ink-muted')} />
        {checked ? <Check size={10} strokeWidth={2} className="absolute start-1 text-on-action" /> : null}
      </span>
      {label}
    </button>
  );
}
