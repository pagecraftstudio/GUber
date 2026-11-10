'use client';
import { LogOut, Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { isNavActive, visibleNav } from '@/components/dashboard/nav';
import { FlashNotice } from '@/components/dashboard/FlashNotice';
import { labels, ROLES } from '@/components/dashboard/DashboardShell';
import { DashboardLangProvider } from '@/features/dashboard/lang';
import { DsLangProvider } from '../lang';
import { Logo } from '../brand/Logo';
import { Button, IconButton, SubmitButton } from '../primitives/Button';
import { AccountMenu } from './AccountMenu';
import { ShellFrame, type ShellNavItem } from './ShellFrame';
import { SHELL_TEXT } from './text';

type Lang = 'en' | 'ar';
export interface DashboardShellMasarProps { initialLang?: Lang; companyName: string; fullName: string; role: string; permissions: string[]; children: React.ReactNode; logoutAction: () => void }

/**
 * Company dashboard shell in the MASAR look. Same contract as the old DashboardShell (plan Phase 4): cookie + localStorage language
 * (`malaky-dashboard-language`), theme (`malaky-dashboard-theme`), direction on <html>, permission-driven nav, the same <main id>.
 * Search is not shown because the product has no search yet.
 */
export function DashboardShellMasar({ initialLang = 'en', companyName, fullName, role, permissions, children, logoutAction }: DashboardShellMasarProps) {
  const pathname = usePathname();
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const l = localStorage.getItem('malaky-dashboard-language');
    const t = localStorage.getItem('malaky-dashboard-theme');
    if (l === 'ar' || l === 'en') setLang(l);
    if (t === 'dark' || t === 'light') setTheme(t);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('malaky-dashboard-language', lang);
    document.cookie = `malaky-dashboard-language=${lang};path=/;max-age=31536000;samesite=lax`; // the server renders the right direction on the next load
    localStorage.setItem('malaky-dashboard-theme', theme);
  }, [lang, theme]);

  const t = labels[lang];
  const st = SHELL_TEXT[lang];
  const roleLabel = ROLES[role]?.[lang] ?? role.replaceAll('_', ' ');
  const items: ShellNavItem[] = useMemo(() => visibleNav(permissions).map((n) => ({ key: n.key, href: n.href, label: t[n.key] as string, icon: n.icon, active: isNavActive(n.href, pathname) })), [permissions, pathname, t]);
  const current = items.find((i) => i.active)?.label;

  return (
    <DsLangProvider value={lang}>
      <ShellFrame
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        text={st}
        brand={<Logo size="md" tone="auto" />}
        items={items}
        sectionLabel={st.workspace}
        sidebarFooter={<><p className="truncate text-[13px] font-medium text-ink-primary">{companyName}</p><p className="truncate text-[13px] text-ink-muted">{roleLabel}</p></>}
        topbarStart={<div className="min-w-0"><p className="truncate text-[13px] text-ink-muted">{companyName}</p>{current ? <p className="truncate text-base leading-tight font-medium text-ink-primary">{current}</p> : null}</div>}
        topbarEnd={<>
          <Button variant="secondary" onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}>{t.language}</Button>
          <IconButton label={st.theme} variant="secondary" icon={theme === 'light' ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
          <AccountMenu label={st.account} name={fullName} detail={roleLabel}>
            <form action={logoutAction}><SubmitButton variant="ghost" fullWidth iconStart={<LogOut size={16} strokeWidth={1.5} />} className="!justify-start">{st.signOut}</SubmitButton></form>
          </AccountMenu>
        </>}
      >
        <DashboardLangProvider value={lang}><Suspense fallback={null}><FlashNotice /></Suspense>{children}</DashboardLangProvider>
      </ShellFrame>
    </DsLangProvider>
  );
}
