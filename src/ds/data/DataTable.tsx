'use client';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useDsText } from '../lang';
import { EmptyState, ErrorState, SkeletonTable } from '../feedback/States';
import { cx, FOCUS } from '../primitives/cx';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Numbers and money: right-aligned in LTR (end), tabular figures. */
  numeric?: boolean;
  sortable?: boolean;
  /** Shown as the card title under 768px. */
  primary?: boolean;
  /** Hidden in the stacked card layout. */
  hideOnCard?: boolean;
}
export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export interface DataTableProps<T> {
  /** Required accessible name. Rendered as a screen-reader caption. */
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowId: (row: T) => string;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  rowActions?: (row: T) => ReactNode;
  actionsHeader?: string;
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  density?: 'comfortable' | 'dense';
  loading?: boolean;
  error?: ReactNode;
  onRetry?: () => void;
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
}

const nextSort = (cur: SortState, key: string): SortState => (!cur || cur.key !== key ? { key, dir: 'asc' } : cur.dir === 'asc' ? { key, dir: 'desc' } : null);

/** Sticky header, sortable columns (aria-sort), row actions, selection, loading / empty / error. Under 768px it becomes a stacked card list with the same actions. */
export function DataTable<T>(p: DataTableProps<T>) {
  const t = useDsText();
  if (p.loading) return <SkeletonTable />;
  if (p.error) return <ErrorState description={p.error} onRetry={p.onRetry} />;
  if (p.rows.length === 0) return <EmptyState title={p.empty?.title ?? ''} description={p.empty?.description} action={p.empty?.action} />;

  const rowH = p.density === 'dense' ? 'h-10' : 'h-12';
  const sel = p.selected;
  const allIds = p.rows.map(p.rowId);
  const allOn = !!sel && allIds.every((i) => sel.has(i));
  const toggle = (id: string) => { if (!sel || !p.onSelectedChange) return; const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); p.onSelectedChange(n); };
  const toggleAll = () => p.onSelectedChange?.(allOn ? new Set() : new Set(allIds));
  const primary = p.columns.find((c) => c.primary) ?? p.columns[0];
  if (!primary) return null;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-ds-md border border-line-default bg-surface-card md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{p.caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface-sunken text-start text-[13px] font-medium text-ink-secondary">
            <tr>
              {sel ? <th scope="col" className="w-10 ps-3 text-start"><input type="checkbox" aria-label={t.selectAll} checked={allOn} onChange={toggleAll} className={cx('size-4 align-middle accent-[var(--ds-action-primary)]', FOCUS)} /></th> : null}
              {p.columns.map((c) => {
                const active = p.sort?.key === c.key ? p.sort.dir : null;
                return (
                  <th key={c.key} scope="col" aria-sort={c.sortable ? (active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none') : undefined} className={cx('px-3 py-2.5 font-medium', c.numeric ? 'text-end' : 'text-start')}>
                    {c.sortable && p.onSortChange ? (
                      <button type="button" onClick={() => p.onSortChange!(nextSort(p.sort ?? null, c.key))} className={cx('-mx-1 inline-flex items-center gap-1 rounded-ds-sm px-1', FOCUS)}>
                        {c.header}
                        {active === 'asc' ? <ArrowUp size={14} strokeWidth={1.5} aria-hidden="true" /> : active === 'desc' ? <ArrowDown size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronsUpDown size={14} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />}
                        {active ? <span className="sr-only">, {active === 'asc' ? t.sortedAsc : t.sortedDesc}</span> : null}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
              {p.rowActions ? <th scope="col" className="px-3 py-2.5 text-end"><span className="sr-only">{p.actionsHeader}</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-default">
            {p.rows.map((r) => {
              const id = p.rowId(r);
              return (
                <tr key={id} aria-selected={sel ? sel.has(id) : undefined} className={cx(rowH, 'hover:bg-surface-page')}>
                  {sel ? <td className="ps-3"><input type="checkbox" aria-label={t.selectRow} checked={sel.has(id)} onChange={() => toggle(id)} className={cx('size-4 align-middle accent-[var(--ds-action-primary)]', FOCUS)} /></td> : null}
                  {p.columns.map((c) => <td key={c.key} className={cx('px-3 text-ink-primary', c.numeric && 'text-end tabular-nums')}>{c.cell(r)}</td>)}
                  {p.rowActions ? <td className="px-3 text-end">{p.rowActions(r)}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={p.caption}>
        {p.rows.map((r) => (
          <li key={p.rowId(r)} className="rounded-ds-md border border-line-default bg-surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-base font-medium text-ink-primary">{primary.cell(r)}</div>
              {p.rowActions ? <div className="shrink-0">{p.rowActions(r)}</div> : null}
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {p.columns.filter((c) => c !== primary && !c.hideOnCard).map((c) => (
                <div key={c.key} className="contents"><dt className="text-ink-muted">{c.header}</dt><dd className={cx('text-ink-primary', c.numeric && 'tabular-nums')}>{c.cell(r)}</dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
