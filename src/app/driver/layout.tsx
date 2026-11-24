import type { Metadata, Viewport } from 'next';
import { DriverShellMasar } from '@/ds/shell/DriverShellMasar';
import { PRIMITIVES } from '@/ds/tokens';
import { logoutAction } from '@/features/auth/actions';
import { DriverNav } from '@/features/driver/DriverNav';
import { DriverPwa } from '@/features/driver/DriverPwa';
import { readDriverLang } from '@/features/driver/read-lang';
import { requireDriver } from '@/lib/auth/guards';

// Installable (plan item 15): the manifest is a root-level static file because everything under /driver needs a session and a manifest fetch has none.
export const metadata: Metadata = { title: 'Driver', manifest: '/driver.webmanifest', appleWebApp: { capable: true, title: 'مسار السائق', statusBarStyle: 'default' } };
export const viewport: Viewport = { themeColor: PRIMITIVES['green-900'] };   // the brand green, from the token mirror (no raw hex in src)

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireDriver(); // server gate, re-verified per request; board_ticket re-verifies per scan in Postgres
  const lang = await readDriverLang();
  return (
    <DriverShellMasar companyName={ctx.membership.companyName} driverName={ctx.fullName} logoutAction={logoutAction} lang={lang}>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <DriverNav lang={lang} />
      <DriverPwa />
    </DriverShellMasar>
  );
}
