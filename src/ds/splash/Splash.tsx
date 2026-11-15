import type { CSSProperties } from 'react';
import { ARABIC_MARK, MARK_PEN } from '../brand/arabicMarkProvisional';

const [, , vbW, vbH] = ARABIC_MARK.viewBox.split(' ');

/** One mask per layer: the pen strokes, each drawn on in turn. `lag` copies are the same strokes a hair later. */
function Pen({ id, lag }: { id: string; lag?: boolean }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={vbW} height={vbH}>
      {MARK_PEN.strokes.map((s, i) => (
        <path key={i} d={s.d} pathLength={1} className={lag ? 'ds-splash-pen ds-splash-lag' : 'ds-splash-pen'} stroke="white" strokeWidth={MARK_PEN.maskWidth} style={{ '--share': s.share, '--at': s.at } as CSSProperties} />
      ))}
    </mask>
  );
}

/**
 * Loading reveal: the Arabic mark is written on from right to left, stroke by stroke (the loop, the teeth, the tall stem, the last
 * letter with its tail), at one steady pen speed. A thin accent edge travels at the pen tip. Pure CSS (src/styles/motion.css), once
 * per session via splashScript, never with reduced motion, never in the way of a click, hidden from assistive tech.
 */
export function Splash() {
  return (
    <div aria-hidden="true" className="ds-splash hidden pointer-events-none fixed inset-0 z-[100] items-center justify-center bg-surface-page">
      <svg viewBox={ARABIC_MARK.viewBox} className="h-[min(42vh,17rem)] w-auto">
        <defs><Pen id="ds-splash-lead" /><Pen id="ds-splash-trail" lag /></defs>
        <path d={ARABIC_MARK.d} className="fill-accent" mask="url(#ds-splash-lead)" />
        <path d={ARABIC_MARK.d} className="fill-action" mask="url(#ds-splash-trail)" />
      </svg>
    </div>
  );
}
