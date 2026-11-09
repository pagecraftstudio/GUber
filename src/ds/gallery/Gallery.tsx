'use client';
/** Every component and state, in one language. Rendered by /dev/design (dev and preview only) and by the axe test. */
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Lang } from '../format';
import { formatDate, formatDuration, formatMoney, formatNumber, formatPercent, formatTime } from '../format';
import { DsLangProvider } from '../lang';
import * as ds from '..';

const SAMPLE = {
  en: { phone: 'Phone', name: 'Full name', student: 'Student ID', uni: 'University', trip: 'Cairo to Alexandria', operator: 'Delta Express', stops: ['Cairo, Ramses', 'Banha', 'Tanta', 'Alexandria, Sidi Gaber'], pol: 'Free cancellation up to 6 hours before departure.', person: 'Omar Hassan', empty: 'No bookings yet', save: 'Save changes' },
  ar: { phone: 'رقم الهاتف', name: 'الاسم الكامل', student: 'الرقم الجامعي', uni: 'الجامعة', trip: 'القاهرة إلى الإسكندرية', operator: 'دلتا إكسبرس', stops: ['القاهرة، رمسيس', 'بنها', 'طنطا', 'الإسكندرية، سيدي جابر'], pol: 'إلغاء مجاني حتى ٦ ساعات قبل المغادرة.', person: 'عمر حسن', empty: 'لا توجد حجوزات بعد', save: 'حفظ التغييرات' },
} as const;

type Row = { id: string; ref: string; name: string; seats: number; paid: number; status: string };
const ROWS: Row[] = [{ id: '1', ref: 'MB-7K3Q9X', name: SAMPLE.en.person, seats: 2, paid: 300, status: 'confirmed' }, { id: '2', ref: 'MB-2H8D4M', name: 'Nour Adel', seats: 1, paid: 0, status: 'pending' }];
const labels = { saving: 'Saving', saved: 'Saved', error: () => 'Could not save' };
const ok = async () => ({ ok: true as const });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={title} className="flex flex-col gap-4 border-t border-line-default py-8"><h2 className="text-xl font-medium">{title}</h2>{children}</section>;
}

