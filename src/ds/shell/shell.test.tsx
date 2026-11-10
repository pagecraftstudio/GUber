// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { polyfillDialog } from '../test-setup';
import { DashboardShellMasar } from './DashboardShellMasar';
import { AdminShellMasar } from './AdminShellMasar';
import { DriverShellMasar } from './DriverShellMasar';
import { MarketplaceHeaderMasar, QuietFooter } from './MarketplaceHeaderMasar';
import { PERMISSIONS } from '@/lib/auth/permission-keys';

let path = '/dashboard/bookings';
vi.mock('next/navigation', () => ({ usePathname: () => path, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push() {}, replace() {}, refresh() {} }) }));

beforeAll(polyfillDialog);
beforeEach(() => { path = '/dashboard/bookings'; localStorage.clear(); document.cookie = 'malaky-dashboard-language=; max-age=0'; document.documentElement.className = ''; document.documentElement.removeAttribute('dir'); });
afterEach(cleanup);

const dash = (over: Partial<React.ComponentProps<typeof DashboardShellMasar>> = {}) =>
  render(<DashboardShellMasar companyName="Delta Express" fullName="Omar Hassan" role="company_manager" permissions={[PERMISSIONS.bookingsRead, PERMISSIONS.tripsRead]} logoutAction={() => {}} {...over}><h1>Bookings</h1></DashboardShellMasar>);
const sidebar = (name = 'Main navigation') => screen.getAllByRole('navigation', { name })[0]!;

describe('dashboard shell: navigation and permissions', () => {
  it('shows only what the member may read, keeps overview, marks the current page', () => {
    dash();
    const links = within(sidebar()).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['Overview', 'Trips', 'Bookings']);
    expect(within(sidebar()).getByRole('link', { name: 'Bookings' }).getAttribute('aria-current')).toBe('page');
    expect(within(sidebar()).getByRole('link', { name: 'Trips' }).hasAttribute('aria-current')).toBe(false);
  });
  it('a member with no read permissions sees only the overview', () => {
    dash({ permissions: [] });
    expect(within(sidebar()).getAllByRole('link').map((a) => a.textContent)).toEqual(['Overview']);
  });
  it('a sub-page keeps its section active', () => {
    path = '/dashboard/trips/abc';
    dash();
    expect(within(sidebar()).getByRole('link', { name: 'Trips' }).getAttribute('aria-current')).toBe('page');
  });
  it('skip link is the first tab stop and targets main', async () => {
    dash();
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('Skip to main content');
    expect(document.activeElement?.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  });
  it('collapse toggles the sidebar and its label', async () => {
    dash();
    const b = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(b);
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');
  });
  it('mobile drawer opens from the menu button and closes on navigation', async () => {
    const { container } = dash();
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const d = container.querySelector('dialog')!;
    expect(d.hasAttribute('open')).toBe(true);
    await userEvent.click(within(d).getByRole('link', { name: 'Trips' }));
    expect(d.hasAttribute('open')).toBe(false);
  });
});

