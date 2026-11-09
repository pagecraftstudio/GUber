export type ClassValue = string | false | null | undefined;
export const cx = (...v: ClassValue[]): string => v.filter(Boolean).join(' ');
/** Shared focus ring (plan 7.1): 2px, offset 2, colour from --ds-focus-ring. Never removed. */
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';
