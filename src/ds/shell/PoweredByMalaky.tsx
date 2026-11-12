import type { CSSProperties } from 'react';

const MARK_URL = '/brand/malaky/malaky-mark.svg';
const MARK_STYLE: CSSProperties = {
  WebkitMaskImage: `url(${MARK_URL})`,
  maskImage: `url(${MARK_URL})`,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
};

/**
 * Quiet studio credit (decision D1): the MALAKY mark at text height next to the
 * credit line. The mark is decorative; the text carries the accessible name.
 * Drawn as a mask so it takes the surrounding text colour and needs no mirroring in RTL.
 */
export function PoweredByMalaky({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span aria-hidden="true" className="inline-block h-4 w-[7px] bg-current opacity-80" style={MARK_STYLE} />
      <span>{text}</span>
    </span>
  );
}
