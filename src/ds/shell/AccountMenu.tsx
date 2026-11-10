'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx, FOCUS } from '../primitives/cx';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0] ?? '').join('').toUpperCase();

/** Disclosure popover for the signed-in person. Escape closes and returns focus to the button; clicking or tabbing outside closes. Children are the actions (a sign-out form, buttons). */
export function AccountMenu({ label, name, detail, children }: { label: string; name: string; detail?: ReactNode; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    const away = (e: Event) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', away);
    document.addEventListener('focusin', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', away); document.removeEventListener('focusin', away); };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className={cx('inline-flex size-9 items-center justify-center rounded-full bg-surface-sunken text-[13px] font-medium text-ink-primary hover:bg-line-default', FOCUS)}>{initials(name)}</button>
      <div id={id} hidden={!open} className="absolute end-0 top-full z-50 mt-2 w-64 rounded-ds-md border border-line-default bg-surface-card p-1 shadow-md">
        <div className="px-3 py-2"><p className="truncate text-sm font-medium text-ink-primary">{name}</p>{detail ? <div className="truncate text-[13px] text-ink-muted">{detail}</div> : null}</div>
        <div className="my-1 border-t border-line-default" />
        <div onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) setOpen(false); }}>{children}</div>
      </div>
    </div>
  );
}

/** A row inside the account menu. */
export function MenuAction({ children, icon, tone = 'default', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; tone?: 'default' | 'destructive' }) {
  return <button type="button" {...rest} className={cx('flex h-9 w-full items-center gap-2 rounded-ds-sm px-3 text-start text-sm hover:bg-surface-sunken', tone === 'destructive' ? 'text-status-error-fg' : 'text-ink-primary', FOCUS)}>{icon}{children}</button>;
}
