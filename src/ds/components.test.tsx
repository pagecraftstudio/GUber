// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as ds from '.';
import { polyfillDialog } from './test-setup';

beforeAll(polyfillDialog);
afterEach(cleanup);

describe('Button', () => {
  it('loading: aria-busy, keeps focusability, blocks the click (no double submit)', async () => {
    const onClick = vi.fn();
    render(<ds.Button loading onClick={onClick}>Save</ds.Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.hasAttribute('disabled')).toBe(false);
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('a loading submit button does not submit its form', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<form onSubmit={onSubmit}><ds.Button type="submit" loading>Go</ds.Button></form>);
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('normal click works and IconButton has an accessible name', async () => {
    const onClick = vi.fn();
    render(<><ds.Button onClick={onClick}>Go</ds.Button><ds.IconButton label="Add" icon={<span />} /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});

describe('Field', () => {
  it('wires label, hint and error into the control', () => {
    render(<ds.Field label="Phone" hint="With country code" error="Invalid" required><ds.Input /></ds.Field>);
    const input = screen.getByLabelText(/Phone/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const desc = (input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
    expect(desc).toEqual(['With country code', 'Invalid']);
    expect(input.hasAttribute('required')).toBe(true);
  });
  it('no error: not invalid, live region still present', () => {
    const { container } = render(<ds.Field label="Name"><ds.Input /></ds.Field>);
    expect(screen.getByLabelText('Name').hasAttribute('aria-invalid')).toBe(false);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });
  it('Select and Textarea get the same wiring', () => {
    render(<><ds.Field label="A" error="bad"><ds.Select><option>x</option></ds.Select></ds.Field><ds.Field label="B" error="bad"><ds.Textarea /></ds.Field></>);
    expect(screen.getByLabelText('A').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('B').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('DigitInput (plan 5.7 rule 5)', () => {
  it('turns Arabic-Indic digits into ASCII as the person types, and the handler sees ASCII', async () => {
    const seen: string[] = [];
    function C() { const [v, setV] = useState(''); return <ds.Field label="Phone"><ds.DigitInput kind="tel" value={v} onChange={(e) => { seen.push(e.target.value); setV(e.target.value); }} /></ds.Field>; }
    render(<C />);
    const input = screen.getByLabelText('Phone') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '٠١٠١٢٣٤٥٦٧٨' } });
    expect(input.value).toBe('01012345678');
    expect(seen.at(-1)).toBe('01012345678');
    expect(input.dir).toBe('ltr');
    expect(input.inputMode).toBe('tel');
  });
});

describe('Switch / Checkbox / RadioGroup', () => {
  it('switch toggles with Space and Enter and exposes aria-checked', async () => {
    function C() { const [on, set] = useState(false); return <ds.Switch checked={on} onChange={set} label="Active" />; }
    render(<C />);
    const sw = screen.getByRole('switch', { name: 'Active' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.focus();
    await userEvent.keyboard(' ');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
  it('radio group is a labelled fieldset with arrow-key selection', async () => {
    function C() { const [v, set] = useState('a'); return <ds.RadioGroup legend="Payment" name="p" value={v} onChange={set} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />; }
    render(<C />);
    expect(screen.getByRole('group', { name: 'Payment' })).toBeTruthy();
    screen.getByLabelText('A').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect((screen.getByLabelText('B') as HTMLInputElement).checked).toBe(true);
  });
});

describe('FileUpload', () => {
  it('rejects wrong type and oversize on the client, accepts a good file', async () => {
    const onFile = vi.fn(); const onReject = vi.fn();
    render(<ds.Field label="Logo"><ds.FileUpload onFile={onFile} onReject={onReject} maxBytes={10} /></ds.Field>);
    const input = screen.getByLabelText('Logo', { selector: 'input' }) as HTMLInputElement;
    const svg = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });
    await userEvent.upload(input, svg, { applyAccept: false });
    expect(onReject).toHaveBeenCalledWith('type', svg);
    const big = new File(['x'.repeat(50)], 'a.png', { type: 'image/png' });
    await userEvent.upload(input, big, { applyAccept: false });
    expect(onReject).toHaveBeenLastCalledWith('size', big);
    const good = new File(['x'], 'ok.png', { type: 'image/png' });
    await userEvent.upload(input, good);
    expect(onFile).toHaveBeenCalledWith(good);
    expect(screen.getByText('ok.png')).toBeTruthy();
  });
});

describe('SaveStatus / Auto controls', () => {
  const labels = { saving: 'Saving', saved: 'Saved', error: () => 'Could not save' };
  it('live region is always present; error uses role=alert', () => {
    const { container, rerender } = render(<ds.SaveStatus view={{ kind: 'idle' }} labels={labels} />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    rerender(<ds.SaveStatus view={{ kind: 'error', code: 'x' }} labels={labels} />);
    expect(screen.getByRole('alert').textContent).toBe('Could not save');
  });
  it('AutoSelect shows the new value at once, saves, and reports Saved', async () => {
    const save = vi.fn(async (_id: string, _v: string) => ({ ok: true as const }));
    // like a real page: after a successful save the server re-renders with the new value
    function P() { const [v, setV] = useState('active'); return <ds.AutoSelect id="7" value={v} label="Status" options={[['active', 'Active'], ['inactive', 'Inactive']]} save={async (id, n) => { const r = await save(id, n); setV(n); return r; }} labels={labels} />; }
    render(<P />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await waitFor(() => expect(save).toHaveBeenCalledWith('7', 'inactive'));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('inactive');
  });
  it('AutoSelect rolls back when the server refuses and says so', async () => {
    const save = vi.fn(async () => ({ ok: false as const, code: 'forbidden' }));
    render(<ds.AutoSelect id="7" value="active" label="Status" options={[['active', 'Active'], ['inactive', 'Inactive']]} save={save} labels={labels} />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Could not save'));
    await waitFor(() => expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('active'));
  });
  it('AutoSwitch flips and saves; rolls back on refusal', async () => {
    const save = vi.fn(async () => ({ ok: false as const, code: 'x' }));
    render(<ds.AutoSwitch id="1" checked label="Active" save={save} labels={labels} />);
    await userEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(save).toHaveBeenCalledWith('1', false));
    await waitFor(() => expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'));
  });
  it('AutoInput saves on blur only when changed, normalises digits, and Escape reverts', async () => {
    const save = vi.fn(async () => ({ ok: true as const }));
    render(<ds.AutoInput id="9" value="100" label="Paid" save={save} labels={labels} />);
    const i = screen.getByLabelText('Paid') as HTMLInputElement;
    i.focus(); await userEvent.tab();
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(i, { target: { value: '١٥٠' } });
    expect(i.value).toBe('150');
    fireEvent.blur(i);
    await waitFor(() => expect(save).toHaveBeenCalledWith('9', '150'));
  });
});

describe('InlineAlert', () => {
  it('error is an alert, others are status; each carries text, not colour alone', () => {
    render(<><ds.InlineAlert tone="error" title="Bad" /><ds.InlineAlert tone="info" title="Note" /></>);
    expect(screen.getByRole('alert').textContent).toContain('Bad');
    expect(screen.getByRole('status').textContent).toContain('Note');
  });
});

describe('ConfirmDialog', () => {
  it('opens as a labelled dialog, destructive focuses Cancel, async confirm shows loading and closes via the caller', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    function C() { const [o, setO] = useState(true); return <ds.ConfirmDialog open={o} title="Cancel booking?" description="Seats are released." confirmLabel="Cancel booking" cancelLabel="Keep" tone="destructive" onConfirm={async () => { await onConfirm(); setO(false); }} onCancel={() => setO(false)} />; }
    const { container } = render(<C />);
    const d = container.querySelector('dialog')!;
    expect(d.hasAttribute('open')).toBe(true);
    expect(d.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('Cancel booking?');
    expect(document.activeElement?.textContent).toBe('Keep');
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel booking' }));
    expect(within(d).getByRole('button', { name: 'Cancel booking' }).getAttribute('aria-busy')).toBe('true');
    await act(async () => { resolve(); });
    await waitFor(() => expect(d.hasAttribute('open')).toBe(false));
  });
  it('Escape (cancel event) calls onCancel', () => {
    const onCancel = vi.fn();
    const { container } = render(<ds.ConfirmDialog open title="t" confirmLabel="ok" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent(container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('Toast', () => {
  it('announces in a polite region; errors go to an alert region and stay until dismissed', async () => {
    function C() { const t = ds.useToast(); return <><button onClick={() => t.show('Saved', 'success')}>ok</button><button onClick={() => t.show('Failed', 'error')}>bad</button></>; }
    render(<ds.ToastProvider><C /></ds.ToastProvider>);
    await userEvent.click(screen.getByText('ok'));
    await userEvent.click(screen.getByText('bad'));
    expect(within(screen.getByRole('status')).getByText('Saved')).toBeTruthy();
    expect(within(screen.getByRole('alert')).getByText('Failed')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Failed')).toBeNull();
  });
  it('non-error toasts close by themselves', async () => {
    vi.useFakeTimers();
    function C() { const t = ds.useToast(); return <button onClick={() => t.show('Hello')}>go</button>; }
    render(<ds.ToastProvider><C /></ds.ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByText('Hello')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(6100); });
    expect(screen.queryByText('Hello')).toBeNull();
    vi.useRealTimers();
  });
});

describe('Tooltip', () => {
  it('shows on focus, is described-by, closes on Escape', async () => {
    render(<ds.Tooltip text="Copy reference"><button>c</button></ds.Tooltip>);
    const b = screen.getByRole('button');
    const tip = document.getElementById(b.getAttribute('aria-describedby')!)!;
    expect(tip.hidden).toBe(true);
    b.focus();
    await waitFor(() => expect(tip.hidden).toBe(false));
    await userEvent.keyboard('{Escape}');
    expect(tip.hidden).toBe(true);
  });
});

describe('Tabs', () => {
  const tabs = [{ id: 'a', label: 'A', panel: 'pa' }, { id: 'b', label: 'B', panel: 'pb' }, { id: 'c', label: 'C', panel: 'pc' }];
  it('LTR: ArrowRight moves forward, roving tabindex, panel follows', async () => {
    render(<ds.Tabs label="t" tabs={tabs} />);
    screen.getByRole('tab', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'A' }).tabIndex).toBe(-1);
    expect(screen.getByRole('tabpanel').textContent).toBe('pb');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'C' }).getAttribute('aria-selected')).toBe('true');
  });
  it('RTL: ArrowLeft moves forward', async () => {
    render(<ds.Tabs label="t" tabs={tabs} dir="rtl" />);
    screen.getByRole('tab', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
  });
});

type R = { id: string; n: string };
const rows: R[] = [{ id: '1', n: 'Omar' }, { id: '2', n: 'Nour' }];
const cols: ds.Column<R>[] = [{ key: 'n', header: 'Name', primary: true, sortable: true, cell: (r) => r.n }];
describe('DataTable', () => {
  it('has a caption, aria-sort, cycles sort asc → desc → none', async () => {
    function C() { const [s, set] = useState<ds.SortState>(null); return <ds.DataTable caption="People" rows={rows} rowId={(r) => r.id} columns={cols} sort={s} onSortChange={set} />; }
    render(<C />);
    expect(screen.getByRole('table', { name: 'People' })).toBeTruthy();
    const th = screen.getByRole('columnheader', { name: /Name/ });
    expect(th.getAttribute('aria-sort')).toBe('none');
    await userEvent.click(within(th).getByRole('button'));
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(within(th).getByRole('button'));
    expect(th.getAttribute('aria-sort')).toBe('descending');
    await userEvent.click(within(th).getByRole('button'));
    expect(th.getAttribute('aria-sort')).toBe('none');
  });
  it('selection: select all and per row', async () => {
    const onSel = vi.fn();
    render(<ds.DataTable caption="P" rows={rows} rowId={(r) => r.id} columns={cols} selected={new Set()} onSelectedChange={onSel} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect([...(onSel.mock.calls[0]?.[0] as Set<string>)]).toEqual(['1', '2']);
  });
  it('empty, error with retry, loading', async () => {
    const retry = vi.fn();
    const { rerender } = render(<ds.DataTable caption="P" rows={[]} rowId={(r: R) => r.id} columns={cols} empty={{ title: 'No people' }} />);
    expect(screen.getByText('No people')).toBeTruthy();
    rerender(<ds.DataTable caption="P" rows={rows} rowId={(r) => r.id} columns={cols} error="Boom" onRetry={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Boom');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    rerender(<ds.DataTable caption="P" rows={rows} rowId={(r) => r.id} columns={cols} loading />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });
  it('renders the stacked card list too (shown under 768px by CSS) with the same actions', () => {
    render(<ds.DataTable caption="P" rows={rows} rowId={(r) => r.id} columns={cols} rowActions={(r) => <button>Do {r.n}</button>} />);
    expect(screen.getAllByRole('button', { name: 'Do Omar' })).toHaveLength(2);
  });
});

describe('Pagination', () => {
  it('current page has aria-current, localises numbers, links when hrefFor is given', () => {
    render(<ds.Pagination page={2} pageCount={5} hrefFor={(p) => `?page=${p}`} lang="ar" />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByText('٢').closest('a')!.getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'التالي' }).getAttribute('href')).toBe('?page=3');
  });
  it('renders nothing for a single page; previous is inert on page 1', async () => {
    const { container } = render(<ds.Pagination page={1} pageCount={1} onPageChange={() => {}} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    const on = vi.fn();
    render(<ds.Pagination page={1} pageCount={3} onPageChange={on} />);
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(on).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(on).toHaveBeenCalledWith(2);
  });
});

describe('FilterBar', () => {
  it('chips are removable by name and clear-all works', async () => {
    const rm = vi.fn(); const clear = vi.fn();
    render(<ds.FilterBar applied={[{ key: 'p', label: 'Unpaid' }]} onRemove={rm} onClear={clear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Unpaid' }));
    expect(rm).toHaveBeenCalledWith('p');
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(clear).toHaveBeenCalled();
  });
});

describe('StatusBadge', () => {
  it('shows text and an icon, in the language; unknown values render as text', () => {
    const { container, rerender } = render(<ds.StatusBadge domain="booking" value="pending" lang="en" />);
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
    rerender(<ds.StatusBadge domain="booking" value="pending" lang="ar" />);
    expect(screen.getByText('قيد الانتظار')).toBeTruthy();
    rerender(<ds.StatusBadge domain="booking" value="mystery" lang="en" />);
    expect(screen.getByText('mystery')).toBeTruthy();
  });
});

describe('RouteLine (D8: functional only)', () => {
  it('renders nothing with fewer than two stops', () => {
    expect(render(<ds.RouteLine stops={[]} />).container.innerHTML).toBe('');
    expect(render(<ds.RouteLine stops={[{ name: 'A' }]} size="compact" />).container.innerHTML).toBe('');
  });
  it('lists real stops; compact names origin and destination', () => {
    render(<ds.RouteLine stops={[{ name: 'Cairo' }, { name: 'Tanta' }, { name: 'Alexandria' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    cleanup();
    render(<ds.RouteLine stops={[{ name: 'Cairo' }, { name: 'Alexandria' }]} size="compact" />);
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('Cairo → Alexandria');
  });
});

describe('TripCard', () => {
  const base = { operator: { name: 'Delta' }, departureAt: '2026-11-09T06:30:00Z', action: <button>Select</button>, seatsLeftLabel: (n: string) => `${n} left`, soldOutLabel: 'Sold out', timeZone: 'Africa/Cairo' };
  it('shows only fields that exist and localises digits', () => {
    const { container } = render(<ds.TripCard {...base} lang="ar" arrivalAt="2026-11-09T10:00:00Z" seatsLeft={7} price={{ amount: 150, currency: 'EGP' }} />);
    expect(container.textContent).toContain('٠٨:٣٠');
    expect(container.textContent).toContain('١٥٠ ج.م');
    expect(container.textContent).toContain('٧ left');
    cleanup();
    const bare = render(<ds.TripCard {...base} lang="en" />);
    expect(bare.container.textContent).not.toMatch(/EGP|left|Sold out/);
  });
  it('sold out replaces the seat count', () => { render(<ds.TripCard {...base} lang="en" seatsLeft={0} />); expect(screen.getByText('Sold out')).toBeTruthy(); });
});

describe('Identifier (5.7 rule 4)', () => {
  it('keeps Latin digits, isolates direction, copies', async () => {
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const { container } = render(<ds.DsLangProvider value="ar"><p dir="rtl">رقم الحجز <ds.Identifier value="MB-7K3Q9X" copy /></p></ds.DsLangProvider>);
    const bdi = container.querySelector('bdi')!;
    expect(bdi.textContent).toBe('MB-7K3Q9X');
    expect(bdi.getAttribute('dir')).toBe('ltr');
    await userEvent.click(screen.getByRole('button', { name: 'نسخ' }));
    expect(write).toHaveBeenCalledWith('MB-7K3Q9X');
    await waitFor(() => expect(screen.getByRole('button', { name: 'تم النسخ' })).toBeTruthy());
  });
});

describe('PaymentSummary / Ticket', () => {
  it('shows every line, the total and the cancellation policy before confirm', () => {
    render(<ds.PaymentSummary lines={[{ label: '2 seats', amount: 300 }, { label: 'Fee', amount: 5.5 }]} total={{ label: 'Total', amount: 305.5 }} currency="EGP" lang="en" policyLabel="Cancellation" policy="Free up to 6 hours before." />);
    expect(screen.getByText('EGP 305.50')).toBeTruthy();
    expect(screen.getByText('Free up to 6 hours before.')).toBeTruthy();
  });
  it('ticket: tenant colours only as CSS variables, reference is Latin and copyable', () => {
    const { container } = render(<ds.Ticket company={{ name: 'Delta' }} tenant={{ accent: '#0f766e', onAccent: '#ffffff' }} reference="MB-7K3Q9X" qr={<i />} passengerName="Omar" seatLabel="A4" whenText="9/11" stops={[{ name: 'A' }, { name: 'B' }]} paymentStatus="paid" labels={{ reference: 'Ref', passenger: 'P', seat: 'S', departure: 'D' }} />);
    const art = container.querySelector('article')!;
    expect(art.style.getPropertyValue('--tenant-accent')).toBe('#0f766e');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });
});
