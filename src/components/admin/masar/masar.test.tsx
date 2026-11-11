// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '@/ds/test-setup';
import { DsLangProvider } from '@/ds/lang';
import type { AdminActionState } from '@/features/admin/action-state';
import type { AdminCompanyDetail, AdminCompanyListItem } from '@/features/companies/admin-output';

const act = vi.hoisted(() => {
  const mk = () => vi.fn(async (_p: unknown, _fd: FormData) => ({ status: 'ok' }) as AdminActionState);
  return { create: mk(), update: mk(), setStatus: mk(), note: mk(), invite: mk(), revoke: mk(), assign: mk(), subStatus: mk(), subPeriod: mk() };
});
vi.mock('@/features/admin/actions', () => ({
  createCompanyAction: act.create, updateCompanyAction: act.update, setCompanyStatusAction: act.setStatus, addCompanyNoteAction: act.note, inviteOwnerAction: act.invite,
  revokeInviteAction: act.revoke, assignSubscriptionAction: act.assign, setSubscriptionStatusAction: act.subStatus, setSubscriptionPeriodAction: act.subPeriod,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/companies', useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, refresh() {} }) }));

import { AdminActionDialog } from './AdminActionDialog';
import { CompaniesMasarView } from './CompaniesMasarView';
import { CompanyDetailMasarView, type CompanyDetailMasarViewProps } from './CompanyDetailMasarView';
import { AddNoteForm, CreateCompanyForm, EditCompanyForm, InviteOwnerForm } from './CompanyFormsMasar';

beforeAll(polyfillDialog);
beforeEach(() => Object.values(act).forEach((f) => f.mockClear()));
afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<DsLangProvider value="en">{ui}</DsLangProvider>);

const item = (n: number, over: Partial<AdminCompanyListItem> = {}): AdminCompanyListItem => ({ id: `c${n}`, name: `Delta ${n}`, slug: `delta-${n}`, status: 'active', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', createdAt: '2026-10-05T09:00:00Z', planCode: 'pro', planName: 'Pro', subscriptionStatus: 'active', periodEnd: null, ...over });
const page = (items: AdminCompanyListItem[], total = items.length, pageNo = 1) => ({ data: { items, total, page: pageNo, pageSize: 20, hasMore: false } as never });

describe('companies list', () => {
  it('shows each company with status, plan, contact and a link to the detail', () => {
    wrap(<CompaniesMasarView query={{}} canCreate result={page([item(1), item(2, { status: 'suspended', planName: null, planCode: null, subscriptionStatus: null, contactName: null, contactEmail: null })])} />);
    const table = screen.getByRole('table', { name: 'Companies' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByRole('link', { name: 'Delta 1' }).getAttribute('href')).toBe('/admin/companies/c1');
    expect(within(rows[1]!).getByText('Pro')).toBeTruthy();
    expect(within(rows[2]!).getByText('Suspended')).toBeTruthy();
    expect(within(rows[2]!).getByText('No live plan')).toBeTruthy();
    expect(screen.getByText('2 companies')).toBeTruthy();
  });
  it('slugs and emails are identifiers: left-to-right', () => {
    const { container } = wrap(<CompaniesMasarView query={{}} canCreate result={page([item(1)])} />);
    const bdis = [...container.querySelectorAll('bdi')].map((b) => [b.textContent, b.getAttribute('dir')]);
    expect(bdis).toEqual(expect.arrayContaining([['delta-1', 'ltr'], ['mona@delta.example', 'ltr']]));
  });
  it('New company is only offered to who may create (UI only; the server decides)', () => {
    const { rerender } = wrap(<CompaniesMasarView query={{}} canCreate result={page([item(1)])} />);
    expect(screen.getByRole('link', { name: 'New company' }).getAttribute('href')).toBe('/admin/companies/new');
    rerender(<DsLangProvider value="en"><CompaniesMasarView query={{}} canCreate={false} result={page([item(1)])} /></DsLangProvider>);
    expect(screen.queryByRole('link', { name: 'New company' })).toBeNull();
  });
  it('filters: values come from the URL, chips are links that drop one filter, clear drops all', () => {
    wrap(<CompaniesMasarView query={{ q: 'del', status: 'trial' }} canCreate result={page([item(1)])} />);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('del');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('trial');
    expect(screen.getByRole('link', { name: 'Remove filter: Search: del' }).getAttribute('href')).toBe('/admin/companies?status=trial');
    expect(screen.getByRole('link', { name: 'Remove filter: Status: Trial' }).getAttribute('href')).toBe('/admin/companies?q=del');
    expect(screen.getByRole('link', { name: 'Clear all' }).getAttribute('href')).toBe('/admin/companies');
    expect(screen.getByText('1 company match')).toBeTruthy();
  });
  it('pagination links keep the filters', () => {
    wrap(<CompaniesMasarView query={{ q: 'del' }} canCreate result={page([item(1)], 45, 2)} />);
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/admin/companies?q=del&page=3');
    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe('/admin/companies?q=del');
  });
  it('empty (with and without filters) and error states', () => {
    const { rerender } = wrap(<CompaniesMasarView query={{}} canCreate result={page([])} />);
    expect(screen.getByText('No companies yet')).toBeTruthy();
    rerender(<DsLangProvider value="en"><CompaniesMasarView query={{ q: 'zzz' }} canCreate result={page([])} /></DsLangProvider>);
    expect(screen.getByText('No companies match')).toBeTruthy();
    rerender(<DsLangProvider value="en"><CompaniesMasarView query={{}} canCreate result={{ error: 'Service unavailable' }} /></DsLangProvider>);
    expect(screen.getByRole('alert').textContent).toContain('Service unavailable');
  });
});

describe('AdminActionDialog', () => {
  const dlg = (over: Partial<React.ComponentProps<typeof AdminActionDialog>> = {}) => wrap(
    <AdminActionDialog triggerLabel="Suspend" tone="danger" title="Suspend this company?" description="Staff lose access immediately." confirmLabel="Suspend company" action={act.setStatus} hidden={{ companyId: 'c1', status: 'suspended' }} reason={{ label: 'Reason', hint: 'At least 3 characters.' }} {...over} />,
  );
  it('opens a labelled dialog that spells out the consequence; a danger action focuses Cancel first', async () => {
    const { container } = dlg();
    expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    const d = container.querySelector('dialog')!;
    expect(d.hasAttribute('open')).toBe(true);
    expect(within(d).getByRole('heading', { name: 'Suspend this company?' })).toBeTruthy();
    expect(within(d).getByText('Staff lose access immediately.')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Cancel');
  });
  it('a non-danger action focuses the confirm button', async () => {
    dlg({ tone: 'primary', reason: undefined, triggerLabel: 'Reactivate', confirmLabel: 'Reactivate now' });
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    expect(document.activeElement?.textContent).toBe('Reactivate now');
  });
  it('a reason is required: an empty one never reaches the server action', async () => {
    dlg();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suspend company' }));
    expect(act.setStatus).not.toHaveBeenCalled();
  });
  it('submits the hidden values and the reason, then closes on success', async () => {
    const { container } = dlg();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.type(screen.getByLabelText(/Reason/), 'Unpaid for 60 days');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend company' }));
    await waitFor(() => expect(act.setStatus).toHaveBeenCalledTimes(1));
    const fd = act.setStatus.mock.calls[0]![1];
    expect(Object.fromEntries(fd.entries())).toEqual({ companyId: 'c1', status: 'suspended', reason: 'Unpaid for 60 days' });
    await waitFor(() => expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(false));
  });
  it('a refusal stays open and shows the message; a field error shows under its field', async () => {
    act.setStatus.mockResolvedValueOnce({ status: 'error', message: 'You cannot do that.' });
    dlg({ reason: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Suspend company' }));
    expect((await screen.findByRole('alert')).textContent).toContain('You cannot do that.');
    cleanup();
    act.assign.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { periodDays: 'invalid_period' } });
    wrap(<AdminActionDialog triggerLabel="Assign plan" title="Assign" description="d" confirmLabel="Assign" action={act.assign} hidden={{ companyId: 'c1' }} fields={[{ name: 'periodDays', label: 'Days', kind: 'number', defaultValue: '30' }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Assign plan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(await screen.findByText('Enter a whole number of days from 1 to 1830.')).toBeTruthy();
    expect(screen.getByLabelText(/Days/).getAttribute('aria-invalid')).toBe('true');
  });
  it('Cancel closes without calling the action', async () => {
    const { container } = dlg();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    expect(act.setStatus).not.toHaveBeenCalled();
  });
});

const detail = (over: { company?: Partial<AdminCompanyDetail['company']>; subscription?: AdminCompanyDetail['subscription']; owners?: AdminCompanyDetail['owners']; pendingInvites?: AdminCompanyDetail['pendingInvites']; notes?: AdminCompanyDetail['notes'] } = {}): AdminCompanyDetail => ({
  company: { id: 'c1', name: 'Delta Express', slug: 'delta-express', status: 'active', legalName: 'Delta Express LLC', taxNumber: '123-456', contactName: 'Mona Ali', contactEmail: 'mona@delta.example', contactPhone: '+201012345678', country: 'EG', suspendedAt: null, suspensionReason: null, createdAt: '2026-10-05T09:00:00Z', updatedAt: '2026-10-06T09:00:00Z', ...over.company },
  settings: { timezone: 'Africa/Cairo', currency: 'EGP', defaultLocale: 'ar', bookingEnabled: true },
  subscription: over.subscription === undefined ? { id: 's1', planCode: 'pro', planName: 'Pro', status: 'active', billingInterval: 'monthly', currentPeriodStart: '2026-10-05T09:00:00Z', currentPeriodEnd: '2026-11-05T09:00:00Z', cancelAtPeriodEnd: false, isLive: true } : over.subscription,
  counts: { users: 4, buses: 6, drivers: 5, routes: 3, trips: 120, bookings: 3400 } as never,
  owners: over.owners ?? [{ userId: 'u1', fullName: 'Mona Ali', email: 'mona@delta.example', status: 'active' }],
  pendingInvites: over.pendingInvites ?? [{ id: 'i1', email: 'new@delta.example', roleKey: 'company_owner', expiresAt: '2026-11-20T09:00:00Z', createdAt: '2026-11-10T09:00:00Z' }],
  notes: over.notes ?? [{ id: 'n1', body: 'Called on Sunday.', createdAt: '2026-11-01T10:00:00Z', authorName: 'Sara' }],
  resumeStatus: 'active',
});
const view = (p: Partial<CompanyDetailMasarViewProps> & { data?: AdminCompanyDetail } = {}) => wrap(
  <CompanyDetailMasarView data={p.data ?? detail()} isSuper canSub canNote planOptions={[{ value: 'pro', label: 'Pro' }]} activity={[]} {...p} />,
);
const names = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('company detail', () => {
  it('facts: profile, usage with grouped English digits, owners, notes, UTC dates', () => {
    view();
    expect(screen.getByRole('heading', { level: 1, name: 'Delta Express' })).toBeTruthy();
    expect(screen.getByText('Delta Express LLC')).toBeTruthy();
    expect(screen.getByText('3,400')).toBeTruthy();
    expect(screen.getByText('Africa/Cairo · EGP')).toBeTruthy();
    expect(screen.getAllByText(/5 October 2026, 09:00 UTC/).length).toBeGreaterThan(0);
    expect(screen.getByText('Called on Sunday.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit details' }).getAttribute('href')).toBe('/admin/companies/c1/edit');
  });
  it('super admin sees every action on an active company', () => {
    view();
    for (const n of ['Suspend', 'Cancel company', 'Assign new plan', 'Change period', 'Mark past due', 'Cancel subscription', 'Revoke', 'Create invite', 'Add note']) expect(names()).toContain(n);
    expect(names()).not.toContain('Reactivate');
  });
  it('billing: subscription actions and nothing else; no edit link, no company status, no invite', () => {
    view({ isSuper: false, canSub: true, canNote: false });
    expect(names()).toEqual(expect.arrayContaining(['Assign new plan', 'Change period', 'Cancel subscription']));
    for (const n of ['Suspend', 'Cancel company', 'Revoke', 'Create invite', 'Add note']) expect(names()).not.toContain(n);
    expect(screen.queryByRole('link', { name: 'Edit details' })).toBeNull();
  });
  it('support: can write notes, nothing else', () => {
    view({ isSuper: false, canSub: false, canNote: true });
    expect(names()).toContain('Add note');
    for (const n of ['Suspend', 'Assign new plan', 'Change period', 'Revoke', 'Create invite']) expect(names()).not.toContain(n);
  });
  it('suspended: error banner with the reason, Reactivate instead of Suspend', () => {
    view({ data: detail({ company: { status: 'suspended', suspendedAt: '2026-11-01T08:00:00Z', suspensionReason: 'Unpaid' } }) });
    expect(screen.getByRole('alert').textContent).toMatch(/Staff, drivers and customers cannot use this company\./);
    expect(screen.getByText('Reason: Unpaid')).toBeTruthy();
    expect(names()).toContain('Reactivate');
    expect(names()).not.toContain('Suspend');
  });
  it('cancelled is final: no company, subscription-plan or invite actions, with the banner', () => {
    view({ data: detail({ company: { status: 'cancelled' } }) });
    expect(screen.getByText('This company cannot be changed back from the admin panel.')).toBeTruthy();
    for (const n of ['Suspend', 'Cancel company', 'Reactivate', 'Assign new plan', 'Create invite']) expect(names()).not.toContain(n);
    expect(screen.queryByRole('link', { name: 'Edit details' })).toBeNull();
  });
  it('trial company can be marked active', () => { view({ data: detail({ company: { status: 'trial' } }) }); expect(names()).toContain('Mark active'); });
  it('no subscription and a stale subscription both say new work is blocked', () => {
    view({ data: detail({ subscription: null }) });
    expect(screen.getByText('No subscription')).toBeTruthy();
    cleanup();
    view({ data: detail({ subscription: { id: 's1', planCode: 'pro', planName: 'Pro', status: 'active', billingInterval: 'monthly', currentPeriodStart: '2026-01-01T00:00:00Z', currentPeriodEnd: '2026-02-01T00:00:00Z', cancelAtPeriodEnd: false, isLive: false } }) });
    expect(screen.getByText('No live subscription')).toBeTruthy();
    expect(screen.getByText('Expired')).toBeTruthy();
  });
  it('no owner and no invite is called out; with an owner it is not', () => {
    view({ data: detail({ owners: [], pendingInvites: [] }) });
    expect(screen.getByText('No owner and no pending invite')).toBeTruthy();
    cleanup();
    view();
    expect(screen.queryByText('No owner and no pending invite')).toBeNull();
  });
  it('the plan picker offers only the plans it was given; assign is hidden when there are none', () => {
    view({ planOptions: [] });
    expect(names()).not.toContain('Assign new plan');
  });
  it('suspending sends the right hidden values through the same action', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'Fraud check');
    await userEvent.click(screen.getByRole('button', { name: 'Suspend company' }));
    await waitFor(() => expect(act.setStatus).toHaveBeenCalled());
    expect(Object.fromEntries(act.setStatus.mock.calls[0]![1].entries())).toEqual({ companyId: 'c1', status: 'suspended', reason: 'Fraud check' });
  });
});

describe('forms', () => {
  it('create: field errors come out as text, the typed values are kept, nothing raw leaks', async () => {
    act.create.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { slug: 'taken', ownerEmail: 'weird_internal_code' } });
    wrap(<CreateCompanyForm plans={[{ code: 'pro', name: 'Pro', trialDays: 14 }]} />);
    await userEvent.type(screen.getByLabelText(/Company name/), 'Delta');
    await userEvent.type(screen.getByLabelText(/^Slug/), 'delta');
    await userEvent.type(screen.getByLabelText(/Owner email/), 'o@delta.example');
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }));
    expect(await screen.findByText('Already in use.')).toBeTruthy();
    expect(screen.getByText('This value is not valid.')).toBeTruthy();
    expect((screen.getByLabelText(/Company name/) as HTMLInputElement).value).toBe('Delta');
  });
  it('create: success shows the one-time invite link (a credential) with a copy button, and next steps', async () => {
    act.create.mockResolvedValueOnce({ status: 'ok', companyId: 'c9', inviteUrl: 'https://masar.example/invite/SECRET', inviteExpiresAt: '2026-11-20T09:00:00Z' });
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    wrap(<CreateCompanyForm plans={[{ code: 'pro', name: 'Pro', trialDays: 14 }]} />);
    await userEvent.type(screen.getByLabelText(/Company name/), 'Delta');
    await userEvent.type(screen.getByLabelText(/^Slug/), 'delta');
    await userEvent.type(screen.getByLabelText(/Owner email/), 'o@delta.example');
    await userEvent.click(screen.getByRole('button', { name: 'Create company' }));
    expect(await screen.findByText(/cannot be shown again/)).toBeTruthy();
    expect((screen.getByLabelText('Invite link') as HTMLInputElement).value).toBe('https://masar.example/invite/SECRET');
    expect(screen.getByRole('link', { name: 'Open company' }).getAttribute('href')).toBe('/admin/companies/c9');
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(write).toHaveBeenCalledWith('https://masar.example/invite/SECRET');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });
  it('create: cannot be submitted without a plan to pick', () => {
    wrap(<CreateCompanyForm plans={[]} />);
    expect((screen.getByRole('button', { name: 'Create company' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('edit: keeps the company id out of the visible form, shows saved state and the clear-on-empty hint', async () => {
    act.update.mockResolvedValueOnce({ status: 'ok', message: 'Company details saved.' });
    const { container } = wrap(<EditCompanyForm company={{ id: 'c1', name: 'Delta', legalName: null, taxNumber: null, contactName: null, contactEmail: null, contactPhone: null, country: 'EG' }} />);
    expect((container.querySelector('input[name=companyId]') as HTMLInputElement).type).toBe('hidden');
    expect(screen.getByText(/An empty optional field clears it/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Company details saved.')).toBeTruthy();
  });
  it('note and invite-owner forms report their errors under the field', async () => {
    act.note.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { body: 'invalid' } });
    wrap(<AddNoteForm companyId="c1" />);
    await userEvent.type(screen.getByLabelText(/Internal note/), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('This value is not valid.')).toBeTruthy();
    cleanup();
    act.invite.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { email: 'already_member' } });
    wrap(<InviteOwnerForm companyId="c1" />);
    await userEvent.type(screen.getByLabelText(/Invite another owner/), 'a@b.example');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByText('This person already belongs to a company.')).toBeTruthy();
  });
});

describe('typed input survives a failed submit (React resets the form after an action)', () => {
  it('edit: what was typed stays, not the saved value', async () => {
    act.update.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { contactEmail: 'invalid' } });
    wrap(<EditCompanyForm company={{ id: 'c1', name: 'Delta', legalName: null, taxNumber: null, contactName: null, contactEmail: 'old@delta.example', contactPhone: null, country: 'EG' }} />);
    const email = screen.getByLabelText(/Contact email/) as HTMLInputElement;
    await userEvent.clear(email); await userEvent.type(email, 'new@delta.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('This value is not valid.')).toBeTruthy();
    expect((screen.getByLabelText(/Contact email/) as HTMLInputElement).value).toBe('new@delta.example');
  });
  it('invite owner and note keep their text on error; the note field empties after a success', async () => {
    act.invite.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { email: 'pending' } });
    wrap(<InviteOwnerForm companyId="c1" />);
    await userEvent.type(screen.getByLabelText(/Invite another owner/), 'a@b.example');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByText('An invite for this email is already pending.')).toBeTruthy();
    expect((screen.getByLabelText(/Invite another owner/) as HTMLInputElement).value).toBe('a@b.example');
    cleanup();
    act.note.mockResolvedValueOnce({ status: 'error', message: 'x', fields: { body: 'invalid' } }).mockResolvedValueOnce({ status: 'ok' });
    wrap(<AddNoteForm companyId="c1" />);
    await userEvent.type(screen.getByLabelText(/Internal note/), 'draft text');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await screen.findByText('This value is not valid.');
    expect((screen.getByLabelText(/Internal note/) as HTMLTextAreaElement).value).toBe('draft text');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect((screen.getByLabelText(/Internal note/) as HTMLTextAreaElement).value).toBe(''));
  });
});

