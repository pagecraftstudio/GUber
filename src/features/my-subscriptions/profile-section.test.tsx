// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const load = vi.fn();
vi.mock('./actions', () => ({ loadProfileOverviewAction: () => load() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock('./ui/MasarQr', () => ({ MasarQr: () => <div data-testid="qr" /> }));

import { ProfileMasarSection } from './ui/ProfileMasarSection';

afterEach(cleanup);

describe('ProfileMasarSection', () => {
  it('shows the MASAR ID and the subscriptions with a link to manage them', async () => {
    load.mockResolvedValue({ ok: true, data: { masarId: 'MSR-AAAA-BBBB', subs: [{ id: 's1', planName: 'Monthly', companyName: 'Nile Bus', status: 'active', validTo: '2027-01-01' }] } });
    render(<ProfileMasarSection lang="en" />);
    expect(await screen.findByText('MSR-AAAA-BBBB')).toBeTruthy();
    expect(screen.getByText('Monthly')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage subscriptions' }).getAttribute('href')).toBe('/my-subscriptions');
  });
  it('says there are no subscriptions yet', async () => {
    load.mockResolvedValue({ ok: true, data: { masarId: 'MSR-X', subs: [] } });
    render(<ProfileMasarSection lang="ar" />);
    expect(await screen.findByText('لا توجد اشتراكات بعد.')).toBeTruthy();
  });
  it('shows an error when it cannot load', async () => {
    load.mockResolvedValue({ ok: false, code: 'internal' });
    render(<ProfileMasarSection lang="en" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your MASAR ID');
  });
});
