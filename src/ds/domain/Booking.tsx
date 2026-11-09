'use client';
import type { ReactNode } from 'react';
import { formatMoney, type Lang } from '../format';
import { useDsLang } from '../lang';
import { Identifier } from '../format/Identifier';
import { Field } from '../primitives/Field';
import { DigitInput, Input } from '../primitives/Input';
import { InlineAlert } from '../feedback/InlineAlert';
import { KeyValue } from '../data/Layout';
import { StatusBadge } from '../data/StatusBadge';
import { cx } from '../primitives/cx';

export interface BookingSummaryProps { title: string; whenText: string; seatsLabel: string; passengers: string[]; notes?: string | null; labels: { seats: string; passengers: string; notes: string; when: string } }
export function BookingSummary({ title, whenText, seatsLabel, passengers, notes, labels }: BookingSummaryProps) {
  return (
    <section className="rounded-ds-md border border-line-default bg-surface-card p-5">
      <h3 className="text-lg font-medium text-ink-primary">{title}</h3>
      <div className="mt-3"><KeyValue items={[
        { label: labels.when, value: <span className="tabular-nums">{whenText}</span> },
        { label: labels.seats, value: seatsLabel },
        { label: labels.passengers, value: <ul>{passengers.map((n, i) => <li key={i}>{n}</li>)}</ul> },
        ...(notes ? [{ label: labels.notes, value: notes }] : []),
      ]} /></div>
    </section>
  );
}

export interface PaymentSummaryProps {
  lines: { label: string; amount: number }[];
  total: { label: string; amount: number };
  currency: string;
  /** Required by type: the cancellation policy must be visible before the person confirms (plan 8.1). No hidden fees: every line is shown. */
  policy: ReactNode;
  policyLabel: string;
  lang?: Lang;
}
export function PaymentSummary({ lines, total, currency, policy, policyLabel, lang }: PaymentSummaryProps) {
  const l = useDsLang(lang);
  return (
    <section className="rounded-ds-md border border-line-default bg-surface-card p-5">
      <dl className="flex flex-col gap-2 text-sm">
        {lines.map((x, i) => <div key={i} className="flex justify-between gap-4"><dt className="text-ink-secondary">{x.label}</dt><dd className="tabular-nums text-ink-primary">{formatMoney(x.amount, currency, l, { fixed: true })}</dd></div>)}
        <div className="mt-1 flex justify-between gap-4 border-t border-line-default pt-3 text-base font-medium"><dt>{total.label}</dt><dd className="tabular-nums">{formatMoney(total.amount, currency, l, { fixed: true })}</dd></div>
      </dl>
      <div className="mt-4"><InlineAlert tone="info" title={policyLabel}>{policy}</InlineAlert></div>
    </section>
  );
}

export interface PassengerValues { name: string; phone: string; studentId: string; university: string }
export type PassengerErrors = Partial<Record<keyof PassengerValues, string>>;
/** Presentational: values and errors come from the caller, so typed input is preserved on a failed submit. Phone validity is decided on the server (libphonenumber stays out of the client bundle). */
export function PassengerForm({ values, errors, onChange, labels, size = 'md' }: { values: PassengerValues; errors?: PassengerErrors; onChange: (next: PassengerValues) => void; labels: Record<keyof PassengerValues, string>; size?: 'md' | 'lg' }) {
  const set = (k: keyof PassengerValues) => (v: string) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={labels.name} required error={errors?.name}><Input size={size} value={values.name} autoComplete="name" onChange={(e) => set('name')(e.target.value)} /></Field>
      <Field label={labels.phone} required error={errors?.phone}><DigitInput kind="tel" size={size} value={values.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
      <Field label={labels.studentId} error={errors?.studentId}><DigitInput kind="identifier" size={size} value={values.studentId} onChange={(e) => set('studentId')(e.target.value)} /></Field>
      <Field label={labels.university} error={errors?.university}><Input size={size} value={values.university} onChange={(e) => set('university')(e.target.value)} /></Field>
    </div>
  );
}

export function VehicleDriverCard({ plate, model, capacityLabel, driverName, driverPhone, busStatus }: { plate: string; model?: string; capacityLabel?: string; driverName?: string | null; driverPhone?: string | null; busStatus?: string }) {
  return (
    <article className="flex flex-col gap-3 rounded-ds-md border border-line-default bg-surface-card p-4">
      <header className="flex items-center justify-between gap-3">
        <p className="text-base font-medium text-ink-primary">{plate ? <bdi dir="auto">{plate}</bdi> : null}</p>
        {busStatus ? <StatusBadge domain="bus" value={busStatus} /> : null}
      </header>
      {model || capacityLabel ? <p className="text-sm text-ink-secondary">{[model, capacityLabel].filter(Boolean).join(' · ')}</p> : null}
      {driverName ? <p className="text-sm text-ink-primary">{driverName}{driverPhone ? <> · <Identifier value={driverPhone} /></> : null}</p> : null}
    </article>
  );
}

/** One passenger line for the driver and ops manifest. `driver` size has 56px rows and room for a 48px action. */
export function ManifestRow({ name, seatsLabel, phone, boarding, action, size = 'ops' }: { name: string; seatsLabel: string; phone?: string | null; boarding: string; action?: ReactNode; size?: 'ops' | 'driver' }) {
  return (
    <li className={cx('flex items-center justify-between gap-3 border-b border-line-default py-2', size === 'driver' ? 'min-h-14' : 'min-h-12')}>
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-ink-primary">{name}</p>
        <p className="text-[13px] text-ink-secondary">{seatsLabel}{phone ? <> · <Identifier value={phone} /></> : null}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2"><StatusBadge domain="boarding" value={boarding} />{action}</div>
    </li>
  );
}
