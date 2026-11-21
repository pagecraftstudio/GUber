// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardLangProvider } from '../lang';
import type { DraftSection } from '@/features/website/pages-types';

const calls: Record<string, string>[] = [];
vi.mock('../website-actions', () => ({
  setSectionStyleFormAction: async (_p: unknown, fd: FormData) => {
    calls.push(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)])));
    return { status: 'success' as const, message: 'saved', nonce: calls.length };
  },
}));
import { StyleCard } from './StyleCard';

afterEach(cleanup);
const section: DraftSection = { id: 's1', pageId: 'p1', type: 'about', sortOrder: 0, isEnabled: true, content: {}, updatedAt: '1' };

describe('StyleCard', () => {
  it('sends the chosen field with the section ids (a submit button value is not in new FormData(form))', async () => {
    render(<DashboardLangProvider value="en"><StyleCard section={section} /></DashboardLangProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Brand colour' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ pageId: 'p1', sectionId: 's1', background: 'brand' });
  });
});
