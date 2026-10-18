import { fieldMessage } from './messages';

type Common = {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  /** error code for this field (see messages.ts) */
  error?: string;
  maxLength?: number;
  placeholder?: string;
};

const INPUT =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 aria-[invalid=true]:border-red-400';

function Shell({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p id={`${id}-err`} role="alert" className="text-xs text-red-700">{fieldMessage(error)}</p> : null}
    </div>
  );
}

export function AdminField(p: Common & { type?: 'text' | 'email' | 'tel' | 'number'; autoComplete?: string; min?: number; max?: number }) {
  const describedBy = p.error ? `${p.name}-err` : p.hint ? `${p.name}-hint` : undefined;
  return (
    <Shell id={p.name} label={p.label} hint={p.hint} error={p.error}>
      <input
        id={p.name}
        name={p.name}
        type={p.type ?? 'text'}
        required={p.required}
        defaultValue={p.defaultValue}
        maxLength={p.maxLength}
        placeholder={p.placeholder}
        autoComplete={p.autoComplete ?? 'off'}
        min={p.min}
        max={p.max}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={describedBy}
        className={INPUT}
      />
    </Shell>
  );
}

export function AdminTextarea(p: Common & { rows?: number }) {
  const describedBy = p.error ? `${p.name}-err` : p.hint ? `${p.name}-hint` : undefined;
  return (
    <Shell id={p.name} label={p.label} hint={p.hint} error={p.error}>
      <textarea
        id={p.name}
        name={p.name}
        required={p.required}
        defaultValue={p.defaultValue}
        maxLength={p.maxLength}
        placeholder={p.placeholder}
        rows={p.rows ?? 3}
        aria-invalid={p.error ? true : undefined}
        aria-describedby={describedBy}
        className={INPUT}
      />
    </Shell>
  );
}

export function AdminSelect(p: Common & { options: { value: string; label: string }[] }) {
  return (
    <Shell id={p.name} label={p.label} hint={p.hint} error={p.error}>
      <select id={p.name} name={p.name} required={p.required} defaultValue={p.defaultValue} aria-invalid={p.error ? true : undefined} className={INPUT}>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Shell>
  );
}
