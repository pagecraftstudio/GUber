import { UiRoot } from '@/ui/UiRoot';

/**
 * "/" - the public customer marketplace. No session needed: trip search is the anon-callable RPC
 * public_search_trips; booking, my bookings and tickets require a customer sign-in (RLS + RPC checks).
 * Real Supabase backend only: a production build refuses mock data (next.config.ts, ui/lib/runtime.ts).
 */
export default function MarketplacePage() {
  return <UiRoot />;
}
