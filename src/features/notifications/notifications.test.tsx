// @vitest-environment jsdom
import axe from 'axe-core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxItem } from './api';

const rpc = vi.fn();
vi.mock('@/ui/lib/real/supabaseBrowser', () => ({ getSupabaseBrowser: () => ({ rpc }) }));
import { NotificationBell } from './NotificationBell';
import { fetchInbox, fetchUnread, InboxError, markRead } from './api';

const item = (n: number, over: Partial<InboxItem> = {}): InboxItem => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, event_key: 'test.live', subject: `Subject ${n}`, body: `Body ${n}`, link: null,
  created_at: `2026-11-0${(n % 9) + 1}T10:00:00Z`, is_read: false, company_name: null, ...over,
});
let inbox: InboxItem[]; let unread: number;
beforeEach(() => {
  inbox = [item(1), item(2, { is_read: true }), item(3, { link: '/my-bookings', company_name: 'Delta Express' })]; unread = 2;
  rpc.mockReset().mockImplementation(async (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'my_unread_count') return { data: unread, error: null };
    if (fn === 'my_inbox') return { data: inbox, error: null };
    if (fn === 'mark_my_notices_read') { const ids = args?.p_ids as string[] | null; const n = inbox.filter((x) => !x.is_read && (!ids || ids.includes(x.id))).length; unread = Math.max(0, unread - n); return { data: n, error: null }; }
    return { data: null, error: { message: 'unexpected' } };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('inbox api', () => {
  const client = { rpc } as never;
  it('sends only paging arguments, never a user or company id', async () => {
    await fetchInbox(client, { before: '2026-11-01T00:00:00Z', beforeId: 'x' });
    expect(rpc).toHaveBeenCalledWith('my_inbox', { p_limit: 20, p_before: '2026-11-01T00:00:00Z', p_before_id: 'x' });
    await fetchUnread(client); await markRead(client);
    expect(rpc).toHaveBeenCalledWith('mark_my_notices_read', { p_ids: null });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/user_id|company_id|p_user|p_company/);
  });
  it('a database error becomes a generic InboxError without its message', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000', message: 'relation notifications host db.internal' } });
    const e = await fetchUnread(client).catch((x) => x);
    expect(e).toBeInstanceOf(InboxError); expect(String(e.message)).not.toContain('internal');
  });
});

describe('NotificationBell', () => {
  it('shows the unread count in the badge and in the accessible name', async () => {
    render(<NotificationBell lang="en" />);
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeTruthy();
    expect(screen.getByTestId('bell-badge').textContent).toBe('2');
  });
  it('no badge at zero, "99+" at the cap', async () => {
    unread = 0;
    const { unmount } = render(<NotificationBell lang="en" />);
    await screen.findByRole('button', { name: 'Notifications' });
    expect(screen.queryByTestId('bell-badge')).toBeNull();
    unmount(); unread = 99;
    render(<NotificationBell lang="en" />);
    expect((await screen.findByTestId('bell-badge')).textContent).toBe('99+');
  });
  it('opening loads the inbox: unread are marked, a company name and a link are shown', async () => {
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const panel = await screen.findByRole('region', { name: 'Notifications' });
    await within(panel).findByText('Subject 1');
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);
    expect(within(panel).getByRole('link').getAttribute('href')).toBe('/my-bookings');
    expect(panel.textContent).toContain('From Delta Express');
  });
  it('clicking a notice marks it read and lowers the badge; a read one sends nothing', async () => {
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByText('Subject 1'));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('mark_my_notices_read', { p_ids: [inbox[0]!.id] }));
    expect(screen.getByTestId('bell-badge').textContent).toBe('1');
    rpc.mockClear();
    await userEvent.click(screen.getByText('Subject 2'));
    expect(rpc).not.toHaveBeenCalledWith('mark_my_notices_read', expect.anything());
  });
  it('"Mark all as read" clears the badge', async () => {
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });
  it('a full page offers "Show older" and appends the next page by keyset', async () => {
    inbox = Array.from({ length: 20 }, (_, i) => item(i + 1));
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const more = await screen.findByRole('button', { name: 'Show older' });
    inbox = [item(21), item(22)];
    await userEvent.click(more);
    await screen.findByText('Subject 21');
    expect(rpc).toHaveBeenLastCalledWith('my_inbox', { p_limit: 20, p_before: inbox.length ? expect.any(String) : null, p_before_id: expect.stringMatching(/0020$/) });
    expect(screen.queryByRole('button', { name: 'Show older' })).toBeNull();      // a short page is the end
  });
  it('empty inbox says so', async () => {
    inbox = []; unread = 0;
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('No notifications yet.')).toBeTruthy();
  });
  it('Escape closes the panel and returns focus to the bell; clicking outside closes it too', async () => {
    render(<NotificationBell lang="en" />);
    const btn = await screen.findByRole('button', { name: /Notifications/ });
    await userEvent.click(btn);
    await screen.findByRole('region', { name: 'Notifications' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull();
    expect(document.activeElement).toBe(btn);
    await userEvent.click(btn);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('region', { name: 'Notifications' })).toBeNull();
  });
  it('a load failure shows a generic message with Try again, never the database text', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'my_unread_count' ? { data: 0, error: null } : { data: null, error: { message: 'secret host' } }));
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load notifications.');
    expect(alert.textContent).not.toContain('secret');
    rpc.mockImplementation(async (fn: string) => (fn === 'my_unread_count' ? { data: 0, error: null } : { data: [item(1)], error: null }));
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByText('Subject 1');
  });
  it('an unreachable count does not break the bell (no badge, still opens)', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'my_unread_count' ? { data: null, error: { message: 'down' } } : { data: [], error: null }));
    render(<NotificationBell lang="en" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(screen.queryByTestId('bell-badge')).toBeNull();
    expect(await screen.findByText('No notifications yet.')).toBeTruthy();
  });
  it('refreshes the count about every minute while the page is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotificationBell lang="en" />);
    await screen.findByTestId('bell-badge');
    const before = rpc.mock.calls.filter((c) => c[0] === 'my_unread_count').length;
    unread = 5;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await waitFor(() => expect(screen.getByTestId('bell-badge').textContent).toBe('5'));
    expect(rpc.mock.calls.filter((c) => c[0] === 'my_unread_count').length).toBeGreaterThan(before);
  });
  it('Arabic: labels, direction and no axe violations with the panel open', async () => {
    const { container } = render(<NotificationBell lang="ar" />);
    await userEvent.click(await screen.findByRole('button', { name: /الإشعارات/ }));
    const panel = await screen.findByRole('region', { name: 'الإشعارات' });
    expect(panel.getAttribute('dir')).toBe('rtl');
    expect(screen.getByRole('button', { name: 'تحديد الكل كمقروء' })).toBeTruthy();
    await within(panel).findByText('Subject 1');
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});
