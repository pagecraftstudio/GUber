'use client';

import { CalendarDays, Inbox, ScanLine, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Lang } from '@/ds/format';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { DRIVER_SCREENS_TEXT } from './driver-screens-text';

type Tab = { href: string; key: 'today' | 'boarding' | 'inbox' | 'profile'; icon: LucideIcon; /** also active on these sub-paths */ prefix?: string };
const TABS: readonly Tab[] = [
  { href: '/driver', key: 'today', icon: CalendarDays, prefix: '/driver/trips' },
  { href: '/driver/boarding', key: 'boarding', icon: ScanLine },
  { href: '/driver/inbox', key: 'inbox', icon: Inbox },
  { href: '/driver/profile', key: 'profile', icon: User },
];

const isActive = (path: string, t: Tab): boolean => path === t.href || (!!t.prefix && (path === t.prefix || path.startsWith(`${t.prefix}/`)));

/**
 * Bottom tab bar of the driver app: four sections, 56px targets, safe-area aware. Plain links (they work without JavaScript); the current section is
 * marked with aria-current. Logical properties only, so the bar mirrors in RTL. The shell reserves the room underneath (layout).
 */
export function DriverNav({ lang }: { lang: Lang }) {
  const path = usePathname() ?? '';
  const x = DRIVER_SCREENS_TEXT[lang].nav;
  return (
    <nav aria-label={x.label} className="fixed inset-x-0 bottom-0 z-20 border-t border-line-default bg-surface-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => {
          const on = isActive(path, t);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? 'page' : undefined}
                className={cx('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[13px]', on ? 'font-medium text-action' : 'text-ink-secondary hover:text-ink-primary', FOCUS)}>
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                <span>{x[t.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
