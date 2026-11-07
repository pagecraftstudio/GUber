import { LayoutDashboard, UserCog, UserRound, Route, BusFront, Users, CalendarDays, Ticket, Globe2, Settings2, type LucideIcon } from 'lucide-react';
import { PERMISSIONS, type PermissionKey } from '@/lib/auth/permission-keys';

export type NavKey = 'overview' | 'routes' | 'buses' | 'drivers' | 'users' | 'trips' | 'bookings' | 'customers' | 'website' | 'settings';
export type NavItem = { href: string; key: NavKey; icon: LucideIcon; permission: PermissionKey | null };

/** The sidebar list. An item shows only when the member holds its read permission (each page re-checks; RLS decides). */
export const NAV: readonly NavItem[] = [
  { href: '/dashboard', key: 'overview', icon: LayoutDashboard, permission: null },
  { href: '/dashboard/routes', key: 'routes', icon: Route, permission: PERMISSIONS.routesRead },
  { href: '/dashboard/buses', key: 'buses', icon: BusFront, permission: PERMISSIONS.busesRead },
  { href: '/dashboard/drivers', key: 'drivers', icon: Users, permission: PERMISSIONS.driversRead },
  { href: '/dashboard/users', key: 'users', icon: UserCog, permission: PERMISSIONS.usersRead },
  { href: '/dashboard/trips', key: 'trips', icon: CalendarDays, permission: PERMISSIONS.tripsRead },
  { href: '/dashboard/bookings', key: 'bookings', icon: Ticket, permission: PERMISSIONS.bookingsRead },
  { href: '/dashboard/customers', key: 'customers', icon: UserRound, permission: PERMISSIONS.customersRead },
  { href: '/dashboard/website', key: 'website', icon: Globe2, permission: PERMISSIONS.websiteRead },
  { href: '/dashboard/settings', key: 'settings', icon: Settings2, permission: PERMISSIONS.settingsRead },
];

export const visibleNav = (permissions: readonly string[]): NavItem[] => NAV.filter((n) => !n.permission || permissions.includes(n.permission));

/** `/dashboard` matches only itself; every other item also matches its sub-pages (`/dashboard/routes/abc`). */
export const isNavActive = (href: string, pathname: string): boolean => (href === '/dashboard' ? pathname === '/dashboard' : pathname === href || pathname.startsWith(`${href}/`));
