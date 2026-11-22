import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { companyService } from '@/features/companies/service';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { tripService } from '@/features/trips/service';
import { StaffBookingView, type StaffTripOption } from '@/features/staff-booking/ui/StaffBookingView';

export default async function NewBookingPage() {
  const auth = await requireTenant('bookings.write'); // no bookings.write => /dashboard?error=forbidden
  const ctx = createTenantServiceContext(await createClient(), auth);
  const [tz, settings, trips] = await Promise.all([
    companyTimeZone(ctx), companyService.getSettings(ctx),
    // Only trips a booking could actually succeed on; the RPC still decides (cutoff, status, capacity).
    tripService.list(ctx, { page: 1, pageSize: 100, dir: 'asc', status: 'scheduled', from: new Date().toISOString() }),
  ]);
  const options: StaffTripOption[] = trips.items.filter((t) => t.seatsAvailable > 0).map((t) => ({
    id: t.id, route: t.route ? `${t.route.originName} → ${t.route.destinationName}` : t.routeId, departureAt: t.departureAt, price: t.price, seatsAvailable: t.seatsAvailable,
  }));
  return <StaffBookingView trips={options} tz={tz} currency={settings.currency} maxSeats={settings.maxSeatsPerBooking} />;
}