describe('axe on the admin screens', () => {
  const run = async (ui: React.ReactElement) => {
    const { container } = wrap(ui);
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  };
  it('list', async () => expect(await run(<CompaniesMasarView query={{ q: 'a', status: 'active' }} canCreate result={page([item(1), item(2, { planName: null, subscriptionStatus: null })], 40)} />)).toEqual([]));
  it('detail (super admin, with invites, notes, activity)', async () => expect(await run(<CompanyDetailMasarView data={detail()} isSuper canSub canNote planOptions={[{ value: 'pro', label: 'Pro' }]} activity={[]} />)).toEqual([]));
  it('detail (suspended)', async () => expect(await run(<CompanyDetailMasarView data={detail({ company: { status: 'suspended', suspendedAt: '2026-11-01T08:00:00Z', suspensionReason: 'Unpaid' }, subscription: null })} isSuper canSub canNote planOptions={[]} activity={null} />)).toEqual([]));
  it('create form', async () => expect(await run(<CreateCompanyForm plans={[{ code: 'pro', name: 'Pro', trialDays: 14 }]} />)).toEqual([]));
  it('open action dialog', async () => {
    const { container } = wrap(<AdminActionDialog triggerLabel="Suspend" tone="danger" title="Suspend?" description="d" confirmLabel="Suspend company" action={act.setStatus} hidden={{ companyId: 'c1' }} reason={{ label: 'Reason' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});
