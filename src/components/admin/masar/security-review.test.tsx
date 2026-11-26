// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsLangProvider } from '@/ds/lang';
import type { ReviewPage } from '@/features/security-review/types';

vi.mock('@/features/security-review/actions', () => ({ markReviewedAction: async () => {} }));
import { SecurityReviewView } from './SecurityReviewView';

afterEach(cleanup);
const wrap = (ui: React.ReactElement) => render(<DsLangProvider value="en">{ui}</DsLangProvider>);
const q = { days: 7, show: 'open' } as const;
const item = (o: Partial<ReviewPage['items'][number]>): ReviewPage['items'][number] => ({
  id: '00000000-0000-4000-8000-000000000001', createdAt: '2026-11-24T10:00:00Z', action: 'acting.started', actorName: 'Admin One', actorEmail: 'one@x.test', companyName: 'Co A',
  reason: 'ticket 4411', device: null, reviewedAt: null, reviewedBy: null, note: null, canReview: true, ...o,
});
const page = (items: ReviewPage['items']): { data: ReviewPage } => ({ data: { days: 7, unreviewed: items.length, items } });

describe('SecurityReviewView', () => {
  it('offers Mark reviewed only on entries the viewer may review', () => {
    wrap(<SecurityReviewView query={q} notice={null} page={page([item({}), item({ id: '00000000-0000-4000-8000-000000000002', canReview: false })])} />);
    expect(screen.getAllByRole('button', { name: 'Mark reviewed' })).toHaveLength(1);
    expect(screen.getByText(/another super admin must review it/i)).toBeTruthy();
  });
  it('shows who reviewed an entry and hides the form', () => {
    wrap(<SecurityReviewView query={{ days: 7, show: 'all' }} notice={null} page={page([item({ reviewedAt: '2026-11-24T11:00:00Z', reviewedBy: 'Admin Two', canReview: false })])} />);
    expect(screen.getByText(/Admin Two/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
  });
  it('new-device entry shows the device label', () => {
    wrap(<SecurityReviewView query={q} notice={null} page={page([item({ action: 'platform.login_new_device', device: 'Safari on iOS', reason: null, companyName: null })])} />);
    expect(screen.getByText('Signed in from a new device')).toBeTruthy();
    expect(screen.getByText('Safari on iOS')).toBeTruthy();
  });
  it('empty and error states render', () => {
    const { unmount } = wrap(<SecurityReviewView query={q} notice={null} page={page([])} />);
    expect(screen.getByText('Nothing to review')).toBeTruthy();
    unmount();
    wrap(<SecurityReviewView query={q} notice="error" page={{ error: 'boom' }} />);
    expect(screen.getByText('Could not load the review')).toBeTruthy();
  });
  it('has no axe violations', async () => {
    const { container } = wrap(<SecurityReviewView query={q} notice="reviewed" page={page([item({})])} />);
    const r = await axe.run(container);
    expect(r.violations).toEqual([]);
  });
});
