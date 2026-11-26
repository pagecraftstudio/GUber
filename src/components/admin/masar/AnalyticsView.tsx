import Link from 'next/link';
import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { COHORT_OFFSETS_SHOWN, type AnalyticsPage, type FunnelStep } from '@/features/analytics/types';

const DAYS = [7, 30, 90] as const;
const href = (d: number) => `/admin/analytics?days=${d}`;
const num = (v: number) => v.toLocaleString('en');
const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
const TH = 'px-3 py-2 text-start text-[13px] font-medium text-ink-muted';
const TD = 'px-3 py-2 text-sm text-ink-primary tabular-nums';
const CARD = 'space-y-3 rounded-ds-md border border-line-default bg-surface-card p-4';

function Bar({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return <div aria-hidden="true" className="h-2 w-full rounded-full bg-line-default"><div className="h-2 rounded-full bg-action" style={{ width: `${value > 0 ? w : 0}%` }} /></div>;
}

function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = steps[0]?.visitorDays ?? 0;
  return (
    <ol className="space-y-3">
      {steps.map((s) => (
        <li key={s.step} className="space-y-1">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-ink-primary">{s.label}</span>
            <span className="text-ink-secondary tabular-nums">{num(s.visitorDays)} · {pct(s.pctOfFirst)} of first step{s.pctOfPrevious !== null ? ` · ${pct(s.pctOfPrevious)} of previous` : ''}</span></div>
          <Bar value={s.visitorDays} max={max} />
        </li>
      ))}
    </ol>
  );
}

function Panel({ id, title, note, children, exportHref }: { id: string; title: string; note?: string; children: React.ReactNode; exportHref?: string }) {
  return (
    <section aria-labelledby={id} className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-medium text-ink-primary">{title}</h2>
        {exportHref ? <a href={exportHref} download className={cx('text-sm text-ink-link underline-offset-2 hover:underline', FOCUS)}>Download CSV</a> : null}
      </div>
      {note ? <p className="text-sm text-ink-secondary">{note}</p> : null}
      {children}
    </section>
  );
}

/** Server component. Aggregates only: no visitor, user or IP appears anywhere on this page. */
export function AnalyticsView({ days, page }: { days: number; page: { data: AnalyticsPage } | { error: string } }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium text-ink-primary">Analytics</h1>
        <p className="text-sm text-ink-secondary">Counts cover only visitors who agreed to be recorded, so they under-count real traffic. “Visitor-days” adds up each day’s distinct visitors; it is not the number of different people.</p>
      </header>
      <nav aria-label="Period" className="flex flex-wrap items-center gap-2">
        {DAYS.map((d) => (
          <Link key={d} href={href(d)} aria-current={days === d ? 'page' : undefined}
            className={cx('inline-flex min-h-9 items-center rounded-ds-md border px-3 text-sm', days === d ? 'border-action font-medium text-action' : 'border-line-default text-ink-secondary hover:text-ink-primary', FOCUS)}>Last {d} days</Link>
        ))}
      </nav>
      {'error' in page ? <ErrorState title="Could not load analytics" description={page.error} /> : <Body d={page.data} days={days} />}
    </div>
  );
}

function Body({ d, days }: { d: AnalyticsPage; days: number }) {
  const maxViews = Math.max(0, ...d.overview.map((r) => r.pageViews));
  return (
    <>
      <Panel id="gaps" title="Searches with no results" note="What people look for and do not find. Sorted by missed searches." exportHref={`/admin/analytics/export?kind=gaps&days=${days}`}>
        {d.gaps.length === 0 ? <EmptyState title="No missed searches" description="No zero-result searches were recorded for this period." /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <caption className="sr-only">Searches with zero results by route</caption>
            <thead><tr><th scope="col" className={TH}>From</th><th scope="col" className={TH}>To</th><th scope="col" className={TH}>Searches</th><th scope="col" className={TH}>No results</th><th scope="col" className={TH}>Miss rate</th></tr></thead>
            <tbody>{d.gaps.map((g) => (
              <tr key={`${g.origin}|${g.destination}`} className="border-t border-line-default">
                <td className={TD}><bdi>{g.origin || '(any)'}</bdi></td><td className={TD}><bdi>{g.destination || '(any)'}</bdi></td>
                <td className={TD}>{num(g.searches)}</td><td className={TD}>{num(g.zeroSearches)}</td><td className={TD}>{g.zeroRate === null ? '–' : `${Math.round(g.zeroRate * 100)}%`}</td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>

      <Panel id="funnel" title="Booking funnel" note="Approximate: visitor-days per step, not a strict path.">
        {d.funnel.every((s) => s.visitorDays === 0) ? <EmptyState title="No funnel data yet" description="Booking events are not being recorded for this period." /> : <Funnel steps={d.funnel} />}
      </Panel>

      <Panel id="traffic" title="Page views per day">
        {d.overview.length === 0 ? <EmptyState title="No page views" description="Nothing was recorded for this period." /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <caption className="sr-only">Page views and visitors per day</caption>
            <thead><tr><th scope="col" className={TH}>Day</th><th scope="col" className={TH}>Page views</th><th scope="col" className={TH}>Visitors</th><th scope="col" className={cx(TH, 'w-1/3')}><span className="sr-only">Share of busiest day</span></th></tr></thead>
            <tbody>{d.overview.map((r) => (
              <tr key={r.day} className="border-t border-line-default"><td className={TD}><bdi dir="ltr">{r.day}</bdi></td><td className={TD}>{num(r.pageViews)}</td><td className={TD}>{num(r.visitorDays)}</td><td className="px-3 py-2"><Bar value={r.pageViews} max={maxViews} /></td></tr>))}</tbody>
          </table></div>)}
      </Panel>

      <Panel id="usage" title="Feature usage" note="Top 30 events." exportHref={`/admin/analytics/export?kind=usage&days=${days}`}>
        {d.usage.length === 0 ? <EmptyState title="No events" description="Nothing was recorded for this period." /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <caption className="sr-only">Events by surface</caption>
            <thead><tr><th scope="col" className={TH}>Surface</th><th scope="col" className={TH}>Event</th><th scope="col" className={TH}>Events</th><th scope="col" className={TH}>Visitor-days</th></tr></thead>
            <tbody>{d.usage.map((u) => <tr key={`${u.surface}|${u.event}`} className="border-t border-line-default"><td className={TD}>{u.surface}</td><td className={TD}><bdi dir="ltr">{u.event}</bdi></td><td className={TD}>{num(u.events)}</td><td className={TD}>{num(u.visitorDays)}</td></tr>)}</tbody>
          </table></div>)}
      </Panel>

      <Panel id="cohorts" title="Return visits by first-visit week" note="Share of each week’s new visitors who came back N weeks later. Blank means that week has not happened yet.">
        {d.cohorts.length === 0 ? <EmptyState title="No cohorts yet" description="They appear once visitors have been recorded for a full week." /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <caption className="sr-only">Weekly retention by cohort</caption>
            <thead><tr><th scope="col" className={TH}>Week of</th><th scope="col" className={TH}>New</th>{Array.from({ length: COHORT_OFFSETS_SHOWN }, (_, k) => <th key={k} scope="col" className={TH}>+{k}w</th>)}</tr></thead>
            <tbody>{d.cohorts.map((c) => <tr key={c.week} className="border-t border-line-default"><td className={TD}><bdi dir="ltr">{c.week}</bdi></td><td className={TD}>{num(c.size)}</td>{c.retention.map((v, k) => <td key={k} className={TD}>{pct(v)}</td>)}</tr>)}</tbody>
          </table></div>)}
      </Panel>
    </>
  );
}
