import { cookies } from 'next/headers';
import { DsScope } from '@/ds/shell/DsScope';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { logoutAction } from '@/features/auth/actions';
import { requireTenant } from '@/lib/auth/guards';
export default async function DashboardLayout({children}:{children:React.ReactNode}){
 const ctx=await requireTenant();
 const saved=(await cookies()).get('malaky-dashboard-language')?.value;
 return <DsScope surface="dashboard" companyId={ctx.membership.companyId}><DashboardShell initialLang={saved==='ar'?'ar':'en'} companyName={ctx.membership.companyName} fullName={ctx.fullName} role={ctx.membership.roleKey} permissions={ctx.membership.permissions} logoutAction={logoutAction}>{children}</DashboardShell></DsScope>;
}