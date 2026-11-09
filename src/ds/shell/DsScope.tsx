import type { ReactNode } from 'react';
import { isSurfaceScoped, type DsSurface } from '../scope';

/**
 * Wraps one surface's layout. When the surface is on the allow-list it sets data-ds="masar", which switches on the
 * scoped bridge, base styles and fonts (src/styles). When it is not, children render untouched with no extra DOM.
 * `display: contents` keeps layout identical: the wrapper has no box, custom properties and fonts still inherit.
 * Server component: reads env per request. No portals exist in the app, so nothing escapes the wrapper.
 */
export function DsScope({ surface, companyId, children }: { surface: DsSurface; companyId?: string | null; children: ReactNode }) {
  if (!isSurfaceScoped(surface, companyId)) return <>{children}</>;
  return (
    <div data-ds="masar" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
