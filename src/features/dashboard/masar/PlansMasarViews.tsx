'use client';
import Link from 'next/link';
import { useOptimistic, useRef, useState } from 'react';
import { DataTable, type Column } from '@/ds/data/DataTable';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { Identifier } from '@/ds/format/Identifier';
import { formatDay, formatMoney, formatNumber } from '@/ds/format';
import { useDsLang } from '@/ds/lang';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { SaveStatus, viewOfInline } from '@/ds/feedback/SaveStatus';
import { useInlineSave } from '@/ds/hooks/useInlineSave';
import { PlanLimitNotice } from '@/components/dashboard/FormParts';
import { PlanCreateForm } from '../CreateForms';
import { archivePlanAction, decideSubscriptionAction, setPlanActiveAction } from '../autosave-actions';
import type { PlanUsage } from '@/features/subscriptions/usage';
import type { RoutePlan, RouteSubscription } from '@/features/route-plans/types';
import { PageHeaderMasar } from './PageHeaderMasar';
import { saveLabels } from './text';
import { JP } from './textPlans';

const validityText = (p: RoutePlan, lang: 'en' | 'ar'): string => {
  const t = JP[lang];
  if (p.validityType === 'duration' && p.durationMonths !== null) return t.months(`${formatNumber(p.durationMonths, lang)} ${t.monthsUnit(p.durationMonths)}`);
  return p.startsOn && p.endsOn ? t.range(formatDay(p.startsOn, lang, 'numeric'), formatDay(p.endsOn, lang, 'numeric')) : '—';
};

/** Plan on/off: flips at once, rolls back by itself when the server says no. */
function PlanActiveSwitch({ p }: { p: RoutePlan }) {
  const lang = useDsLang();
  const [shown, setShown] = useOptimistic(p.isActive);
  const { pending, result, run } = useInlineSave();
  const label = shown ? (lang === 'ar' ? 'نشطة' : 'Active') : (lang === 'ar' ? 'متوقفة' : 'Inactive');
  return (
    <div className="flex flex-col gap-0.5">
      <button type="button" role="switch" aria-checked={shown} aria-label={`${p.name}: ${label}`} disabled={pending}
        onClick={() => run(() => setPlanActiveAction(p.id, p.name, p.price, !shown), () => setShown(!shown))}
        className="inline-flex min-h-8 items-center gap-2 text-sm font-medium text-ink-primary">
        <span className={`relative h-5 w-9 rounded-full transition-colors ${shown ? 'bg-action' : 'bg-line-strong'}`}>
          <span className={`absolute top-0.5 size-4 rounded-full bg-surface-card transition-all ${shown ? 'start-[1.125rem]' : 'start-0.5'}`} />
        </span>{label}
      </button>
      <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
    </div>
  );
}

function ArchiveButton({ p }: { p: RoutePlan }) {
  const lang = useDsLang();
  const t = JP[lang];
  const { pending, result, run } = useInlineSave();
  return (
    <div className="flex flex-col gap-0.5">
      <Button variant="ghost" disabled={pending} aria-label={`${t.archive} ${p.name}`} onClick={() => run(() => archivePlanAction(p.id))} className="!h-8 !px-2 text-[13px]">{t.archive}</Button>
      <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
    </div>
  );
}

