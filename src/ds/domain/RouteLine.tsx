import { cx } from '../primitives/cx';

export interface RouteStop { name: string; time?: string }

/**
 * The signature (plan 2.4, D8): a thin line with stop dots, drawn ONLY from real stop data.
 * Fewer than two stops renders nothing. Never decoration, never animated. Logical layout, so it mirrors in RTL.
 */
export function RouteLine({ stops, size = 'full' }: { stops: RouteStop[]; size?: 'compact' | 'full' }) {
  const first = stops[0], last = stops[stops.length - 1];
  if (!first || !last || stops.length < 2) return null;
  if (size === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-primary" role="group" aria-label={`${first.name} → ${last.name}`}>
        <span className="truncate">{first.name}</span>
        <span aria-hidden="true" className="flex min-w-8 flex-1 items-center"><span className="size-2 rounded-full border-2 border-action" /><span className="h-px flex-1 bg-line-strong" /><span className="size-2 rounded-full bg-action" /></span>
        <span className="truncate">{last.name}</span>
      </div>
    );
  }
  return (
    <ol className="relative flex flex-col text-sm">
      {stops.map((s, i) => {
        const end = i === 0 || i === stops.length - 1;
        return (
          <li key={`${s.name}-${i}`} className="relative flex min-h-9 items-start gap-3 ps-6">
            {i < stops.length - 1 ? <span aria-hidden="true" className="absolute start-[5px] top-3 bottom-[-12px] w-px bg-line-strong" /> : null}
            <span aria-hidden="true" className={cx('absolute start-0 top-1.5 size-[11px] rounded-full border-2 border-action', i === stops.length - 1 ? 'bg-action' : 'bg-surface-card')} />
            <span className={cx('flex-1', end ? 'font-medium text-ink-primary' : 'text-ink-secondary')}>{s.name}</span>
            {s.time ? <span className="tabular-nums text-ink-muted" dir="ltr">{s.time}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Seats booked / boarded against capacity, with the figures in text beside the bar. */
export function OccupancyBar({ booked, boarded, capacity, label, figures, tone = 'neutral' }: { booked: number; boarded?: number; capacity: number; label: string; figures: string; /** `action` paints the main value in the brand colour (boarding progress); the default is the quiet grey of a seat count. */ tone?: 'neutral' | 'action' }) {
  const pct = (n: number) => (capacity > 0 ? Math.min(100, Math.max(0, (n / capacity) * 100)) : 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[13px]"><span className="text-ink-secondary">{label}</span><span className="tabular-nums text-ink-primary">{figures}</span></div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={booked} aria-valuetext={figures} className="relative h-2 overflow-hidden rounded-full bg-surface-sunken">
        <span className={cx('absolute inset-y-0 start-0', tone === 'action' ? 'bg-action' : 'bg-line-strong')} style={{ width: `${pct(booked)}%` }} />
        {boarded !== undefined ? <span className="absolute inset-y-0 start-0 bg-action" style={{ width: `${pct(boarded)}%` }} /> : null}
      </div>
    </div>
  );
}
