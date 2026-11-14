import { DsScope } from '@/ds/shell/DsScope';
import { AdminShellMasar } from '@/ds/shell/AdminShellMasar';
import { logoutAction } from '@/features/auth/actions';
import { navFor } from '@/features/platform/nav';
import { requirePlatform } from '@/lib/auth/guards';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatform(); // 404 for anyone who is not active platform staff
  return (
    <DsScope surface="admin">
      <AdminShellMasar fullName={ctx.fullName} roleLabel={String(ctx.platformRole).replaceAll('_', ' ')} items={navFor(ctx.platformRole).map(({ href, label, available }) => ({ href, label, available }))} logoutAction={logoutAction}>{children}</AdminShellMasar>
    </DsScope>
  );
}
