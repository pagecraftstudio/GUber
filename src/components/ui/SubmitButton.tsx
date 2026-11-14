'use client';

import { useFormStatus } from 'react-dom';
import { buttonClass } from '@/ds/primitives/button-class';

export function SubmitButton({ children, variant = 'primary' }: { children: React.ReactNode; variant?: 'primary' | 'ghost' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant === 'primary' ? 'primary' : 'secondary', 'lg', true)}>
      {pending ? 'Please wait…' : children}
    </button>
  );
}
