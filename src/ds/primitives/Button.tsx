'use client';
import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx, FOCUS } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover',
  secondary: 'border border-line-strong bg-surface-card text-ink-primary hover:bg-surface-sunken',
  ghost: 'text-ink-primary hover:bg-surface-sunken',
  destructive: 'bg-destructive text-on-destructive hover:bg-destructive-hover',
};
const SIZE: Record<ButtonSize, string> = { md: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-base' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and blocks clicks (no double submit). Focus is kept. */
  loading?: boolean;
  fullWidth?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export function buttonClass(variant: ButtonVariant, size: ButtonSize, fullWidth?: boolean, extra?: string): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-ds-md font-medium whitespace-nowrap transition-colors duration-(--duration-ds-feedback) ease-ds',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60',
    FOCUS, VARIANT[variant], SIZE[size], fullWidth && 'w-full', extra,
  );
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
