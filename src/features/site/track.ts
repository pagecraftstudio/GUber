/**
 * Markup hooks for company-site analytics (P10). The public site renders these; the dashboard preview and canvas do not (ctx.track is unset),
 * so editing never produces events. The values are catalog properties only (a trip id, a plan id, a section type): never text a person typed.
 * Read by src/lib/analytics/site-events.ts, which validates them again.
 */
type Scalar = string | number | boolean;
export type TrackAttrs = { 'data-track'?: string; 'data-track-props'?: string };

export const trackAttrs = (on: boolean | undefined, event: string, props: Record<string, Scalar> = {}): TrackAttrs =>
  on ? { 'data-track': event, 'data-track-props': JSON.stringify(props) } : {};
