'use client';
import { Bell } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatDateTime } from '@/ds/format';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { getSupabaseBrowser } from '@/ui/lib/real/supabaseBrowser';
import { fetchInbox, fetchUnread, INBOX_PAGE, markRead, type InboxItem } from './api';

const POLL_MS = 60_000;
const TEXT = {
  en: { title: 'Notifications', unread: 'unread', empty: 'No notifications yet.', markAll: 'Mark all as read', more: 'Show older', error: 'Could not load notifications.', retry: 'Try again', loading: 'Loading', from: 'From' },
  ar: { title: 'الإشعارات', unread: 'غير مقروءة', empty: 'لا توجد إشعارات بعد.', markAll: 'تحديد الكل كمقروء', more: 'عرض الأقدم', error: 'تعذّر تحميل الإشعارات.', retry: 'حاول مرة أخرى', loading: 'جارٍ التحميل', from: 'من' },
} as const;

/**
 * The inbox bell, one component for every surface (student, company dashboard, driver, platform admin). It only ever asks the database for
 * the signed-in user's own notices. The count refreshes about once a minute while the page is visible (no websocket yet). If the inbox
 * cannot be reached the bell stays usable: it just shows no badge, and opening it offers Try again.
 */
export function NotificationBell({ lang }: { lang: 'en' | 'ar' }) {
  const t = TEXT[lang];
  const uid = useId();
  const client = useMemo(() => { try { return getSupabaseBrowser(); } catch { return null; } }, []);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const refreshCount = useCallback(async () => {
    if (!client) return;
    try { setUnread(await fetchUnread(client)); } catch { /* keep the last number */ }
  }, [client]);

  useEffect(() => {
    void refreshCount();
    const tick = setInterval(() => { if (!document.hidden) void refreshCount(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshCount]);

  const load = useCallback(async (older?: InboxItem) => {
    if (!client) { setState('error'); return; }
    setState('loading');
    try {
      const rows = await fetchInbox(client, older ? { before: older.created_at, beforeId: older.id } : undefined);
      setItems((cur) => (older ? [...(cur ?? []), ...rows] : rows));
      setMore(rows.length === INBOX_PAGE);
      setState('idle');
    } catch { setState('error'); }
  }, [client]);

  const close = useCallback((back: boolean) => { setOpen(false); if (back) button.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) close(false); };
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open, close]);

  const toggle = () => { const next = !open; setOpen(next); if (next) { void load(); void refreshCount(); } };
  const readOne = (n: InboxItem) => {
    if (n.is_read || !client) return;
    setItems((cur) => (cur ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    void markRead(client, [n.id]).catch(() => void refreshCount());
  };
  const readAll = async () => {
    if (!client) return;
    try { await markRead(client); setItems((cur) => (cur ?? []).map((x) => ({ ...x, is_read: true }))); setUnread(0); } catch { setState('error'); }
  };

  const badge = unread >= 99 ? '99+' : String(unread);
  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" onClick={toggle} aria-expanded={open} aria-controls={`${uid}-panel`}
        aria-label={unread > 0 ? `${t.title}, ${badge} ${t.unread}` : t.title}
        className={cx('relative grid size-10 place-items-center rounded-ds-md text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary', FOCUS)}>
        <Bell size={20} strokeWidth={1.5} aria-hidden="true" />
        {unread > 0 ? <span aria-hidden="true" data-testid="bell-badge" className="absolute -top-0.5 -end-0.5 grid min-w-5 place-items-center rounded-full bg-action px-1 text-[11px] leading-5 font-medium text-on-action tabular-nums">{badge}</span> : null}
      </button>
      {open ? (
        <section id={`${uid}-panel`} aria-label={t.title} dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="absolute end-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-ds-md border border-line-default bg-surface-card shadow-lg">
          <header className="flex items-center justify-between gap-3 border-b border-line-default px-4 py-3">
            <h2 className="text-base font-medium text-ink-primary">{t.title}</h2>
            {unread > 0 ? <button type="button" onClick={() => void readAll()} className={cx('text-[13px] font-medium text-action underline underline-offset-2', FOCUS)}>{t.markAll}</button> : null}
          </header>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {state === 'error' ? (
              <p role="alert" className="px-4 py-4 text-sm text-status-error-fg">{t.error}{' '}<button type="button" onClick={() => void load()} className={cx('underline underline-offset-2', FOCUS)}>{t.retry}</button></p>
            ) : items === null ? (
              <p role="status" className="px-4 py-4 text-sm text-ink-secondary">{t.loading}…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-secondary">{t.empty}</p>
            ) : (
              <ul className="divide-y divide-line-default">
                {items.map((n) => {
                  const inner = (
                    <>
                      <span className="flex items-start gap-2">
                        {!n.is_read ? <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-action" /> : <span aria-hidden="true" className="size-2 shrink-0" />}
                        <span className="min-w-0">
                          {n.subject ? <span className={cx('block text-sm break-words text-ink-primary', n.is_read ? 'font-normal' : 'font-medium')}>{n.subject}</span> : null}
                          <span className="block text-sm break-words text-ink-secondary">{n.body}</span>
                          <span className="mt-1 block text-[12px] text-ink-muted tabular-nums">{n.company_name ? `${t.from} ${n.company_name} · ` : ''}{formatDateTime(n.created_at, lang)}</span>
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={n.id}>
                      {n.link
                        ? <a href={n.link} onClick={() => readOne(n)} className={cx('block px-4 py-3 hover:bg-surface-sunken', FOCUS)}>{inner}</a>
                        : <button type="button" onClick={() => readOne(n)} className={cx('block w-full px-4 py-3 text-start hover:bg-surface-sunken', FOCUS)}>{inner}</button>}
                    </li>
                  );
                })}
              </ul>
            )}
            {more && state !== 'error' && items && items.length > 0 ? (
              <div className="border-t border-line-default px-4 py-2"><button type="button" disabled={state === 'loading'} onClick={() => void load(items[items.length - 1])} className={cx('text-[13px] font-medium text-action underline underline-offset-2', FOCUS)}>{t.more}</button></div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
