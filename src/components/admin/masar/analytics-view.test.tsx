// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DsLangProvider } from '@/ds/lang';
import type { AnalyticsPage } from '@/features/analytics/types';
import { AnalyticsView } from './AnalyticsView';

afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<DsLangProvider value="en">{ui}</DsLangProvider>);
const empty: AnalyticsPage = { days: 30, overview: [], funnel: [], usage: [], gaps: [], cohorts: [] };
const full: AnalyticsPage = {
  days: 30,
  overview: [{ day: '2026-11-24', pageViews: 12, visitorDays: 5 }],
  funnel: [
    { step: 'trip_view', label: 'Viewed a trip', visitorDays: 20, pctOfFirst: 100, pctOfPrevious: null },
    { step: 'booking_start', label: 'Started booking', visitorDays: 5, pctOfFirst: 25, pctOfPrevious: 25 },
  ],
  usage: [{ surface: 'marketplace', event: 'page_view', events: 12, visitorDays: 5 }],
  gaps: [{ origin: 'cairo', destination: '=cmd|x', searches: 4, zeroSearches: 3, zeroRate: 0.75 }],
  cohorts: [{ week: '2026-11-16', size: 8, retention: [100, 50, null, null, null, null, null, null] }],
};

describe('AnalyticsView', () => {
  it('renders every panel with data, shows the miss rate and marks the current period', () => {
    wrap(<AnalyticsView days={30} page={{ data: full }} />);
    expect(screen.getByText('Searches with no results')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('Booking funnel')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Last 30 days' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('link', { name: 'Download CSV' })).toHaveLength(2);
  });
  it('shows plain text for visitor-typed values (no markup injection)', () => {
    wrap(<AnalyticsView days={30} page={{ data: { ...full, gaps: [{ ...full.gaps[0]!, destination: '<img src=x onerror=alert(1)>' }] } }} />);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
  it('empty and error states render', () => {
    const { unmount } = wrap(<AnalyticsView days={7} page={{ data: empty }} />);
    expect(screen.getByText('No missed searches')).toBeTruthy();
    expect(screen.getByText('No funnel data yet')).toBeTruthy();
    expect(screen.getByText('No cohorts yet')).toBeTruthy();
    unmount();
    wrap(<AnalyticsView days={7} page={{ error: 'boom' }} />);
    expect(screen.getByText('Could not load analytics')).toBeTruthy();
  });
  it('has no axe violations', async () => {
    const { container } = wrap(<AnalyticsView days={30} page={{ data: full }} />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
