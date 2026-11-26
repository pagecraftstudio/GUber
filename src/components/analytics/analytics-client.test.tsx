// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendConsent = vi.fn<(granted: boolean) => Promise<boolean>>(async () => true);
const trackEvents = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('@/lib/analytics/client', () => ({ sendConsent: (g: boolean) => sendConsent(g), trackEvents: (...a: unknown[]) => trackEvents(...a) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/search', useRouter: () => ({ refresh: vi.fn() }) }));

import { AnalyticsClient } from './AnalyticsClient';

beforeEach(() => { sendConsent.mockClear(); trackEvents.mockClear(); document.documentElement.lang = 'en'; });
afterEach(cleanup);

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
