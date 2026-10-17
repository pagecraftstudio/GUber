import { UiRoot } from '@/ui/UiRoot';
import { requireCustomer } from '@/lib/auth/guards';

export const metadata = { title: 'My bookings', robots: { index: false, follow: false } };

/**
 * Customer portal: bookings, tickets, QR boarding passes. Server guard first (signed out -> /login, staff/driver/admin ->
 * their own area); the data itself is only readable through RLS / RPCs that derive the customer from auth.uid().
 */
export default async function MyBookingsPage() {
  await requireCustomer();
  return <UiRoot initialView="customer" />;
}
