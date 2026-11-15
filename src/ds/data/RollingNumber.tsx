'use client';
import { useState } from 'react';
import { formatNumber, type Lang } from '../format';

/**
 * Digit roll for numbers that change while the person is looking (motion proposal 2). It only moves when the value CHANGES:
 * never on first render, never as a count-up. A digit that changed slides out and the new one slides in, up when the value rose and
 * down when it fell; digits that did not change stay still. Works in Latin and Arabic-Indic digits (the text comes from formatNumber).
 *
 * The text content is exactly the formatted number, so assistive tech reads it once and tests read it as before. The outgoing digit
 * is drawn from a data attribute by CSS, so it is never part of the text. The motion itself lives in src/styles/motion.css, inside
 * `prefers-reduced-motion: no-preference`; with reduced motion the new number simply appears.
 */
interface Shown { value: number; text: string; from: string | null; dir: 'up' | 'down'; n: number }

export function RollingNumber({ value, lang }: { value: number; lang: Lang }) {
  const text = formatNumber(value, lang);
  const [shown, setShown] = useState<Shown>({ value, text, from: null, dir: 'up', n: 0 });
  if (shown.value !== value) setShown({ value, text, from: shown.text, dir: value > shown.value ? 'up' : 'down', n: shown.n + 1 });
  const from = shown.from;
  const chars = [...(shown.value === value ? shown.text : text)];
  const old = from === null ? [] : [...from];
  return (
    <span className="ds-tabular inline-flex" dir="ltr">
      {chars.map((c, i) => {
        const o = old[old.length - (chars.length - i)];
        if (from === null || !/\p{Nd}/u.test(c) || o === c) return <span key={`s${i}`}>{c}</span>;
        if (o === undefined) return <span key={`n${shown.n}-${i}`} className="ds-roll-in">{c}</span>;
        const oldLine = <span key="o" aria-hidden="true" data-d={o} className="ds-roll-old hidden" />;
        const newLine = <span key="c" className="block">{c}</span>;
        return (
          <span key={`r${shown.n}-${i}`} className="inline-block h-[1.25em] overflow-hidden align-bottom leading-[1.25em]">
            <span className="ds-roll-col block" data-dir={shown.dir}>
              {shown.dir === 'up' ? [oldLine, newLine] : [newLine, oldLine]}
            </span>
          </span>
        );
      })}
    </span>
  );
}
