'use client';
import { useEffect, useId, useState, type ReactElement, cloneElement } from 'react';

/** Short text hint for an icon or truncated label. Shows on hover and focus, hoverable, closes on Escape (WCAG 1.4.13). Never put essential information here. */
export function Tooltip({ text, children }: { text: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open]);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span id={id} role="tooltip" hidden={!open} className="absolute bottom-full start-1/2 z-40 mb-1 w-max max-w-56 -translate-x-1/2 rounded-ds-sm bg-ink-primary px-2 py-1 text-xs text-surface-card rtl:translate-x-1/2">{text}</span>
    </span>
  );
}
