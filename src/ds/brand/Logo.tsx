import type { CSSProperties } from 'react';

/**
 * INTERIM MASAR logo (redesign Phase 1).
 *
 * Plain-text English wordmark only. The Arabic wordmark is deliberately NOT
 * rendered: it must come from approved vector paths (plan 2.1, D2, D10), never
 * from a UI font and never from the AI-generated PNGs.
 *
 * When the approved SVG master exists, replace the body of this component with
 * the real paths. Keep the props and the exported WORDMARK constants stable so
 * call sites do not change.
 */

export const WORDMARK = {
  text: 'MASAR',
  /** IBM Plex Sans (D3). The CSS variable is set by next/font in Phase 2. */
  fontFamily: 'var(--font-latin, "IBM Plex Sans"), system-ui, sans-serif',
  weight: 500,
  /**
   * Provisional UI tracking. The reference PNG measures far wider (ink gap about
   * 1.5x cap height, stacked hero use); that is a poster setting, not a
   * header setting. Final values are recorded in PHASE-1-BRAND-ASSETS.md
   * once the designer sets them from the vector master.
   */
  trackingEm: 0.32,
} as const;

export type LogoSize = 'sm' | 'md' | 'lg';
export type LogoTone = 'auto' | 'onLight' | 'onDark';

const SIZE_PX: Record<LogoSize, number> = { sm: 14, md: 18, lg: 28 };

export interface LogoProps {
  size?: LogoSize;
  /** onLight = deep green, onDark = white, auto = inherit currentColor. */
  tone?: LogoTone;
  className?: string;
}

const TONE_COLOR: Record<LogoTone, string> = {
  auto: 'currentColor',
  onLight: '#0B3D2E',
  onDark: '#FFFFFF',
};

export function Logo({ size = 'md', tone = 'auto', className }: LogoProps) {
  const style: CSSProperties = {
    fontFamily: WORDMARK.fontFamily,
    fontWeight: WORDMARK.weight,
    fontSize: SIZE_PX[size],
    letterSpacing: `${WORDMARK.trackingEm}em`,
    lineHeight: 1,
    color: TONE_COLOR[tone],
    // Trailing letter-spacing would shift optical centring; trim it.
    marginInlineEnd: `${-WORDMARK.trackingEm}em`,
    // Latin wordmark must stay LTR inside RTL pages.
    direction: 'ltr',
    unicodeBidi: 'isolate',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  };
  return (
    <span role="img" aria-label="MASAR" className={className} style={style}>
      <span aria-hidden="true">{WORDMARK.text}</span>
    </span>
  );
}
