import Link from 'next/link';
import { setRatingHiddenAction } from '@/features/ratings/admin-actions';
import type { PlatformRating, RatingsListQuery, RatingsPage } from '@/features/ratings/admin-types';
import { RATING_VISIBILITY } from '@/features/ratings/admin-types';
import { EmptyState, ErrorState } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDateTime } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';

const NOTICE_TEXT: Record<string, { tone: 'info' | 'error'; text: string }> = {
  hidden: { tone: 'info', text: 'Rating hidden. It no longer counts toward the company or driver average.' },
  restored: { tone: 'info', text: 'Rating restored. It counts again.' },
  error: { tone: 'error', text: 'That change could not be made. Reload the list and try again.' },
};
const SHOW_LABEL: Record<(typeof RATING_VISIBILITY)[number], string> = { all: 'All', visible: 'Visible', hidden: 'Hidden' };

/** Query string for a list link. Only the filters and (optionally) the paging cursor: never a rating id, never anything about a rater. */
const href = (q: Pick<RatingsListQuery, 'company' | 'show'>, extra: Record<string, string> = {}): string => {
  const p = new URLSearchParams();
  if (q.company) p.set('company', q.company);
  p.set('show', q.show);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return `/admin/ratings?${p.toString()}`;
};

function Row({ r, query }: { r: PlatformRating; query: RatingsListQuery }) {
  const hidden = r.hiddenAt !== null;
  return (
    <li className={cx('space-y-2 rounded-ds-md border border-line-default bg-surface-card p-4', hidden && 'opacity-80')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-medium text-ink-primary">
            <span aria-label={`Trip ${r.tripStars} out of 5`}>Trip ★ {r.tripStars}</span>
            <span className="mx-2 text-ink-muted" aria-hidden="true">·</span>
            <span aria-label={`Driver ${r.driverStars} out of 5`}>Driver ★ {r.driverStars}</span>
            {hidden ? <span className="ms-3 rounded-ds-sm border border-line-default px-1.5 py-0.5 text-[12px] font-normal text-ink-secondary">Hidden</span> : null}
          </p>
          <p className="text-sm text-ink-secondary"><bdi>{r.companyName}</bdi> · driver <bdi>{r.driverName}</bdi></p>
          <p className="text-sm text-ink-secondary"><bdi>{r.originName}</bdi> to <bdi>{r.destinationName}</bdi>, departed {formatDateTime(r.departureAt, 'en')}</p>
          <p className="text-[13px] text-ink-muted tabular-nums">Rated {formatDateTime(r.createdAt, 'en')}{hidden && r.hiddenAt ? ` · hidden ${formatDateTime(r.hiddenAt, 'en')}` : ''}</p>
        </div>
        <form action={setRatingHiddenAction}>
          <input type="hidden" name="ratingId" value={r.ratingId} />
          <input type="hidden" name="hidden" value={hidden ? 'false' : 'true'} />
          {query.company ? <input type="hidden" name="company" value={query.company} /> : null}
          <input type="hidden" name="show" value={query.show} />
          <Button type="submit" variant="secondary">{hidden ? 'Restore' : 'Hide'}</Button>
        </form>
      </div>
      {!query.company ? <Link href={href({ show: query.show, company: r.companyId })} className={cx('inline-flex min-h-9 items-center text-sm text-ink-link underline-offset-2 hover:underline', FOCUS)}>Only this company</Link> : null}
    </li>
  );
}

/**
 * Super-admin moderation of ratings. Server component: hide / restore are plain form posts to a server action, so it works without client JavaScript.
 * The list never shows who rated: the database does not return it (platform_list_ratings, 0063).
 */
export function RatingsModerationView({ query, page, notice, ignored }: { query: RatingsListQuery; page: { data: RatingsPage } | { error: string }; notice: string | null; ignored: boolean }) {
  const n = notice ? NOTICE_TEXT[notice] : undefined;
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-medium text-ink-primary">Ratings</h1>
        <p className="text-sm text-ink-secondary">Hide a rating that breaks the rules. A hidden rating stops counting toward the company and driver averages; restoring it is one click. Every change is audited. Raters are not shown.</p>
      </header>
      {n ? <InlineAlert tone={n.tone}>{n.text}</InlineAlert> : null}
      {ignored ? <InlineAlert tone="warning">Some filters in the address were not valid and were ignored.</InlineAlert> : null}

      <nav aria-label="Filter by visibility" className="flex flex-wrap items-center gap-2">
        {RATING_VISIBILITY.map((v) => (
          <Link key={v} href={href({ ...(query.company ? { company: query.company } : {}), show: v })} aria-current={query.show === v ? 'page' : undefined}
            className={cx('inline-flex min-h-9 items-center rounded-ds-md border px-3 text-sm', query.show === v ? 'border-action font-medium text-action' : 'border-line-default text-ink-secondary hover:text-ink-primary', FOCUS)}>{SHOW_LABEL[v]}</Link>
        ))}
        {query.company ? <Link href={href({ show: query.show })} className={cx('inline-flex min-h-9 items-center text-sm text-ink-link underline-offset-2 hover:underline', FOCUS)}>Clear company filter</Link> : null}
      </nav>

      {'error' in page ? <ErrorState title="Could not load ratings" description={page.error} />
        : page.data.rows.length === 0 ? <EmptyState title="No ratings match" description="Nothing to show for these filters." />
        : (
          <>
            <ul className="space-y-3">{page.data.rows.map((r) => <Row key={r.ratingId} r={r} query={query} />)}</ul>
            {page.data.next ? <Link href={href(query, { before: page.data.next.before, beforeId: page.data.next.beforeId })} className={cx('inline-flex min-h-11 items-center text-sm font-medium text-action underline underline-offset-2', FOCUS)}>Older ratings</Link> : null}
          </>
        )}
    </div>
  );
}
