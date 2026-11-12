'use client';
import { LogOut, Menu, Moon, Sun, Ticket, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Logo } from '../brand/Logo';
import { Drawer } from '../feedback/Dialog';
import { Identifier } from '../format/Identifier';
import { Button, IconButton } from '../primitives/Button';
import { buttonClass } from '../primitives/button-class';
import { cx, FOCUS } from '../primitives/cx';
import { AccountMenu, MenuAction } from './AccountMenu';
import { PoweredByMalaky } from './PoweredByMalaky';
import { SHELL_TEXT } from './text';

export interface MarketplaceLink { label: string; href?: string; onClick?: () => void; quiet?: boolean }
export interface MarketplaceHeaderMasarProps {
  lang: 'en' | 'ar';
  links: MarketplaceLink[];
  langLabel: string;
  onToggleLang: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  user?: { fullName: string; email?: string | null; studentId?: string | null } | null;
  text: { logIn: string; register: string; myBookings: string; portal: string; signOut: string };
  onMyBookings: () => void;
  onPortal: () => void;
  onSignOut: () => void;
}

const linkCls = cx('inline-flex h-9 items-center rounded-ds-sm px-2 text-sm whitespace-nowrap hover:text-ink-primary', FOCUS);

function LinkItem({ l, onDone }: { l: MarketplaceLink; onDone?: () => void }) {
  const tone = l.quiet ? 'text-ink-muted' : 'text-ink-secondary';
  if (l.href) return <a href={l.href} onClick={onDone} className={cx(linkCls, tone)}>{l.label}</a>;
  return <button type="button" onClick={() => { l.onClick?.(); onDone?.(); }} className={cx(linkCls, tone)}>{l.label}</button>;
}

/** Marketplace header in the MASAR look: lockup, the existing links, language, one button; log in is a text link (plan 7.5). Theme stays so nobody is trapped in an unsigned dark theme (D4). */
export function MarketplaceHeaderMasar(p: MarketplaceHeaderMasarProps) {
  const st = SHELL_TEXT[p.lang];
  const [menu, setMenu] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line-default bg-surface-card" dir={p.lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="/" aria-label={st.productName} className={cx('rounded-ds-sm', FOCUS)}><Logo size="md" tone="auto" /></a>
        <nav aria-label={st.mainNav} className="hidden items-center gap-2 lg:flex">{p.links.map((l) => <LinkItem key={l.label} l={l} />)}</nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline"><Button variant="ghost" onClick={p.onToggleLang}>{p.langLabel}</Button></span>
          <IconButton label={st.theme} icon={p.isDark ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />} onClick={p.onToggleTheme} />
          {p.user ? (
            <AccountMenu label={st.account} name={p.user.fullName} detail={p.user.studentId ? <Identifier value={p.user.studentId} /> : p.user.email ?? undefined}>
              <MenuAction icon={<Ticket size={16} strokeWidth={1.5} />} onClick={p.onMyBookings}>{p.text.myBookings}</MenuAction>
              <MenuAction icon={<User size={16} strokeWidth={1.5} />} onClick={p.onPortal}>{p.text.portal}</MenuAction>
              <MenuAction tone="destructive" icon={<LogOut size={16} strokeWidth={1.5} />} onClick={p.onSignOut}>{p.text.signOut}</MenuAction>
            </AccountMenu>
          ) : (
            <>
              <a href="/login" className={cx(linkCls, 'hidden text-ink-primary sm:inline-flex')}>{p.text.logIn}</a>
              <a href="/register" className={cx(buttonClass('primary', 'md'), 'hidden sm:inline-flex')}>{p.text.register}</a>
            </>
          )}
          <span className="lg:hidden"><IconButton label={st.menu} aria-expanded={menu} icon={<Menu size={18} strokeWidth={1.5} />} onClick={() => setMenu(true)} /></span>
        </div>
      </div>
      <Drawer open={menu} onClose={() => setMenu(false)} title={st.menu} side={p.lang === 'ar' ? 'start' : 'end'}>
        <div className="flex flex-col gap-1">
          {p.links.map((l) => <LinkItem key={l.label} l={l} onDone={() => setMenu(false)} />)}
          <div className="my-2 border-t border-line-default" />
          <Button variant="ghost" onClick={() => { p.onToggleLang(); setMenu(false); }} className="!justify-start">{p.langLabel}</Button>
          {!p.user ? (<><a href="/login" className={cx(linkCls, 'text-ink-primary')}>{p.text.logIn}</a><a href="/register" className={buttonClass('primary', 'lg', true)}>{p.text.register}</a></>) : null}
        </div>
      </Drawer>
    </header>
  );
}

/** One quiet line (plan 5.4, O3). MASAR's own pages credit the studio; company sites will credit MASAR only. */
export function QuietFooter({ children, credit }: { children: ReactNode; credit?: string }) {
  return (
    <footer className="border-t border-line-default bg-surface-card">
      <p className="mx-auto max-w-7xl px-4 py-6 text-[13px] text-ink-muted sm:px-6 lg:px-8">
        {children}{credit ? <> · <PoweredByMalaky text={credit} /></> : null}
      </p>
    </footer>
  );
}
