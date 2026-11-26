// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendConsent = vi.fn<(granted: boolean) => Promise<boolean>>(async () => true);
const trackEvents = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('@/lib/analytics/client', () => ({ sendConsent: (g: boolean) => sendConsent(g), trackEvents: (...a: unknown[]) => trackEvents(...a) }));
const pathname = vi.hoisted(() => ({ value: '/search' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value, useRouter: () => ({ refresh: vi.fn() }) }));

import { AnalyticsClient } from './AnalyticsClient';

beforeEach(() => { sendConsent.mockClear(); trackEvents.mockClear(); document.documentElement.lang = 'en'; pathname.value = '/search'; });
afterEach(cleanup);

describe('AnalyticsClient on a company site', () => {
  it('counts site_page_view (not page_view) and links the privacy notice at the given address', async () => {
    render(<AnalyticsClient initial="granted" site privacyHref="https://app.test/privacy" />);
    await waitFor(() => expect(trackEvents).toHaveBeenCalledTimes(1));
    expect(trackEvents).toHaveBeenCalledWith('en', [{ event: 'site_page_view' }]);
    cleanup();
    render(<AnalyticsClient initial="unset" site privacyHref="https://app.test/privacy" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://app.test/privacy');
  });
});

describe('AnalyticsClient', () => {
  it('shows the banner in Arabic when <html lang> is ar, and follows a language switch', async () => {
    document.documentElement.lang = 'ar';
    render(<AnalyticsClient initial="unset" />);
    await waitFor(() => expect(screen.getByText('خصوصيتك تهمنا')).toBeTruthy());
    document.documentElement.lang = 'en';
    await waitFor(() => expect(screen.getByText('Your privacy matters')).toBeTruthy());
  });
  it('records nothing before a choice, and Agree and No thanks have equal weight in the DOM', () => {
    render(<AnalyticsClient initial="unset" />);
    expect(trackEvents).not.toHaveBeenCalled();
    const a = screen.getByRole('button', { name: 'Agree' });
    const r = screen.getByRole('button', { name: 'No, thanks' });
    expect(a.className).toBe(r.className);
  });
  it('Agree sends consent, hides the banner and starts page views', async () => {
    render(<AnalyticsClient initial="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    await waitFor(() => expect(sendConsent).toHaveBeenCalledWith(true));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    await waitFor(() => expect(trackEvents).toHaveBeenCalledTimes(1));
  });
  it('No thanks sends a denial and never tracks', async () => {
    render(<AnalyticsClient initial="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'No, thanks' }));
    await waitFor(() => expect(sendConsent).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(trackEvents).not.toHaveBeenCalled();
  });
  it('an already granted visitor sees no banner and is tracked once per path', async () => {
    render(<AnalyticsClient initial="granted" />);
    expect(screen.queryByRole('region')).toBeNull();
    await waitFor(() => expect(trackEvents).toHaveBeenCalledTimes(1));
  });
  it('a failed consent call keeps the banner so the person can retry', async () => {
    sendConsent.mockResolvedValueOnce(false);
    render(<AnalyticsClient initial="unset" />);
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    await waitFor(() => expect(sendConsent).toHaveBeenCalled());
    expect(screen.getByRole('region')).toBeTruthy();
    expect(trackEvents).not.toHaveBeenCalled();
  });
});

describe('AnalyticsClient staff areas', () => {
  it('dashboard: records the screen opened, without ids, instead of a page view', async () => {
    pathname.value = '/dashboard/trips/00000000-0000-4000-8000-0000000000a1/edit';
    render(<AnalyticsClient initial="granted" area="dashboard" locale="en" />);
    await waitFor(() => expect(trackEvents).toHaveBeenCalledTimes(1));
    expect(trackEvents).toHaveBeenCalledWith('en', [{ event: 'feature_use', properties: { screen: 'trips.edit', action: 'open' } }]);
  });
  it('driver: shows the banner but records no page or screen events', async () => {
    pathname.value = '/driver/trips';
    const { unmount } = render(<AnalyticsClient initial="granted" area="driver" locale="ar" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(trackEvents).not.toHaveBeenCalled();
    unmount();
    render(<AnalyticsClient initial="unset" area="driver" locale="ar" />);
    expect(screen.getByRole('region')).toBeTruthy();
  });
});
