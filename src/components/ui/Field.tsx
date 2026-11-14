'use client';
import { Field as DsField } from '@/ds/primitives/Field';
import { Input } from '@/ds/primitives/Input';

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
    <DsField label={label} hint={hint} required>
      <Input name={name} type={type} size="lg" autoComplete={autoComplete} defaultValue={defaultValue} readOnly={readOnly} minLength={minLength} maxLength={maxLength} />
    </DsField>
  );
}
