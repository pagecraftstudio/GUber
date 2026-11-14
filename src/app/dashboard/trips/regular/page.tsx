import Link from 'next/link';
import { T, Bi } from '@/components/dashboard/T';
import { Ltr } from '@/components/dashboard/Ltr';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { tripTemplateService } from '@/features/trip-templates/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';
import { TemplateForm } from '@/features/dashboard/TemplateForm';
import { TemplateActions } from '@/features/dashboard/TemplateActions';
import { DAY_LABELS } from '@/features/dashboard/template-text';

export default async function RegularTripsPage() {
  const auth = await requireTenant('trips.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  const has = (p: string) => auth.membership.permissions.includes(p);
  const canWrite = has('trips.write');
  const [templates, routes, buses, drivers] = await Promise.all([
    tripTemplateService.list(ctx),
    canWrite && has('routes.read') ? routeService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    canWrite && has('buses.read') ? busService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
    canWrite && has('drivers.read') ? driverService.list(ctx, { page: 1, pageSize: 100 }) : Promise.resolve({ items: [] }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Scheduling & dispatch" title="Regular trips" description="Trips that repeat on the same days every week. Each one creates normal trips you can book, assign and cancel."
        action={<Link href="/dashboard/trips" className="text-xs font-bold text-ink-link underline-offset-2 hover:underline"><T>Back to trips</T></Link>} />
      {canWrite && (
        <div className="mb-5">
          <TemplateForm routes={routes.items.map((r) => ({ id: r.id, label: r.name, origin: r.originName, destination: r.destinationName }))}
            buses={buses.items.map((b) => ({ id: b.id, plateNumber: b.plateNumber, capacity: b.capacity }))}
            drivers={drivers.items.filter((d) => d.status === 'active').map((d) => ({ id: d.id, label: d.fullName }))} />
        </div>
      )}
      <DataTable rows={templates} emptyTitle="No regular trips yet" emptyText="Add one above to repeat a trip every week."
        columns={[
          { key: 'name', label: 'Regular trip', render: (r) => <div className="font-bold text-ink-primary">{r.name}<p className="text-xs font-normal text-ink-secondary">{r.route?.originName} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> {r.route?.destinationName}</p></div> },
          { key: 'when', label: 'Schedule', render: (r) => <div><Ltr>{r.departureTime}</Ltr><p className="text-xs text-ink-secondary"><Bi en={r.daysOfWeek.map((d) => DAY_LABELS.en[d - 1]).join(', ')} ar={r.daysOfWeek.map((d) => DAY_LABELS.ar[d - 1]).join('، ')} /></p></div> },
          { key: 'prices', label: 'Prices', render: (r) => <div className="text-xs"><Bi en="Go" ar="ذهاب" /> <Ltr>{r.price}</Ltr>{r.returnTimes.length > 0 && <p className="text-ink-secondary"><Bi en="Return" ar="عودة" /> <Ltr>{r.returnPrice}</Ltr> · <Bi en="Both" ar="الاثنين" /> <Ltr>{r.roundTripPrice}</Ltr> · <Ltr>{r.returnTimes.join(', ')}</Ltr></p>}</div> },
          { key: 'resources', label: 'Assignment', render: (r) => <div>{r.bus?.plateNumber ? <Ltr>{r.bus.plateNumber}</Ltr> : <T>No bus</T>}<p className="text-xs text-ink-secondary">{r.driver?.fullName || <T>No driver</T>}</p></div> },
          { key: 'period', label: 'Period', render: (r) => <Ltr>{r.startDate}{r.endDate ? ` → ${r.endDate}` : ' →'}</Ltr> },
          { key: 'status', label: 'Status', render: (r) => <StatusPill value={r.isActive ? 'active' : 'inactive'} /> },
          { key: 'action', label: 'Actions', render: (r) => (canWrite ? <TemplateActions id={r.id} isActive={r.isActive} label={r.name} /> : null) },
        ]} />
    </>
  );
}
