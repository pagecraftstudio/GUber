import { FOCUS } from '../primitives/cx';

/** First focusable element on every shell. Target is the shell's <main id="main-content">. */
export function SkipLink({ label }: { label: string }) {
  return <a href="#main-content" className={`sr-only rounded-ds-md bg-surface-card px-4 py-2 text-sm font-medium text-ink-primary focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] ${FOCUS}`}>{label}</a>;
}
