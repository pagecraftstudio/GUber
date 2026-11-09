'use client';
import { AlertCircle } from 'lucide-react';
import { createContext, useContext, useId, type ReactNode } from 'react';
import { useDsText } from '../lang';
import { cx } from './cx';

interface FieldCtx { id: string; describedBy?: string; invalid: boolean; required: boolean; disabled: boolean }
const Ctx = createContext<FieldCtx | null>(null);

/** Props every control gets from its <Field>. Controls merge these with their own, explicit props win. */
export function useFieldControl(own: { id?: string; 'aria-describedby'?: string; required?: boolean; disabled?: boolean; invalid?: boolean }) {
  const f = useContext(Ctx);
  const describedBy = [own['aria-describedby'], f?.describedBy].filter(Boolean).join(' ') || undefined;
  const invalid = own.invalid ?? f?.invalid ?? false;
  return {
    id: own.id ?? f?.id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid || undefined,
    required: own.required ?? f?.required,
    disabled: own.disabled ?? f?.disabled,
    invalid,
  };
}

export interface FieldProps { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; disabled?: boolean; children: ReactNode; className?: string }

/** Persistent label, optional hint, error text with icon. Wires id, aria-describedby and aria-invalid into the control inside. */
export function Field({ label, hint, error, required = false, disabled = false, children, className }: FieldProps) {
  const id = useId();
  const t = useDsText();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <Ctx.Provider value={{ id, describedBy, invalid: Boolean(error), required, disabled }}>
      <div className={cx('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-sm font-medium text-ink-primary">
          {label}
          {required ? <span className="ms-1 text-ink-muted" aria-hidden="true">*</span> : null}
          {required ? <span className="sr-only"> ({t.required})</span> : null}
        </label>
        {children}
        {hint ? <p id={hintId} className="text-[13px] text-ink-muted">{hint}</p> : null}
        <div aria-live="polite">
          {error ? <p id={errId} className="flex items-start gap-1.5 text-[13px] text-status-error-fg"><AlertCircle size={16} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden="true" />{error}</p> : null}
        </div>
      </div>
    </Ctx.Provider>
  );
}