export function PlansMasarView(p: { rows: RoutePlan[]; routes: { id: string; name: string }[]; currency: string; canWrite: boolean; usage: PlanUsage | null }) {
  const lang = useDsLang();
  const t = JP[lang];
  const cols: Column<RoutePlan>[] = [
    { key: 'name', primary: true, header: t.plan, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'route', header: t.route, cell: (r) => r.routeName || '—' },
    { key: 'price', numeric: true, header: t.price, cell: (r) => (p.currency ? formatMoney(r.price, p.currency, lang) : formatNumber(r.price, lang)) },
    { key: 'validity', header: t.validity, cell: (r) => validityText(r, lang) },
    { key: 'status', header: t.status, cell: (r) => (p.canWrite ? <PlanActiveSwitch p={r} /> : <StatusBadge domain="route" value={r.isActive ? 'active' : 'inactive'} />) },
    ...(p.canWrite ? [{ key: 'manage', header: t.manage, cell: (r: RoutePlan) => <ArchiveButton p={r} /> }] : []),
  ];
  return (
    <>
      <PageHeaderMasar title={t.plans} description={t.plansText} />
      {p.canWrite ? <div className="mb-5"><PlanLimitNotice usage={p.usage} resource="max_route_plans" /></div> : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0"><DataTable caption={t.plans} columns={cols} rows={p.rows} rowId={(r) => r.id} empty={{ title: t.noPlans, description: t.noPlansText }} /></div>
        {p.canWrite ? <PlanCreateForm routes={p.routes} usage={p.usage} /> : null}
      </div>
    </>
  );
}

/** Approve / reject with an optional note. The confirmation is a native dialog so keyboard and screen readers work. */
function DecisionCell({ s }: { s: RouteSubscription }) {
  const lang = useDsLang();
  const t = JP[lang];
  const { pending, result, run } = useInlineSave();
  const dialog = useRef<HTMLDialogElement>(null);
  const [approve, setApprove] = useState(true);
  const [note, setNote] = useState('');
  const open = (a: boolean) => { setApprove(a); setNote(''); dialog.current?.showModal(); };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => open(true)} aria-label={`${t.approve} ${s.memberName}`} className="!h-8 !px-3 text-[13px]">{t.approve}</Button>
        <Button variant="secondary" disabled={pending} onClick={() => open(false)} aria-label={`${t.reject} ${s.memberName}`} className="!h-8 !px-3 text-[13px]">{t.reject}</Button>
      </div>
      <SaveStatus view={viewOfInline(result, pending)} labels={saveLabels(lang)} />
      <dialog ref={dialog} aria-labelledby={`dlg-${s.id}`} className="w-[min(92vw,26rem)] rounded-2xl border border-line-default bg-surface-card p-5 text-ink-primary backdrop:bg-black/40">
        <h2 id={`dlg-${s.id}`} className="font-bold">{approve ? t.confirmApprove : t.confirmReject}</h2>
        <p className="mt-1 text-sm text-ink-secondary">{s.memberName} · {s.planName}</p>
        <p className="mt-2 text-sm text-ink-secondary">{approve ? t.approveText : t.rejectText}</p>
        <label className="mt-3 block text-sm font-medium">{t.note}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="mt-1 w-full rounded-ds-md border border-line-default bg-surface-card p-2 text-sm" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialog.current?.close()}>{t.cancel}</Button>
          <Button onClick={() => { dialog.current?.close(); run(() => decideSubscriptionAction(s.id, approve, note)); }}>{approve ? t.approve : t.reject}</Button>
        </div>
      </dialog>
    </div>
  );
}

const FILTERS = ['all', 'pending', 'active', 'closed'] as const;
export type RequestFilter = (typeof FILTERS)[number];

export function SubscriptionsMasarView(p: { rows: RouteSubscription[]; filter: RequestFilter; canDecide: boolean }) {
  const lang = useDsLang();
  const t = JP[lang];
  const pendingCount = p.rows.filter((r) => r.status === 'pending').length;
  const cols: Column<RouteSubscription>[] = [
    { key: 'member', primary: true, header: t.member, cell: (r) => (<div><span className="font-medium">{r.memberName}</span><p className="text-[13px] text-ink-secondary"><Identifier value={r.masarId} /></p></div>) },
    { key: 'phone', header: t.phone, cell: (r) => <Identifier value={r.memberPhone} /> },
    { key: 'plan', header: t.plan, cell: (r) => (<div><span>{r.planName || '—'}</span><p className="text-[13px] text-ink-secondary">{r.routeName}</p></div>) },
    { key: 'price', numeric: true, header: t.price, cell: (r) => formatMoney(r.price, r.currency, lang) },
    { key: 'requested', header: t.requested, cell: (r) => formatDay(r.requestedAt.slice(0, 10), lang, 'numeric') },
    { key: 'valid', header: t.valid, cell: (r) => (r.validFrom && r.validTo ? t.range(formatDay(r.validFrom, lang, 'numeric'), formatDay(r.validTo, lang, 'numeric')) : '—') },
    { key: 'status', header: t.status, cell: (r) => <StatusBadge domain="riderSubscription" value={r.status} /> },
    { key: 'decision', header: t.actions, cell: (r) => (r.status === 'pending' && p.canDecide ? <DecisionCell s={r} /> : <span className="text-[13px] text-ink-muted">{r.decisionNote ?? (r.status === 'pending' ? '' : t.decided)}</span>) },
  ];
  const label: Record<RequestFilter, string> = { all: t.all, pending: t.pending, active: t.active, closed: t.closed };
  return (
    <>
      <PageHeaderMasar title={t.requests} description={t.requestsText} />
      <nav aria-label={t.requests} className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f} href={f === 'pending' ? '/dashboard/subscriptions' : `/dashboard/subscriptions?status=${f}`} aria-current={p.filter === f ? 'page' : undefined}
            className={buttonClass(p.filter === f ? 'primary' : 'secondary', 'md')}>{label[f]}</Link>
        ))}
      </nav>
      {pendingCount > 0 ? <p role="status" className="mb-3 text-sm text-ink-secondary">{t.countPending(formatNumber(pendingCount, lang))}</p> : null}
      <DataTable caption={t.requests} columns={cols} rows={p.rows} rowId={(r) => r.id} empty={{ title: t.noRequests, description: t.noRequestsText }} />
    </>
  );
}
