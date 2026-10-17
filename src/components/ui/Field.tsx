type FieldProps = {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  defaultValue?: string;
  readOnly?: boolean;
  minLength?: number;
  maxLength?: number;
  hint?: string;
};

export function Field({ label, name, type = 'text', autoComplete, defaultValue, readOnly, minLength, maxLength, hint }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        readOnly={readOnly}
        minLength={minLength}
        maxLength={maxLength}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 read-only:bg-slate-100 read-only:text-slate-600"
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
