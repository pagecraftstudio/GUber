'use client';
import type { ReactNode } from 'react';
import { formatDuration, formatMoney, formatNumber, formatTime, type Lang } from '../format';
import { useDsLang } from '../lang';
import { RouteLine, type RouteStop } from './RouteLine';

export interface TripCardProps {
  operator: { name: string; logoUrl?: string | null };
  departureAt: string;
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
        <p className="text-sm font-medium text-ink-primary">{p.operator.name}</p>
        {p.price ? <p className="text-lg font-medium text-ink-primary tabular-nums">{formatMoney(p.price.amount, p.price.currency, lang)}</p> : null}
      </header>
      <div className="flex items-baseline gap-3 tabular-nums">
        <span className="text-2xl font-medium text-ink-primary">{formatTime(p.departureAt, lang, { timeZone: p.timeZone })}</span>
        {p.arrivalAt ? <><span className="text-ink-muted" aria-hidden="true">–</span><span className="text-2xl font-medium text-ink-primary">{formatTime(p.arrivalAt, lang, { timeZone: p.timeZone })}</span></> : null}
        {p.durationMinutes ? <span className="ms-auto text-[13px] text-ink-muted">{formatDuration(p.durationMinutes, lang)}</span> : null}
      </div>
      {p.stops ? <RouteLine stops={p.stops} size="compact" /> : null}
      <footer className="flex items-center justify-between gap-3">
        {p.seatsLeft != null ? <p className="text-[13px] text-ink-secondary">{soldOut ? p.soldOutLabel : p.seatsLeftLabel(formatNumber(p.seatsLeft, lang))}</p> : <span />}
        {p.action}
      </footer>
    </article>
  );
}
