import { DriverShellMasar } from '@/ds/shell/DriverShellMasar';
import { logoutAction } from '@/features/auth/actions';
import { DriverNav } from '@/features/driver/DriverNav';
import { readDriverLang } from '@/features/driver/read-lang';
import { requireDriver } from '@/lib/auth/guards';

export const metadata = { title: 'Driver' };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireDriver(); // server gate, re-verified per request; board_ticket re-verifies per scan in Postgres
  const lang = await readDriverLang();
  return (
    <DriverShellMasar companyName={ctx.membership.companyName} driverName={ctx.fullName} logoutAction={logoutAction} lang={lang}>
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))]">{children}</div>
      <DriverNav lang={lang} />
    </DriverShellMasar>
  );
}
