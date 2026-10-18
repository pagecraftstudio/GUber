'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavActive, type AdminNavItem } from '@/features/platform/nav';

/** Horizontal scroll strip on phones, vertical rail from md up. Items for unbuilt sections are inert. */
export function AdminSidebar({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {items.map((item) => {
        const base = 'whitespace-nowrap rounded-lg px-3 py-2 text-sm';
        if (!item.available) {
          return (
            <span key={item.href} aria-disabled="true" className={`${base} cursor-not-allowed text-slate-400`}>
              {item.label} <span className="text-[10px] uppercase tracking-wide">soon</span>
            </span>
          );
        }
        const active = isNavActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`${base} ${active ? 'bg-slate-900 font-medium text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
