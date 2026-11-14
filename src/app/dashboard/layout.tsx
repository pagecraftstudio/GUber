import { cookies } from 'next/headers';
import { DashboardShellMasar } from '@/ds/shell/DashboardShellMasar';
import { logoutAction } from '@/features/auth/actions';
import { requireTenant } from '@/lib/auth/guards';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const saved = (await cookies()).get('malaky-dashboard-language')?.value;
  const props = { initialLang: (saved === 'ar' ? 'ar' : 'en') as 'ar' | 'en', companyName: ctx.membership.companyName, fullName: ctx.fullName, role: ctx.membership.roleKey, permissions: ctx.membership.permissions, logoutAction };
  return <DashboardShellMasar {...props}>{children}</DashboardShellMasar>;
}
