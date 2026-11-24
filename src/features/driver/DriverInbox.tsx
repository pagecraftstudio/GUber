'use client';

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, Skeleton, SkeletonRegion } from '@/ds/feedback/States';
import type { Lang } from '@/ds/format';
import { formatDateTime } from '@/ds/format';
import { IconButton } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { fetchInbox, INBOX_PAGE, markRead, type InboxItem } from '@/features/notifications/api';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';

/**
 * Inbox tab: the same notices as the bell (my_inbox / mark_my_notices_read, 0053), as a full page. It only ever asks the database for the signed-in
 * user's own notices. Opening a notice marks it read; a link goes to an in-app path the database already validated.
 */
export function DriverInbox({ lang = 'ar' }: { lang?: Lang }) {
  const t = DRIVER_SCREENS_TEXT[lang].inbox;
  const client = useMemo(() => { try { return getSupabaseBrowser(); } catch { return null; } }, []);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (older?: InboxItem) => {
    if (!client) { setFailed(true); return; }
    setBusy(true); setFailed(false);
    try {
      const rows = await fetchInbox(client, older ? { before: older.created_at, beforeId: older.id } : undefined);
      setItems((cur) => (older ? [...(cur ?? []), ...rows] : rows));
      setMore(rows.length === INBOX_PAGE);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  const unread = (items ?? []).filter((n) => !n.is_read).length;
  const readOne = (n: InboxItem) => {
    if (n.is_read || !client) return;
    setItems((cur) => (cur ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    void markRead(client, [n.id]).catch(() => void load());
  };
  const readAll = async () => {
    if (!client) return;
    try { await markRead(client); setItems((cur) => (cur ?? []).map((x) => ({ ...x, is_read: true }))); } catch { setFailed(true); }
  };

  const header = (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-medium text-ink-primary">{t.title}</h1>
      <IconButton label={t.refresh} icon={<RefreshCw size={18} strokeWidth={1.5} />} onClick={() => void load()} />
    </div>
  );
  if (failed && items === null) return <div className="space-y-4">{header}<ErrorState title={t.loadError} onRetry={() => void load()} retryLabel={t.retry} /></div>;
  if (items === null) return <div className="space-y-4">{header}<SkeletonRegion label={t.loading}><div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div></SkeletonRegion></div>;
  if (items.length === 0) return <div className="space-y-4">{header}<EmptyState title={t.empty} /></div>;

  return (
    <div className="space-y-4">
      {header}
      {failed ? <p role="alert" className="text-sm text-status-error-fg">{t.loadError}{' '}<button type="button" onClick={() => void load()} className={cx('underline underline-offset-2', FOCUS)}>{t.retry}</button></p> : null}
      {unread > 0 ? <button type="button" onClick={() => void readAll()} className={cx('min-h-11 text-sm font-medium text-action underline underline-offset-2', FOCUS)}>{t.markAll}</button> : null}
      <ul className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card">
        {items.map((n) => {
          const inner = (
            <span className="flex items-start gap-2">
              {!n.is_read ? <span aria-hidden="true" data-testid="unread-dot" className="mt-1.5 size-2 shrink-0 rounded-full bg-action" /> : <span aria-hidden="true" className="size-2 shrink-0" />}
              <span className="min-w-0">
                {n.subject ? <span className={cx('block text-base break-words text-ink-primary', n.is_read ? 'font-normal' : 'font-medium')}>{n.subject}</span> : null}
                <span className="block text-sm break-words text-ink-secondary">{n.body}</span>
                <span className="mt-1 block text-[13px] text-ink-muted tabular-nums">{n.company_name ? `${t.from} ${n.company_name} · ` : ''}{formatDateTime(n.created_at, lang)}</span>
              </span>
            </span>
          );
          return (
            <li key={n.id}>
              {n.link
                ? <a href={n.link} onClick={() => readOne(n)} className={cx('block min-h-14 px-4 py-3 hover:bg-surface-sunken', FOCUS)}>{inner}</a>
                : <button type="button" onClick={() => readOne(n)} className={cx('block min-h-14 w-full px-4 py-3 text-start hover:bg-surface-sunken', FOCUS)}>{inner}</button>}
            </li>
          );
        })}
      </ul>
      {more ? <button type="button" disabled={busy} onClick={() => void load(items[items.length - 1])} className={cx('min-h-11 text-sm font-medium text-action underline underline-offset-2', FOCUS)}>{t.more}</button> : null}
    </div>
  );
}
