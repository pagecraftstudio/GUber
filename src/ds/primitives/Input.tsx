'use client';
import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { normalizeDigits } from '../format/normalize-digits';
import { useFieldControl } from './Field';
import { cx, FOCUS } from './cx';

export const controlClass = (invalid: boolean, size: 'md' | 'lg' = 'md') =>
  cx(
    'block w-full rounded-ds-sm border bg-surface-card text-ink-primary placeholder:text-ink-muted transition-colors duration-(--duration-ds-feedback) ease-ds',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted read-only:bg-surface-sunken',
    invalid ? 'border-status-error-fg' : 'border-line-strong',
    size === 'lg' ? 'h-11 px-3 text-base' : 'h-9 px-3 text-sm',
    FOCUS,
  );

type Common = { size?: 'md' | 'lg'; invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & Common>(function Input({ size = 'md', invalid, className, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, 'aria-describedby': rest['aria-describedby'], required: rest.required, disabled: rest.disabled, invalid });
  const { invalid: inv, ...aria } = f;
  return <input ref={ref} {...rest} {...aria} className={cx(controlClass(inv, size), className)} />;
});

export type DigitKind = 'integer' | 'decimal' | 'tel' | 'identifier';
const INPUT_MODE: Record<DigitKind, 'numeric' | 'decimal' | 'tel' | 'text'> = { integer: 'numeric', decimal: 'decimal', tel: 'tel', identifier: 'text' };

/**
 * For phone, amount, seat count, student ID and reference search (plan 5.7 rule 5). Arabic-Indic and Persian digits are
 * converted to ASCII as the person types, so what they see matches what is sent. The server normalises again and is the authority.
 * Always left-to-right: these values are identifiers or numbers.
 */
export const DigitInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'size'> & Common & { kind: DigitKind }>(function DigitInput({ kind, onChange, ...rest }, ref) {
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const n = normalizeDigits(v);
    if (n !== v) e.target.value = n;
    onChange?.(e);
  };
  return <Input ref={ref} {...rest} type={kind === 'tel' ? 'tel' : 'text'} inputMode={INPUT_MODE[kind]} dir="ltr" autoComplete={rest.autoComplete ?? (kind === 'tel' ? 'tel' : 'off')} onChange={handle} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(function Textarea({ size: _s, invalid, className, rows = 4, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, 'aria-describedby': rest['aria-describedby'], required: rest.required, disabled: rest.disabled, invalid });
  const { invalid: inv, ...aria } = f;
  return <textarea ref={ref} rows={rows} {...rest} {...aria} className={cx(controlClass(inv), 'h-auto min-h-20 py-2', className)} />;
});

export const Select = forwardRef<HTMLSelectElement, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & Common>(function Select({ size = 'md', invalid, className, children, ...rest }, ref) {
  const f = useFieldControl({ id: rest.id, 'aria-describedby': rest['aria-describedby'], required: rest.required, disabled: rest.disabled, invalid });
  const { invalid: inv, ...aria } = f;
  return (
    <span className="relative block">
      <select ref={ref} {...rest} {...aria} className={cx(controlClass(inv, size), 'appearance-none pe-9', className)}>{children}</select>
      <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    </span>
  );
});

/** Native pickers: evergreen browsers (D7) all ship them. The digits inside follow the browser/OS locale, which the app cannot control. */
export const DatePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & Common>(function DatePicker(p, ref) { return <Input ref={ref} {...p} type="date" dir="ltr" />; });
export const TimePicker = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & Common>(function TimePicker(p, ref) { return <Input ref={ref} {...p} type="time" dir="ltr" />; });
