'use client';
import { ChevronRight, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDsText } from '../lang';
import { Button } from '../primitives/Button';
import { cx, FOCUS } from '../primitives/cx';

/** Search + filters + applied chips + clear all. Stateless: the page keeps the filters in the URL, as the bookings filters do today. */
export function FilterBar({ search, children, applied, onRemove, onClear }: { search?: ReactNode; children?: ReactNode; applied: { key: string; label: string }[]; onRemove: (key: string) => void; onClear: () => void }) {
  const t = useDsText();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">{search}{children}</div>
      {applied.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {applied.map((a) => (
            <li key={a.key} className="inline-flex h-7 items-center gap-1 rounded-ds-sm bg-surface-sunken ps-2 pe-1 text-[13px] text-ink-primary">
              {a.label}
              <button type="button" aria-label={t.remove(a.label)} onClick={() => onRemove(a.key)} className={cx('inline-flex size-6 items-center justify-center rounded-ds-sm hover:bg-line-default', FOCUS)}><X size={14} strokeWidth={1.5} aria-hidden="true" /></button>
            </li>
          ))}
          <li><Button variant="ghost" onClick={onClear} className="!h-7 !px-2 text-[13px]">{t.clearAll}</Button></li>
        </ul>
      ) : null}
    </div>
  );
}

/** Label, figure, optional comparison that states what it compares to. No sparklines or decoration. */
export function MetricCard({ label, value, comparison }: { label: string; value: ReactNode; comparison?: ReactNode }) {
  return (
    <div className="rounded-ds-md border border-line-default bg-surface-card p-5">
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="mt-1 text-[32px] leading-tight font-medium text-ink-primary tabular-nums">{value}</p>
      {comparison ? <p className="mt-1 text-[13px] text-ink-muted">{comparison}</p> : null}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-6 gap-y-2 text-sm">
      {items.map((i, n) => <div key={n} className="contents"><dt className="text-ink-muted">{i.label}</dt><dd className="text-ink-primary">{i.value}</dd></div>)}
    </dl>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  const t = useDsText();
  return (
    <nav aria-label={t.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-muted">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1">
              {it.href && !last ? <a href={it.href} className={cx('rounded-ds-sm underline-offset-2 hover:underline', FOCUS)}>{it.label}</a> : <span aria-current={last ? 'page' : undefined} className={last ? 'text-ink-primary' : ''}>{it.label}</span>}
              {!last ? <ChevronRight size={14} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface TabDef { id: string; label: string; panel: ReactNode }
/** Roving tabindex. Arrow keys follow the reading direction, so they are mirrored in RTL. Home and End jump. */
export function Tabs({ tabs, label, dir = 'ltr', initial }: { tabs: TabDef[]; label: string; dir?: 'ltr' | 'rtl'; initial?: string }) {
  const base = useId();
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const go = (id: string) => { setActive(id); refs.current[id]?.focus(); };
  const onKey = (e: KeyboardEvent, i: number) => {
    const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const n = tabs.length;
    const at = (k: number) => tabs[k]?.id;
    const target = e.key === fwd ? at((i + 1) % n) : e.key === back ? at((i - 1 + n) % n) : e.key === 'Home' ? at(0) : e.key === 'End' ? at(n - 1) : undefined;
    if (!target) return;
    go(target);
    e.preventDefault();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line-default">
        {tabs.map((tb, i) => (
          <button key={tb.id} ref={(el) => { refs.current[tb.id] = el; }} role="tab" id={`${base}-t-${tb.id}`} aria-controls={`${base}-p-${tb.id}`} aria-selected={active === tb.id} tabIndex={active === tb.id ? 0 : -1}
            onClick={() => setActive(tb.id)} onKeyDown={(e) => onKey(e, i)}
            className={cx('-mb-px h-10 border-b-2 px-3 text-sm', FOCUS, active === tb.id ? 'border-action font-medium text-ink-primary' : 'border-transparent text-ink-secondary hover:text-ink-primary')}>{tb.label}</button>
        ))}
      </div>
      {tabs.map((tb) => <div key={tb.id} role="tabpanel" id={`${base}-p-${tb.id}`} aria-labelledby={`${base}-t-${tb.id}`} hidden={active !== tb.id} tabIndex={0} className={cx('pt-4', FOCUS)}>{tb.panel}</div>)}
    </div>
  );
}
