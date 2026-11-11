'use client';
import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClass, type ButtonSize, type ButtonVariant } from './button-class';
import { cx } from './cx';

export type { ButtonSize, ButtonVariant };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks clicks (no double submit). Focus is kept. */
  loading?: boolean;
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading = false, fullWidth, iconStart, iconEnd, type = 'button', className, children, onClick, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={(e) => { if (loading) { e.preventDefault(); return; } onClick?.(e); }}
      className={buttonClass(variant, size, fullWidth, className)}
    >
      {loading ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" aria-hidden="true" /> : iconStart}
      {children}
      {!loading && iconEnd}
    </button>
  );
}

/** Square icon-only button. `label` is the accessible name and is required. */
export function IconButton({ label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest }: Omit<ButtonProps, 'children' | 'iconStart' | 'iconEnd' | 'fullWidth' | 'loading'> & { label: string; icon: ReactNode }) {
  const dim = size === 'lg' ? 'size-11' : 'size-9';
  return <button {...rest} type={type} aria-label={label} title={label} className={cx(buttonClass(variant, size, false), '!px-0', dim, className)}>{icon}</button>;
}

/** Submit button that reads the parent <form> pending state (server actions). One implementation replaces the old SubmitButtons. */
export function SubmitButton({ children, pendingLabel, ...rest }: Omit<ButtonProps, 'type' | 'loading'> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button {...rest} type="submit" loading={pending}>{pending && pendingLabel ? pendingLabel : children}</Button>;
}
