'use client';
import type { CSSProperties, ReactNode } from 'react';
import { Identifier } from '../format/Identifier';
import { StatusBadge } from '../data/StatusBadge';
import { RouteLine, type RouteStop } from './RouteLine';

export interface TicketProps {
  company: { name: string; logoUrl?: string | null };
  /** Server-derived, already validated (plan 5.4). Only these two reach CSS, as variables, never as a style string from user input. */
  tenant?: { accent: string; onAccent: string };
  reference: string;
  /** The QR drawing, produced by the existing qrcode code. The payload stays Latin and is never shown as text. */
  qr: ReactNode;
  passengerName: string;
  seatLabel: string;
  whenText: string;
  stops: RouteStop[];
  /** Only when known. A ticket reopened later must not claim a payment state the caller does not have. */
  paymentStatus?: string;
  /** Extra rows after the main grid (bus plate, arrival, student ID...), already formatted. */
  details?: { label: string; value: ReactNode }[];
  /** Printed under the QR (support address, hotline). */
  footer?: ReactNode;
  labels: { reference: string; passenger: string; seat: string; departure: string };
}

/** The one rich object in the product (xl radius, only here). Printable: the page keeps its borders and drops the screen chrome. */
export function Ticket(p: TicketProps) {
  const vars = p.tenant ? ({ '--tenant-accent': p.tenant.accent, '--tenant-on-accent': p.tenant.onAccent } as CSSProperties) : undefined;
  return (
    <article style={vars} className="mx-auto w-full max-w-md overflow-hidden rounded-ds-xl border border-line-default bg-surface-card text-ink-primary print:max-w-none print:break-inside-avoid">
      <header className="flex items-center gap-3 px-6 py-4" style={{ background: 'var(--tenant-accent, var(--ds-action-primary))', color: 'var(--tenant-on-accent, var(--ds-action-on-primary))' }}>
        {p.company.logoUrl ? <img src={p.company.logoUrl} alt="" className="size-8 rounded-ds-sm object-cover" /> : null}
        <p className="text-base font-medium">{p.company.name}</p>
      </header>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[13px] text-ink-muted">{p.labels.reference}</p><p className="mt-0.5 text-xl font-medium"><Identifier value={p.reference} copy /></p></div>
          {p.paymentStatus ? <StatusBadge domain="payment" value={p.paymentStatus} /> : null}
        </div>
        <RouteLine stops={p.stops} />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-ink-muted">{p.labels.passenger}</dt><dd className="mt-0.5 font-medium">{p.passengerName}</dd></div>
          <div><dt className="text-ink-muted">{p.labels.seat}</dt><dd className="mt-0.5 font-medium tabular-nums">{p.seatLabel}</dd></div>
          <div className="col-span-2"><dt className="text-ink-muted">{p.labels.departure}</dt><dd className="mt-0.5 font-medium tabular-nums">{p.whenText}</dd></div>
          {p.details?.map((d) => <div key={d.label}><dt className="text-ink-muted">{d.label}</dt><dd className="mt-0.5 font-medium">{d.value}</dd></div>)}
        </dl>
        <div className="flex justify-center rounded-ds-md bg-surface-card p-2" dir="ltr">{p.qr}</div>
        {p.footer ? <div className="border-t border-dashed border-line-strong pt-4 text-[13px] text-ink-muted">{p.footer}</div> : null}
      </div>
    </article>
  );
}
