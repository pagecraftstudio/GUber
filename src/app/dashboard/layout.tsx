import { cookies } from 'next/headers';
import { DashboardShellMasar } from '@/ds/shell/DashboardShellMasar';
import { logoutAction } from '@/features/auth/actions';
import { ActingBanner } from '@/components/dashboard/ActingBanner';
import { requireTenant } from '@/lib/auth/guards';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const saved = (await cookies()).get('malaky-dashboard-language')?.value;
  const props = { initialLang: (saved === 'ar' ? 'ar' : 'en') as 'ar' | 'en', companyName: ctx.membership.companyName, fullName: ctx.fullName, role: ctx.membership.roleKey, permissions: ctx.membership.permissions, logoutAction };
  const banner = ctx.acting ? <ActingBanner companyName={ctx.membership.companyName} companyStatus={ctx.membership.companyStatus} mode={ctx.acting.mode} expiresAt={ctx.acting.expiresAt} canWrite={ctx.platformRole === 'super_admin'} /> : null;
  return <DashboardShellMasar {...props} banner={banner}>{children}</DashboardShellMasar>;
}