describe('dashboard shell: language and theme (contract kept from the old shell)', () => {
  it('starts in the cookie language with the matching direction', () => {
    const { container } = dash({ initialLang: 'ar' });
    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(within(sidebar('التنقل الرئيسي')).getByRole('link', { name: 'الحجوزات' })).toBeTruthy();
  });
  it('switching language flips <html lang dir>, writes the cookie and the localStorage key, and translates the nav', async () => {
    const { container } = dash();
    await userEvent.click(screen.getByRole('button', { name: 'العربية' }));
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.cookie).toContain('malaky-dashboard-language=ar');
    expect(localStorage.getItem('malaky-dashboard-language')).toBe('ar');
    expect(container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(within(sidebar('التنقل الرئيسي')).getByRole('link', { name: 'الرحلات' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });
  it('restores language and theme from localStorage', () => {
    localStorage.setItem('malaky-dashboard-language', 'ar');
    localStorage.setItem('malaky-dashboard-theme', 'dark');
    dash();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('theme toggle sets the dark class and the stored key', async () => {
    dash();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('malaky-dashboard-theme')).toBe('dark');
  });
});

describe('account menu', () => {
  it('opens with the name and role, has a real sign-out form, Escape closes and returns focus', async () => {
    dash();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByText('Company manager').length).toBeGreaterThan(1);
    expect(screen.getByRole('button', { name: 'Sign out' }).closest('form')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
  it('clicking outside closes it', async () => {
    dash();
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await userEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('admin shell', () => {
  const items = [{ href: '/admin', label: 'Overview', available: true }, { href: '/admin/companies', label: 'Companies', available: true }, { href: '/admin/exports', label: 'Exports', available: false }];
  const admin = () => render(<AdminShellMasar fullName="Mona Ali" roleLabel="super admin" items={items} logoutAction={() => {}}><h1>Companies</h1></AdminShellMasar>);
  it('has the Platform scope band, current page, and an inert "soon" item that is not a link', () => {
    path = '/admin/companies';
    admin();
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.getByText('Changes here affect every company.')).toBeTruthy();
    expect(within(sidebar()).getByRole('link', { name: 'Companies' }).getAttribute('aria-current')).toBe('page');
    const soon = within(sidebar()).getByText('Exports').closest('[aria-disabled="true"]');
    expect(soon).toBeTruthy();
    expect(soon?.tagName).not.toBe('A');
    expect(within(sidebar()).getAllByRole('link')).toHaveLength(2);
  });
  it('is English and left-to-right, with no language toggle', () => {
    path = '/admin';
    const { container } = admin();
    expect(container.firstElementChild?.getAttribute('dir')).toBe('ltr');
    expect(screen.queryByRole('button', { name: 'العربية' })).toBeNull();
  });
});

describe('driver shell', () => {
  it('top bar only: skip link, main landmark, no navigation sidebar, 44px sign-out', () => {
    const { container } = render(<DriverShellMasar companyName="Delta Express" driverName="Karim" logoutAction={() => {}}><p>Trips</p></DriverShellMasar>);
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' }).className).toContain('h-11');
    expect(screen.getByText(/Delta Express/)).toBeTruthy();
  });
});

describe('marketplace header and footer', () => {
  const base = { links: [{ label: 'Search trips', href: '#search-section' }, { label: 'My bookings', href: '/my-bookings' }, { label: 'Operator login', href: '/company/login', quiet: true }], langLabel: 'عربي', onToggleLang: vi.fn(), isDark: false, onToggleTheme: vi.fn(), onMyBookings: vi.fn(), onPortal: vi.fn(), onSignOut: vi.fn(), text: { logIn: 'Log in', register: 'Register', myBookings: 'My trips', portal: 'Portal', signOut: 'Sign out' } };
  it('signed out: log in is a text link and Register is the one button-styled action', () => {
    render(<MarketplaceHeaderMasar lang="en" {...base} />);
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]).toBeTruthy();
    const reg = screen.getAllByRole('link', { name: 'Register' })[0]!;
    expect(reg.className).toContain('bg-action');
    expect(screen.getAllByRole('link', { name: 'Log in' })[0]!.className).not.toContain('bg-action');
  });
  it('signed in: account menu with the student ID as an identifier and a working sign-out', async () => {
    const onSignOut = vi.fn();
    render(<MarketplaceHeaderMasar lang="ar" {...base} onSignOut={onSignOut} user={{ fullName: 'عمر حسن', studentId: '20240123' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'قائمة الحساب' }));
    expect(document.querySelector('bdi')?.textContent).toBe('20240123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
  it('language and mobile drawer', async () => {
    const onToggleLang = vi.fn();
    const { container } = render(<MarketplaceHeaderMasar lang="en" {...base} onToggleLang={onToggleLang} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'عربي' })[0]!);
    expect(onToggleLang).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(true);
  });
  it('footer is one quiet line', () => {
    const { container } = render(<QuietFooter>© 2026 MASAR · Powered by MALAKY Studio</QuietFooter>);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.textContent).toContain('Powered by MALAKY Studio');
  });
});

describe('axe on every shell, both languages', () => {
  const run = async (ui: React.ReactElement) => {
    const { container } = render(ui);
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
    return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  };
  for (const initialLang of ['en', 'ar'] as const) {
    it(`dashboard ${initialLang}`, async () => { expect(await run(<DashboardShellMasar initialLang={initialLang} companyName="Delta" fullName="Omar Hassan" role="company_owner" permissions={Object.values(PERMISSIONS)} logoutAction={() => {}}><h1>Bookings</h1></DashboardShellMasar>)).toEqual([]); });
  }
  it('admin', async () => { path = '/admin'; expect(await run(<AdminShellMasar fullName="Mona" roleLabel="staff" items={[{ href: '/admin', label: 'Overview', available: true }, { href: '/admin/x', label: 'X', available: false }]} logoutAction={() => {}}><h1>Overview</h1></AdminShellMasar>)).toEqual([]); });
  it('driver', async () => { expect(await run(<DriverShellMasar companyName="Delta" driverName="Karim" logoutAction={() => {}}><h1>Trips</h1></DriverShellMasar>)).toEqual([]); });
  for (const lang of ['en', 'ar'] as const) {
    it(`marketplace header ${lang}`, async () => { expect(await run(<><MarketplaceHeaderMasar lang={lang} {...{ links: [{ label: 'Search', href: '#s' }], langLabel: 'x', onToggleLang() {}, isDark: false, onToggleTheme() {}, onMyBookings() {}, onPortal() {}, onSignOut() {}, text: { logIn: 'a', register: 'b', myBookings: 'c', portal: 'd', signOut: 'e' } }} /><main><h1>Trips</h1></main></>)).toEqual([]); });
  }
});
