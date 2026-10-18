import type { PlatformRole } from '@/lib/auth/types';

export type AdminNavItem = {
  href: string;
  label: string;
  /** false = page not built yet (later subphase). Rendered disabled, never as a dead link. */
  available: boolean;
  /** Roles that see the item. Visibility only; every page and RPC still authorizes on its own. */
  roles: readonly PlatformRole[];
};

const ALL: readonly PlatformRole[] = ['super_admin', 'support', 'billing'];

// Role-to-section matrix is a 7.6 decision; until then every platform role sees every section.
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: '/admin', label: 'Overview', available: true, roles: ALL },
  { href: '/admin/companies', label: 'Companies', available: true, roles: ALL },
  { href: '/admin/subscriptions', label: 'Subscriptions', available: true, roles: ALL },
  { href: '/admin/plans', label: 'Plans', available: true, roles: ALL },
  { href: '/admin/audit-logs', label: 'Audit logs', available: false, roles: ALL },
];

export const navFor = (role: PlatformRole | null): AdminNavItem[] =>
  role ? ADMIN_NAV.filter((i) => i.roles.includes(role)) : [];

/** Exact match for the overview, prefix match for sections. */
export const isNavActive = (href: string, pathname: string): boolean =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
