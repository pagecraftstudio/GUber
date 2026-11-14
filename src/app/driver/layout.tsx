import { DriverShellMasar } from '@/ds/shell/DriverShellMasar';
import { logoutAction } from '@/features/auth/actions';
import { requireDriver } from '@/lib/auth/guards';

export const metadata = { title: 'Driver' };

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireDriver(); // server gate, re-verified per request; board_ticket re-verifies per scan in Postgres
  return (
    <DriverShellMasar companyName={ctx.membership.companyName} driverName={ctx.fullName} logoutAction={logoutAction}>{children}</DriverShellMasar>
  );
}
