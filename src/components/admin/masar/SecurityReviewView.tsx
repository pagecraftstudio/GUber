import Link from 'next/link';
import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDateTime } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { markReviewedAction } from '@/features/security-review/actions';
import { REVIEW_ACTION_LABEL, type ReviewAction, type ReviewItem, type ReviewPage, type ReviewQuery } from '@/features/security-review/types';

const DAYS = [7, 30, 90] as const;
const href = (days: number, show: 'open' | 'all') => `/admin/security-review?days=${days}&show=${show}`;
const label = (a: string) => REVIEW_ACTION_LABEL[a as ReviewAction] ?? a;

function Row({ r, query }: { r: ReviewItem; query: ReviewQuery }) {
  const done = r.reviewedAt !== null;
  return (
    <li className={cx('space-y-2 rounded-ds-md border border-line-default bg-surface-card p-4', done && 'opacity-80')}>
      <p className="text-base font-medium text-ink-primary">{label(r.action)}</p>
      <p className="text-sm text-ink-secondary"><bdi>{r.actorName}</bdi> <bdi dir="ltr" className="text-ink-muted">{r.actorEmail}</bdi></p>
      {r.companyName ? <p className="text-sm text-ink-secondary">Company: <bdi>{r.companyName}</bdi></p> : null}
      {r.reason ? <p className="text-sm text-ink-secondary">Reason given: <bdi>{r.reason}</bdi></p> : null}
      {r.device ? <p className="text-sm text-ink-secondary">Device: <bdi>{r.device}</bdi></p> : null}
      <p className="text-[13px] text-ink-muted tabular-nums">{formatDateTime(r.createdAt, 'en')}</p>
      {done ? (
        <p className="text-sm text-ink-secondary">Reviewed by <bdi>{r.reviewedBy ?? 'a former admin'}</bdi>{r.reviewedAt ? `, ${formatDateTime(r.reviewedAt, 'en')}` : ''}{r.note ? <> · <bdi>{r.note}</bdi></> : null}</p>
      ) : r.canReview ? (
        <form action={markReviewedAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="days" value={query.days} />
          <input type="hidden" name="show" value={query.show} />
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-ink-secondary">Note (optional)
            <input name="note" maxLength={300} className={cx('min-h-11 rounded-ds-md border border-line-default bg-surface-card px-3 text-ink-primary', FOCUS)} />
          </label>
          <Button type="submit" variant="secondary">Mark reviewed</Button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">Your own action: another super admin must review it.</p>
      )}
    </li>
  );
}

/** Server component; "Mark reviewed" is a plain form post. Nobody can review their own entry (Postgres enforces it, 0067). */
export function SecurityReviewView({ query, page, notice }: { query: ReviewQuery; page: { data: ReviewPage } | { error: string }; notice: 'reviewed' | 'error' | null }) {
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium text-ink-primary">Security review</h1>
        <p className="text-sm text-ink-secondary">Company dashboards opened by platform staff, edit mode switched on, and sign-ins from new devices. Platform accounts have no second sign-in step, so a second admin looks at each of these.</p>
      </header>
      {notice === 'reviewed' ? <InlineAlert tone="info">Marked as reviewed.</InlineAlert> : null}
      {notice === 'error' ? <InlineAlert tone="error">That could not be saved. You cannot review your own actions. Reload and try again.</InlineAlert> : null}
      <nav aria-label="Period and filter" className="flex flex-wrap items-center gap-2">
        {DAYS.map((d) => (
          <Link key={d} href={href(d, query.show)} aria-current={query.days === d ? 'page' : undefined}
            className={cx('inline-flex min-h-9 items-center rounded-ds-md border px-3 text-sm', query.days === d ? 'border-action font-medium text-action' : 'border-line-default text-ink-secondary hover:text-ink-primary', FOCUS)}>Last {d} days</Link>
        ))}
        <Link href={href(query.days, query.show === 'open' ? 'all' : 'open')} className={cx('inline-flex min-h-9 items-center text-sm text-ink-link underline-offset-2 hover:underline', FOCUS)}>{query.show === 'open' ? 'Show reviewed too' : 'Show only waiting'}</Link>
      </nav>
      {'error' in page ? <ErrorState title="Could not load the review" description={page.error} />
        : (
          <>
            <p className="text-sm text-ink-secondary" aria-live="polite">{page.data.unreviewed} waiting for review in the last {page.data.days} days (newest 200 shown).</p>
            {page.data.items.length === 0 ? <EmptyState title="Nothing to review" description="No entries for this period." />
              : <ul className="space-y-3">{page.data.items.map((r) => <Row key={r.id} r={r} query={query} />)}</ul>}
          </>
        )}
    </div>
  );
}
