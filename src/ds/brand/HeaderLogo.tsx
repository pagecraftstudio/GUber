import { HORIZONTAL_LOCKUP, STACKED_LOCKUP } from './lockupsProvisional';

/**
 * Header logo for the marketplace and the dashboard: the horizontal bilingual lockup on big screens (lg and up),
 * the regular (stacked) bilingual lockup on smaller ones. Both are inline SVG that take the surrounding text colour, so dark mode needs nothing extra.
 * One accessible name ("MASAR") for the pair; the drawings are decorative. Headers never animate.
 */
function Lockup({ mark, className }: { mark: { viewBox: string; d: string }; className: string }) {
  return (
    <svg viewBox={mark.viewBox} aria-hidden="true" focusable="false" className={className} fill="currentColor" fillRule="evenodd">
      <path d={mark.d} />
    </svg>
  );
}

export function HeaderLogo({ className = '' }: { className?: string }) {
  return (
    <span role="img" aria-label="MASAR" className={`inline-flex items-center ${className}`}>
      <Lockup mark={HORIZONTAL_LOCKUP} className="hidden h-9 w-auto lg:block" />
      <Lockup mark={STACKED_LOCKUP} className="block h-10 w-auto lg:hidden" />
    </span>
  );
}
