import { T, Dt } from '@/components/dashboard/T';
import { Ltr } from '@/components/dashboard/Ltr';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext } from '@/lib/service/context';
import { customerService } from '@/features/customers/service';
import { bookingService } from '@/features/bookings/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';

const row = (label: string, value: React.ReactNode) => (
  <div key={label}><dt className="text-xs font-semibold text-slate-600 dark:text-slate-400"><T>{label}</T></dt><dd className="mt-0.5 text-sm font-medium">{value || '—'}</dd></div>
);

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant('customers.read');
  const ctx = createTenantServiceContext(await createClient(), auth);
  let customer;
  try {
    customer = await customerService.get(ctx, id); // malformed id and "someone else's customer" both end here: 404, same answer
  } catch (e) {
    if (e instanceof AppError && (e.code === 'not_found' || e.code === 'validation')) notFound();
    throw e;
  }
  const tz = await companyTimeZone(ctx);
  const canSeeBookings = auth.membership.permissions.includes('bookings.read');
  const bookings = canSeeBookings ? await bookingService.list(ctx, { customerId: customer.id, sort: 'newest', page: 1, pageSize: 50 }) : null;
  return (
    <>
      <PageHeader eyebrow="Passenger operations" title={customer.fullName} description="Customer details and booking history."
        action={<Link href="/dashboard/customers" className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"><T>Back to customers</T></Link>} />
      <div className="max-w-4xl space-y-6">
        <section aria-labelledby="cust-h" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="cust-h" className="font-bold"><T>Details</T></h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {row('Phone', customer.phone && <Ltr>{customer.phone}</Ltr>)}{row('Email', customer.email && <Ltr>{customer.email}</Ltr>)}{row('University', customer.university)}{row('Student number', customer.studentId)}
            {row('Customer since', <Dt value={customer.createdAt} />)}{row('Staff notes', customer.notes)}
          </dl>
        </section>
        {bookings && (
          <section aria-labelledby="bk-h">
            <h2 id="bk-h" className="mb-3 font-bold"><T>Bookings</T> ({bookings.total})</h2>
            <DataTable rows={bookings.items} emptyTitle="No bookings" emptyText="This customer has no bookings yet." columns={[
              { key: 'ref', label: 'Reference', render: (b) => <Ltr className="font-mono text-xs font-bold">{b.reference}</Ltr> },
              { key: 'trip', label: 'Trip', render: (b) => b.trip ? <>{b.trip.routeName ?? <T>Route</T>} · <Dt value={b.trip.departureAt} time timeZone={tz} /></> : '—' },
              { key: 'seats', label: 'Seats', render: (b) => String(b.seatsCount) },
              { key: 'total', label: 'Total', render: (b) => <Ltr>{b.totalAmount} {b.currency}</Ltr> },
              { key: 'status', label: 'Status', render: (b) => <StatusPill value={b.status} /> },
            ]} />
          </section>
        )}
      </div>
    </>
  );
}
