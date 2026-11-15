import { flushSync } from 'react-dom';

/** Name shared by the source card and the dialog while the browser morphs one into the other. */
const NAME = 'ds-morph';

function canMorph(): boolean {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Opens something (a details dialog) so it grows out of `source` (the card that was pressed).
 * Uses the browser's View Transitions API: no library, and where it is missing or the person asks for
 * less motion the update simply runs with no animation. `update` must change React state; it runs synchronously
 * inside the transition so the dialog is open when the browser takes the "after" picture.
 */
export function morphOpen(source: Element | null, update: () => void): void {
  if (!source || !canMorph()) { update(); return; }
  const root = document.documentElement;
  const el = source as HTMLElement;
  el.style.viewTransitionName = NAME;
  const t = document.startViewTransition(() => {
    el.style.viewTransitionName = '';
    root.dataset.morphing = '';
    flushSync(update);
  });
  const done = () => { delete root.dataset.morphing; el.style.viewTransitionName = ''; };
  t.finished.then(done, done);
}