function Inner({ lang }: { lang: Lang }) {
  const s = SAMPLE[lang];
  const [dlg, setDlg] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sw, setSw] = useState(true);
  const [radio, setRadio] = useState('a');
  const [sort, setSort] = useState<ds.SortState>(null);
  const [pv, setPv] = useState({ name: '', phone: '', studentId: '', university: '' });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toast = ds.useToast();
  const stops = s.stops.map((n) => ({ name: n }));
  return (
    <div className="mx-auto max-w-4xl p-6 text-ink-primary">
      <h1 data-gallery="MASAR-DESIGN-GALLERY" className="text-[32px] leading-tight font-medium">Components ({lang})</h1>

      <Section title="Format">
        <ds.KeyValue items={[
          { label: 'Number', value: formatNumber(1234567, lang) }, { label: 'Money', value: formatMoney(150, 'EGP', lang) }, { label: 'Money fixed', value: formatMoney(150, 'EGP', lang, { fixed: true }) },
          { label: 'Date', value: formatDate('2026-11-09T09:30:00Z', lang, { timeZone: 'Africa/Cairo' }) }, { label: 'Time', value: formatTime('2026-11-09T09:30:00Z', lang, { timeZone: 'Africa/Cairo' }) },
          { label: 'Duration', value: formatDuration(210, lang) }, { label: 'Percent', value: formatPercent(0.42, lang) }, { label: 'Identifier', value: <ds.Identifier value="MB-7K3Q9X" copy /> },
        ]} />
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <ds.Button>{s.save}</ds.Button><ds.Button variant="secondary">Secondary</ds.Button><ds.Button variant="ghost">Ghost</ds.Button><ds.Button variant="destructive" iconStart={<Trash2 size={16} strokeWidth={1.5} />}>Delete</ds.Button>
          <ds.Button loading>Loading</ds.Button><ds.Button disabled>Disabled</ds.Button><ds.Button size="lg" iconEnd={<Plus size={16} strokeWidth={1.5} />}>Large</ds.Button>
          <ds.IconButton label="Add" icon={<Plus size={18} strokeWidth={1.5} />} variant="secondary" />
        </div>
      </Section>

      <Section title="Fields">
        <div className="grid gap-4 sm:grid-cols-2">
          <ds.Field label={s.name} required hint="As on your student card"><ds.Input /></ds.Field>
          <ds.Field label={s.phone} error="Enter a valid phone number"><ds.DigitInput kind="tel" defaultValue="0101234567" /></ds.Field>
          <ds.Field label={s.uni}><ds.Select defaultValue="a"><option value="a">Cairo University</option><option value="b">Alexandria University</option></ds.Select></ds.Field>
          <ds.Field label="Notes"><ds.Textarea /></ds.Field>
          <ds.Field label="Date"><ds.DatePicker /></ds.Field><ds.Field label="Time"><ds.TimePicker /></ds.Field>
          <ds.Field label="Disabled" disabled><ds.Input defaultValue="Read only" /></ds.Field>
          <ds.Field label="Logo"><ds.FileUpload onFile={() => {}} /></ds.Field>
        </div>
        <ds.Checkbox label="I accept the cancellation policy" hint="Shown before you confirm" />
        <ds.RadioGroup legend="Payment" name="pay" value={radio} onChange={setRadio} options={[{ value: 'a', label: 'Pay at boarding' }, { value: 'b', label: 'Pay now', hint: 'Card' }]} />
        <ds.Switch checked={sw} onChange={setSw} label="Route active" />
        <div className="flex flex-wrap gap-6">
          <ds.AutoSelect id="1" value="active" label="Status" options={[['active', 'Active'], ['inactive', 'Inactive']]} save={ok} labels={labels} />
          <ds.AutoSwitch id="1" checked label="Active" save={ok} labels={labels} />
          <ds.AutoInput id="1" value="150" label="Amount paid" save={ok} labels={labels} />
          <ds.SaveStatus view={{ kind: 'error', code: 'x' }} labels={labels} />
        </div>
      </Section>

      <Section title="Feedback">
        <ds.InlineAlert tone="info" title="Info">Seats are held for 10 minutes.</ds.InlineAlert>
        <ds.InlineAlert tone="success">Booking confirmed.</ds.InlineAlert>
        <ds.InlineAlert tone="warning" title="Almost full">Three seats left.</ds.InlineAlert>
        <ds.InlineAlert tone="error" title="Payment failed">Try another card.</ds.InlineAlert>
        <div className="flex flex-wrap gap-3">
          <ds.Button variant="secondary" onClick={() => toast.show('Saved', 'success')}>Toast</ds.Button>
          <ds.Button variant="secondary" onClick={() => setDlg(true)}>Confirm dialog</ds.Button>
          <ds.Button variant="secondary" onClick={() => setDrawer(true)}>Drawer</ds.Button>
          <ds.Tooltip text="Copy reference"><ds.IconButton label="Copy" icon={<Plus size={18} strokeWidth={1.5} />} variant="secondary" /></ds.Tooltip>
        </div>
        <ds.ConfirmDialog open={dlg} title="Cancel this booking?" description="Seats are released and cannot be restored." confirmLabel="Cancel booking" cancelLabel="Keep booking" tone="destructive" onConfirm={() => setDlg(false)} onCancel={() => setDlg(false)} />
        <ds.Drawer open={drawer} onClose={() => setDrawer(false)} title="Details">Drawer content</ds.Drawer>
        <div className="grid gap-4 sm:grid-cols-2"><ds.EmptyState title={s.empty} description="Bookings appear here." action={<ds.Button variant="secondary">Create booking</ds.Button>} /><ds.ErrorState onRetry={() => {}} /></div>
        <ds.SkeletonCard />
      </Section>

      <Section title="Data">
        <div className="flex flex-wrap gap-2">{(['pending', 'confirmed', 'cancelled', 'no_show'] as const).map((v) => <ds.StatusBadge key={v} domain="booking" value={v} lang={lang} />)}<ds.StatusBadge domain="trip" value="boarding" lang={lang} /><ds.StatusBadge domain="payment" value="partial" lang={lang} /></div>
        <ds.FilterBar search={<ds.Field label="Search"><ds.DigitInput kind="identifier" /></ds.Field>} applied={[{ key: 'p', label: 'Unpaid' }]} onRemove={() => {}} onClear={() => {}} />
        <ds.DataTable<Row> caption="Bookings" rowId={(r) => r.id} rows={ROWS} sort={sort} onSortChange={setSort} selected={sel} onSelectedChange={setSel} actionsHeader="Actions"
          columns={[
            { key: 'ref', header: 'Reference', primary: true, sortable: true, cell: (r) => <ds.Identifier value={r.ref} /> },
            { key: 'name', header: 'Passenger', cell: (r) => r.name },
            { key: 'seats', header: 'Seats', numeric: true, cell: (r) => formatNumber(r.seats, lang) },
            { key: 'paid', header: 'Paid', numeric: true, sortable: true, cell: (r) => formatMoney(r.paid, 'EGP', lang, { fixed: true }) },
            { key: 'status', header: 'Status', cell: (r) => <ds.StatusBadge domain="booking" value={r.status} lang={lang} /> },
          ]}
          rowActions={(r) => <ds.Button variant="ghost" aria-label={`Cancel ${r.ref}`}>Cancel</ds.Button>} />
        <ds.Pagination page={2} pageCount={9} onPageChange={() => {}} />
        <div className="grid gap-4 sm:grid-cols-3"><ds.MetricCard label="Bookings today" value={formatNumber(48, lang)} comparison="+12 vs last week" /><ds.MetricCard label="Seats sold" value={formatPercent(0.82, lang)} /></div>
        <ds.Breadcrumbs items={[{ label: 'Trips', href: '#' }, { label: s.trip }]} />
        <ds.Tabs label="Trip" dir={lang === 'ar' ? 'rtl' : 'ltr'} tabs={[{ id: 'a', label: 'Manifest', panel: 'Manifest' }, { id: 'b', label: 'Details', panel: 'Details' }]} />
      </Section>

      <Section title="Domain">
        <ds.TripCard operator={{ name: s.operator }} departureAt="2026-11-09T06:30:00Z" arrivalAt="2026-11-09T10:00:00Z" durationMinutes={210} seatsLeft={7} price={{ amount: 150, currency: 'EGP' }} stops={stops} timeZone="Africa/Cairo" lang={lang}
          action={<ds.Button>Select seats</ds.Button>} seatsLeftLabel={(n) => `${n} seats left`} soldOutLabel="Sold out" />
        <ds.RouteLine stops={stops} />
        <ds.OccupancyBar booked={32} boarded={20} capacity={50} label="Seats" figures={`${formatNumber(32, lang)} / ${formatNumber(50, lang)}`} />
        <ds.PassengerForm values={pv} onChange={setPv} errors={{ phone: 'Enter a valid phone number' }} labels={{ name: s.name, phone: s.phone, studentId: s.student, university: s.uni }} />
        <ds.PaymentSummary lines={[{ label: '2 seats', amount: 300 }]} total={{ label: 'Total', amount: 300 }} currency="EGP" lang={lang} policyLabel="Cancellation" policy={s.pol} />
        <ds.BookingSummary title={s.trip} whenText={formatDate('2026-11-09T06:30:00Z', lang)} seatsLabel="2" passengers={[s.person]} labels={{ seats: 'Seats', passengers: 'Passengers', notes: 'Notes', when: 'Departure' }} />
        <ds.VehicleDriverCard plate="ABC 1234" model="Mercedes Tourismo" capacityLabel="50 seats" driverName={s.person} driverPhone="+201012345678" busStatus="active" />
        <ul><ds.ManifestRow name={s.person} seatsLabel="2 seats" phone="+201012345678" boarding="not_boarded" size="driver" action={<ds.Button size="lg">Board</ds.Button>} /></ul>
        <ds.Ticket company={{ name: s.operator }} tenant={{ accent: '#0f766e', onAccent: '#ffffff' }} reference="MB-7K3Q9X" qr={<div className="size-32 bg-surface-sunken" role="img" aria-label="QR code" />} passengerName={s.person} seatLabel="A4" whenText={formatDate('2026-11-09T06:30:00Z', lang)} stops={stops} paymentStatus="paid" labels={{ reference: 'Reference', passenger: 'Passenger', seat: 'Seat', departure: 'Departure' }} />
      </Section>
    </div>
  );
}

export function Gallery({ lang }: { lang: Lang }) {
  return (
    <DsLangProvider value={lang}>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="bg-surface-page"><ds.ToastProvider><Inner lang={lang} /></ds.ToastProvider></div>
    </DsLangProvider>
  );
}
