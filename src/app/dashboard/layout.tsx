import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { logoutAction } from '@/features/auth/actions';
import { requireTenant } from '@/lib/auth/guards';
export default async function DashboardLayout({children}:{children:React.ReactNode}){
 const ctx=await requireTenant();
 return <DashboardShell companyName={ctx.membership.companyName} fullName={ctx.fullName} role={ctx.membership.roleKey} permissions={ctx.membership.permissions} logoutAction={logoutAction}>{children}</DashboardShell>;
}