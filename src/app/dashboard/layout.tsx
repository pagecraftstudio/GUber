import { cookies } from 'next/headers';
import { DsScope } from '@/ds/shell/DsScope';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { DashboardShellMasar } from '@/ds/shell/DashboardShellMasar';
import { isSurfaceScoped } from '@/ds/scope';
import { DsFlagProvider } from '@/ds/shell/flag';
import { logoutAction } from '@/features/auth/actions';
import { requireTenant } from '@/lib/auth/guards';
export default async function DashboardLayout({children}:{children:React.ReactNode}){
 const ctx=await requireTenant();
 const saved=(await cookies()).get('malaky-dashboard-language')?.value;
 const props={initialLang:(saved==='ar'?'ar':'en') as 'ar'|'en',companyName:ctx.membership.companyName,fullName:ctx.fullName,role:ctx.membership.roleKey,permissions:ctx.membership.permissions,logoutAction};
 // Styling choice only (plan 5.3): unflipped companies get the old shell byte for byte.
 const flipped=isSurfaceScoped('dashboard',ctx.membership.companyId);
 const Shell=flipped?DashboardShellMasar:DashboardShell;
 // The flag lets client components inside the pages (forms, inline controls, page header) follow the same look as the shell.
 return <DsScope surface="dashboard" companyId={ctx.membership.companyId}><Shell {...props}><DsFlagProvider value={flipped}>{children}</DsFlagProvider></Shell></DsScope>;
}