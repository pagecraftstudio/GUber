'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Field } from '@/ds/primitives/Field';
import { DatePicker, Input, Select } from '@/ds/primitives/Input';
import { Button } from '@/ds/primitives/Button';
import { useDsLang } from '@/ds/lang';
import { J2 } from './text';

export type FilterField =
  | { kind: 'search'; name: string; label: string; value: string; placeholder?: string }
  | { kind: 'select'; name: string; label: string; value: string; allLabel?: string; options: readonly (readonly [string, string])[] }
  | { kind: 'date'; name: string; label: string; value: string };

/**
 * URL-driven filters (same behaviour as today): a plain GET form, so it works without JavaScript, the URL stays the single
 * source of truth, and every value is validated again on the server. Applied filters are chips that are links (remove one = one click).
 * `keep` carries params that are not form fields (view, sort) through a submit. `quick` are one-click date ranges.
 */
export function UrlFilterBar({ fields, keep, quick, chips, clearHref, extra }: {
  fields: FilterField[]; keep: Record<string, string>;
  quick?: { key: string; label: string; href: string; active: boolean }[];
  chips: { key: string; label: string; href: string }[]; clearHref: string; extra?: ReactNode;
}) {
  const t = J2[useDsLang()];
  return (
    <section aria-label={t.filters} className="mb-5 flex flex-col gap-3 rounded-ds-md border border-line-default bg-surface-card p-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {Object.entries(keep).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {fields.map((f) => (
          <Field key={f.name} label={f.label} className={f.kind === 'search' ? 'min-w-56 flex-1' : 'min-w-40'}>
            {f.kind === 'search' ? <Input name={f.name} type="search" defaultValue={f.value} placeholder={f.placeholder} maxLength={100} />
              : f.kind === 'date' ? <DatePicker name={f.name} defaultValue={f.value} />
              : <Select name={f.name} defaultValue={f.value}>{f.allLabel ? <option value="">{f.allLabel}</option> : null}{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
          </Field>
        ))}
        <Button type="submit" variant="secondary">{t.apply}</Button>
        {extra}
      </form>
      {quick && quick.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t.filters}>
          {quick.map((q) => <li key={q.key}><Link href={q.href} aria-current={q.active ? 'true' : undefined} className={`inline-flex h-8 items-center rounded-ds-sm border px-3 text-[13px] ${q.active ? 'border-action bg-action text-on-action' : 'border-line-strong bg-surface-card text-ink-primary hover:bg-surface-sunken'}`}>{q.label}</Link></li>)}
        </ul>
      ) : null}
      {chips.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-2" aria-label={t.filters}>
          {chips.map((c) => <li key={c.key} className="inline-flex h-7 items-center gap-1 rounded-ds-sm bg-surface-sunken ps-2 pe-1 text-[13px] text-ink-primary">{c.label}<Link href={c.href} aria-label={`${t.remove}: ${c.label}`} className="inline-flex size-6 items-center justify-center rounded-ds-sm hover:bg-line-default">×</Link></li>)}
          <li><Link href={clearHref} className="text-[13px] text-ink-link underline-offset-2 hover:underline">{t.clear}</Link></li>
        </ul>
      ) : null}
    </section>
  );
}
