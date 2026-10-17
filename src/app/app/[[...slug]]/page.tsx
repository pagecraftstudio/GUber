import { notFound } from 'next/navigation';
import { UiRoot } from '@/ui/UiRoot';

/**
 * One client-side application (marketplace, tenant public site, customer portal, company dashboard, super admin).
 *
 * DATA: real Supabase backend by default; localStorage mock only in development with NEXT_PUBLIC_UI_DATA_MODE=mock
 * (a production build throws if that is set). In real mode only the customer slice is wired (trip search, booking,
 * my bookings, cancel); every other operation rejects with NotIntegratedError and never returns mock data.
 *
 * PRODUCTION GATE (intentional): until the dashboard / super-admin / website views are wired and the in-app role
 * switcher is removed, the app is hidden (404) in production unless ENABLE_UI_PREVIEW=true is set explicitly
 * (server-side variable, never NEXT_PUBLIC). Turn it on only for a deployment you intend to expose.
 * In development it is always available. See docs/INTEGRATION-MAP.md.
 */
export default function UiPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_UI_PREVIEW !== 'true') notFound();
  return <UiRoot />;
}
