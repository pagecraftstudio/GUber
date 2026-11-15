import { CheckCircle2 } from 'lucide-react';

/**
 * The booking-confirmed moment (motion proposal 1): the booked trip's own route draws itself, origin to destination in
 * the reading direction, and the check draws as the line arrives. It is the one deliberate exception to "RouteLine is
 * never animated" (plan D8): real stops only, played once, on the confirmation page only, and the motion lives in
 * src/styles/motion.css (inside `prefers-reduced-motion: no-preference`), so with reduced motion this is a still line.
 * Nothing here is decorative: both names come from the booked route. Pass nothing and use the plain check instead.
 * Logical layout only: in RTL the origin sits at the start (right) and the line draws right to left.
 */
export function ConfirmedRoute({ origin, destination }: { origin: string; destination: string }) {
  if (!origin || !destination) return null;
  return (
    <div role="group" aria-label={`${origin} → ${destination}`} className="ds-route-confirm flex w-full max-w-xs flex-col gap-1.5">
      <div aria-hidden="true" className="flex items-center gap-1">
        <span className="ds-route-origin size-3 shrink-0 rounded-full border-2 border-action bg-surface-card" />
        <span className="ds-route-line h-0.5 min-w-0 flex-1 rounded-full bg-action" />
        <CheckCircle2 size={32} strokeWidth={1.5} className="ds-check shrink-0 text-status-success-fg" />
      </div>
      <div className="flex items-start justify-between gap-3 text-[13px] text-ink-secondary">
        <span className="min-w-0 text-start">{origin}</span>
        <span className="min-w-0 text-end">{destination}</span>
      </div>
    </div>
  );
}
