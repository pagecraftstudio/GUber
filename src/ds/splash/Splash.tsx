import { ARABIC_MARK } from '../brand/arabicMarkProvisional';

/**
 * Loading reveal: the Arabic mark draws itself as an outline, then fills, holds briefly and the screen fades away. Pure CSS
 * (src/styles/motion.css), played once per session by splashScript. It never plays with reduced motion (the element stays hidden),
 * and it ignores pointer input, so it can never block a click. It is decoration only: hidden from assistive tech.
 */
export function Splash() {
  return (
    <div aria-hidden="true" className="ds-splash hidden pointer-events-none fixed inset-0 z-[100] items-center justify-center bg-surface-page text-ink-primary">
      <svg viewBox={ARABIC_MARK.viewBox} className="h-[min(38vh,15rem)] w-auto" fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round">
        <path className="ds-splash-mark" pathLength={1} d={ARABIC_MARK.d} fillRule="evenodd" />
      </svg>
    </div>
  );
}
