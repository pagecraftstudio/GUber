import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext } from '@/lib/service/context';
import { customerService } from '@/features/customers/service';
import { bookingService } from '@/features/bookings/service';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';

const row = (label: string, value: string | null) => (
  <div key={label}><dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-0.5 text-sm font-medium">{value || '—'}</dd></div>
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
  const canSeeBookings = auth.membership.permissions.includes('bookings.read');
  const bookings = canSeeBookings ? await bookingService.list(ctx, { customerId: customer.id, page: 1, pageSize: 50 }) : null;
  return (
    <>
      <PageHeader eyebrow="Passenger operations" title={customer.fullName} description="Customer details and booking history."
        action={<Link href="/dashboard/customers" className="text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">Back to customers</Link>} />
      <div className="max-w-4xl space-y-6">
        <section aria-labelledby="cust-h" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 id="cust-h" className="font-bold">Details</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {row('Phone', customer.phone)}{row('Email', customer.email)}{row('University', customer.university)}{row('Student number', customer.studentId)}
            {row('Customer since', new Date(customer.createdAt).toLocaleDateString())}{row('Staff notes', customer.notes)}
          </dl>
        </section>
        {bookings && (
          <section aria-labelledby="bk-h">
            <h2 id="bk-h" className="mb-3 font-bold">Bookings ({bookings.total})</h2>
            <DataTable rows={bookings.items} emptyTitle="No bookings" emptyText="This customer has no bookings yet." columns={[
              { key: 'ref', label: 'Reference', render: (b) => <span className="font-mono text-xs font-bold">{b.reference}</span> },
              { key: 'trip', label: 'Trip', render: (b) => b.trip ? `${b.trip.routeName ?? 'Route'} · ${new Date(b.trip.departureAt).toLocaleString()}` : '—' },
              { key: 'seats', label: 'Seats', render: (b) => String(b.seatsCount) },
              { key: 'total', label: 'Total', render: (b) => `${b.totalAmount} ${b.currency}` },
              { key: 'status', label: 'Status', render: (b) => <StatusPill value={b.status} /> },
            ]} />
          </section>
        )}
      </div>
    </>
  );
}
