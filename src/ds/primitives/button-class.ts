import { cx, FOCUS } from './cx';

/**
 * Class names of the design-system button. Lives in a plain module (not 'use client') so SERVER components can style a link as a button.
 * A function exported from a client file cannot be called on the server (found by opening the admin pages in a browser).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action hover:bg-action-hover',
  secondary: 'border border-line-strong bg-surface-card text-ink-primary hover:bg-surface-sunken',
  ghost: 'text-ink-primary hover:bg-surface-sunken',
  destructive: 'bg-destructive text-on-destructive hover:bg-destructive-hover',
};
const SIZE: Record<ButtonSize, string> = { md: 'h-9 px-4 text-sm', lg: 'h-11 px-5 text-base' };

export function buttonClass(variant: ButtonVariant, size: ButtonSize, fullWidth?: boolean, extra?: string): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-ds-md font-medium whitespace-nowrap transition-colors duration-(--duration-ds-feedback) ease-ds',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60',
    FOCUS, VARIANT[variant], SIZE[size], fullWidth && 'w-full', extra,
  );
}
