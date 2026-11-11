'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Field } from '@/ds/primitives/Field';
import { Input, Select, Textarea } from '@/ds/primitives/Input';
import { fieldMessage } from '../messages';

/**
 * React empties a form after its server action returns, so a failed submit would wipe what the person typed (the old forms did).
 * This keeps a copy taken at submit time and feeds it back as the fields' default value, so the reset restores it.
 */
export function useFormDraft() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  return {
    onSubmit: (e: FormEvent<HTMLFormElement>) => setDraft(Object.fromEntries([...new FormData(e.currentTarget)].filter((x): x is [string, string] => typeof x[1] === 'string'))),
    value: (name: string, fallback = '') => draft[name] ?? fallback,
  };
}

type Common = { label: string; name: string; required?: boolean; defaultValue?: string; hint?: ReactNode; /** error code for this field (see messages.ts) */ error?: string; maxLength?: number; placeholder?: string };

/** Same props as the old AdminField family, drawn with the design-system controls. The error code is turned into text here, so a raw library message never reaches the screen. */
export function AdminField(p: Common & { type?: 'text' | 'email' | 'tel' | 'number'; autoComplete?: string; min?: number; max?: number }) {
  const ltr = p.type === 'email' || p.type === 'tel';
  return (
    <Field label={p.label} required={p.required} hint={p.hint} error={fieldMessage(p.error)}>
      <Input name={p.name} type={p.type ?? 'text'} defaultValue={p.defaultValue} maxLength={p.maxLength} placeholder={p.placeholder} autoComplete={p.autoComplete ?? 'off'} min={p.min} max={p.max} dir={ltr ? 'ltr' : undefined} />
    </Field>
  );
}

export function AdminTextarea(p: Common & { rows?: number }) {
  return (
    <Field label={p.label} required={p.required} hint={p.hint} error={fieldMessage(p.error)}>
      <Textarea name={p.name} defaultValue={p.defaultValue} maxLength={p.maxLength} placeholder={p.placeholder} rows={p.rows ?? 3} />
    </Field>
  );
}

export function AdminSelect(p: Common & { options: { value: string; label: string }[] }) {
  return (
    <Field label={p.label} required={p.required} hint={p.hint} error={fieldMessage(p.error)}>
      <Select name={p.name} defaultValue={p.defaultValue}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
    </Field>
  );
}
