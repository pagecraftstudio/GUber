'use client';
import { Menu, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Drawer } from '../feedback/Dialog';
import { IconButton } from '../primitives/Button';
import { cx, FOCUS } from '../primitives/cx';
import { SkipLink } from './SkipLink';
import type { ShellText } from './text';

export interface ShellNavItem { key: string; href: string; label: string; icon: LucideIcon; active: boolean; disabled?: boolean; hint?: string }

function NavList({ items, collapsed, onNavigate }: { items: ShellNavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((it) => {
        const Icon = it.icon;
        const row = 'relative flex h-9 items-center gap-3 rounded-ds-sm px-3 text-sm';
        const body = (<><Icon size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0" /><span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{it.label}</span>{!collapsed && it.hint ? <span className="text-[13px] text-ink-muted">{it.hint}</span> : null}</>);
        return (
          <li key={it.key}>
            {it.disabled ? (
              <span aria-disabled="true" className={cx(row, 'cursor-not-allowed text-ink-muted')}>{body}</span>
            ) : (
              <Link href={it.href} aria-current={it.active ? 'page' : undefined} title={collapsed ? it.label : undefined} onClick={onNavigate}
                className={cx(row, FOCUS, it.active ? 'bg-surface-sunken font-medium text-ink-primary before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-action' : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary')}>{body}</Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface ShellFrameProps {
  dir: 'ltr' | 'rtl';
  text: ShellText;
  brand: ReactNode;
  /** Full-width band above everything (admin "Platform" scope). */
  scopeBand?: ReactNode;
  items: ShellNavItem[];
  sectionLabel?: string;
  sidebarFooter?: ReactNode;
  topbarStart: ReactNode;
  topbarEnd: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}

/** Sidebar 264 (collapses to 72) with 36px rows, topbar 56, mobile drawer, skip link. Presentational: language, theme and account actions come in as slots. */
export function ShellFrame(p: ShellFrameProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const vars = { '--shell-band': p.scopeBand ? '2rem' : '0px' } as CSSProperties;
  const Collapse = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <div dir={p.dir} style={vars} className="min-h-screen bg-surface-page text-ink-primary">
      <SkipLink label={p.text.skip} />
      {p.scopeBand ? <div className="sticky top-0 z-40 h-8">{p.scopeBand}</div> : null}
      <aside className={cx('fixed bottom-0 start-0 top-(--shell-band) z-30 hidden flex-col border-e border-line-default bg-surface-card lg:flex', collapsed ? 'w-[72px]' : 'w-[264px]')}>
        <div className={cx('flex h-14 items-center border-b border-line-default px-4', collapsed && 'justify-center px-0')}>{collapsed ? <span aria-hidden="true" className="text-base font-medium">M</span> : p.brand}</div>
        <nav aria-label={p.text.mainNav} className="flex-1 overflow-y-auto px-3 py-4">
          {p.sectionLabel && !collapsed ? <p className="px-3 pb-1.5 text-[13px] text-ink-muted">{p.sectionLabel}</p> : null}
          <NavList items={p.items} collapsed={collapsed} />
        </nav>
        <div className="border-t border-line-default p-3">
          {!collapsed && p.sidebarFooter ? <div className="mb-2 px-3">{p.sidebarFooter}</div> : null}
          <button type="button" aria-label={collapsed ? p.text.expand : p.text.collapse} aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}
            className={cx('flex h-9 w-full items-center gap-3 rounded-ds-sm px-3 text-sm text-ink-secondary hover:bg-surface-sunken', FOCUS)}>
            <Collapse size={18} strokeWidth={1.5} aria-hidden="true" className="rtl:-scale-x-100" />{collapsed ? null : p.text.collapse}
          </button>
        </div>
      </aside>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title={p.text.mainNav} side="start">
        <nav aria-label={p.text.mainNav}><NavList items={p.items} collapsed={false} onNavigate={() => setDrawer(false)} /></nav>
      </Drawer>
      <div className={collapsed ? 'lg:ps-[72px]' : 'lg:ps-[264px]'}>
        <header className="sticky top-(--shell-band) z-20 flex h-14 items-center justify-between gap-3 border-b border-line-default bg-surface-card px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="lg:hidden"><IconButton label={p.text.openNav} icon={<Menu size={18} strokeWidth={1.5} />} aria-expanded={drawer} onClick={() => setDrawer(true)} /></span>
            {p.topbarStart}
          </div>
          <div className="flex shrink-0 items-center gap-2">{p.topbarEnd}</div>
        </header>
        <main id="main-content" tabIndex={-1} className={cx('mx-auto w-full px-4 py-6 outline-none sm:px-6 lg:px-8', p.maxWidthClass ?? 'max-w-[1600px]')}>{p.children}</main>
      </div>
    </div>
  );
}
