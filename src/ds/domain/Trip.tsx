'use client';
import type { ReactNode } from 'react';
import { formatDuration, formatMoney, formatNumber, formatTime, type Lang } from '../format';
import { useDsLang } from '../lang';
import { RouteLine, type RouteStop } from './RouteLine';

export interface TripCardProps {
  /** `tile` is the company mark (D5 allows tenant colour here, already validated by `tenantAccent`). `onClick` opens the operator profile. */
  operator: { name: string; logoUrl?: string | null; tile?: { text: string; accent: string; onAccent: string }; onClick?: () => void };
  departureAt?: string;
  /** Preformatted wall-clock times for sources that store local "HH:MM" strings instead of instants. Win over `departureAt`/`arrivalAt`. */
  departureText?: string;
  arrivalText?: string;
  /** Small extra line under the route (stop names, bus model). */
  note?: ReactNode;
  /** Shown under the price (e.g. the go-and-return price). */
  priceNote?: ReactNode;
  /** Marks a low seat count in warning colour. */
  lowSeats?: boolean;
  arrivalAt?: string | null;
  durationMinutes?: number | null;
  seatsLeft?: number | null;
  price?: { amount: number; currency: string } | null;
  stops?: RouteStop[];
  timeZone?: string;
  /** Exactly one action (for example a Button "Select seats"). */
  action: ReactNode;
  lang?: Lang;
  seatsLeftLabel: (formatted: string) => string;
  soldOutLabel: string;
}

/** Operator, departure, arrival, duration, seats left, price, route line, one action. Every field renders only when its data exists (plan 7.4). */
export function TripCard(p: TripCardProps) {
  const lang = useDsLang(p.lang);
  const soldOut = p.seatsLeft === 0;
  return (
    <article className="flex flex-col gap-4 rounded-ds-md border border-line-default bg-surface-card p-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {p.operator.tile ? <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-ds-sm text-[13px] font-medium" style={{ background: p.operator.tile.accent, color: p.operator.tile.onAccent }}>{p.operator.tile.text}</span> : null}
          {p.operator.onClick
            ? <button type="button" onClick={p.operator.onClick} className="truncate rounded-ds-sm text-start text-sm font-medium text-ink-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{p.operator.name}</button>
            : <p className="truncate text-sm font-medium text-ink-primary">{p.operator.name}</p>}
        </div>
        {p.price ? <div className="shrink-0 text-end"><p className="text-lg font-medium text-ink-primary tabular-nums">{formatMoney(p.price.amount, p.price.currency, lang)}</p>{p.priceNote ? <p className="text-[13px] text-ink-muted">{p.priceNote}</p> : null}</div> : null}
      </header>
      <div className="flex items-baseline gap-3 tabular-nums">
        <span className="text-2xl font-medium text-ink-primary">{p.departureText ?? (p.departureAt ? formatTime(p.departureAt, lang, { timeZone: p.timeZone }) : '')}</span>
        {p.arrivalText || p.arrivalAt ? <><span className="text-ink-muted" aria-hidden="true">–</span><span className="text-2xl font-medium text-ink-primary">{p.arrivalText ?? formatTime(p.arrivalAt as string, lang, { timeZone: p.timeZone })}</span></> : null}
        {p.durationMinutes ? <span className="ms-auto text-[13px] text-ink-muted">{formatDuration(p.durationMinutes, lang)}</span> : null}
      </div>
      {p.stops ? <RouteLine stops={p.stops} size="compact" /> : null}
      {p.note ? <p className="text-[13px] text-ink-muted">{p.note}</p> : null}
      <footer className="flex items-center justify-between gap-3">
        {p.seatsLeft != null ? <p className={p.lowSeats && !soldOut ? 'text-[13px] font-medium text-status-warning-fg' : 'text-[13px] text-ink-secondary'}>{soldOut ? p.soldOutLabel : p.seatsLeftLabel(formatNumber(p.seatsLeft, lang))}</p> : <span />}
        {p.action}
      </footer>
    </article>
  );
}
