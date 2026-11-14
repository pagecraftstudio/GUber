'use client';
import { Building2, CreditCard, Layers, LayoutDashboard, LogOut, ScrollText, ShieldCheck, Circle, type LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { DsLangProvider } from '../lang';
import { Logo } from '../brand/Logo';
import { SubmitButton } from '../primitives/Button';
import { AccountMenu } from './AccountMenu';
import { ShellFrame, type ShellNavItem } from './ShellFrame';
import { SHELL_TEXT } from './text';

const ICON: Record<string, LucideIcon> = { '/admin': LayoutDashboard, '/admin/companies': Building2, '/admin/subscriptions': CreditCard, '/admin/plans': Layers, '/admin/audit-logs': ScrollText };
const isActive = (href: string, pathname: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`));

export interface AdminShellMasarProps { fullName: string; roleLabel: string; items: { href: string; label: string; available: boolean }[]; logoutAction: () => void; children: React.ReactNode }

/**
 * Platform admin shell. Same structure as the dashboard with a dark "Platform" band on top, so platform-wide work cannot be mistaken
 * for one company's. English only today (the admin has no Arabic), so there is no language toggle.
 */
export function AdminShellMasar({ fullName, roleLabel, items, logoutAction, children }: AdminShellMasarProps) {
  const pathname = usePathname();
  const st = SHELL_TEXT.en;
  const nav: ShellNavItem[] = items.map((i) => ({ key: i.href, href: i.href, label: i.label, icon: ICON[i.href] ?? Circle, active: isActive(i.href, pathname), disabled: !i.available, hint: i.available ? undefined : st.soon }));
  const current = nav.find((n) => n.active)?.label;
  return (
    <DsLangProvider value="en">
      <ShellFrame
        dir="ltr"
        text={st}
        scopeBand={<div className="flex h-8 items-center gap-2 bg-ink-primary px-4 text-[13px] text-surface-card dark:border-b dark:border-line-default dark:bg-surface-sunken dark:text-ink-primary"><ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" /><span className="font-medium">{st.platform}</span><span aria-hidden="true">·</span><span className="truncate">{st.platformNote}</span></div>}
        brand={<span className="flex items-center gap-2"><Logo size="md" tone="auto" /><span className="text-[13px] text-ink-muted">Admin</span></span>}
        items={nav}
        topbarStart={<p className="truncate text-base font-medium text-ink-primary">{current ?? 'Admin'}</p>}
        topbarEnd={
          <AccountMenu label={st.account} name={fullName} detail={roleLabel}>
            <form action={logoutAction}><SubmitButton variant="ghost" fullWidth iconStart={<LogOut size={16} strokeWidth={1.5} />} className="!justify-start">{st.signOut}</SubmitButton></form>
          </AccountMenu>
        }
        maxWidthClass="max-w-[1280px]"
      >
        {children}
      </ShellFrame>
    </DsLangProvider>
  );
}
