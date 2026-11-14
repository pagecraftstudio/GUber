// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfirmedRoute } from './domain/ConfirmedRoute';

afterEach(cleanup);

describe('ConfirmedRoute', () => {
  it('names the real route for assistive tech and shows both stops as text', () => {
    render(<ConfirmedRoute origin="Cairo, Ramses" destination="Alexandria" />);
    expect(screen.getByRole('group', { name: 'Cairo, Ramses → Alexandria' })).toBeTruthy();
    expect(screen.getByText('Cairo, Ramses')).toBeTruthy();
    expect(screen.getByText('Alexandria')).toBeTruthy();
  });
  it('renders nothing when either end is unknown (the page falls back to the plain check); never invents a stop', () => {
    const a = render(<ConfirmedRoute origin="" destination="Alexandria" />);
    expect(a.container.innerHTML).toBe('');
    const b = render(<ConfirmedRoute origin="Cairo" destination="" />);
    expect(b.container.innerHTML).toBe('');
  });
  it('the drawing is decorative: hidden from screen readers, so nothing is announced twice', () => {
    const { container } = render(<ConfirmedRoute origin="Cairo" destination="Alexandria" />);
    const art = container.querySelector('.ds-route-line')?.parentElement;
    expect(art?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.ds-check')).not.toBeNull(); // reuses the existing check, so it draws with the same keyframes
  });
  it('uses logical alignment only, so it mirrors in RTL', () => {
    const { container } = render(<ConfirmedRoute origin="Cairo" destination="Alexandria" />);
    expect(container.innerHTML).not.toMatch(/\b(?:text-left|text-right|ml-|mr-|pl-|pr-)/);
  });
  it('has no serious accessibility violations, English and Arabic', async () => {
    for (const [dir, o, d] of [['ltr', 'Cairo', 'Alexandria'], ['rtl', '\u0627\u0644\u0642\u0627\u0647\u0631\u0629', '\u0627\u0644\u0625\u0633\u0643\u0646\u062f\u0631\u064a\u0629']] as const) {
      const { container, unmount } = render(<div dir={dir}><ConfirmedRoute origin={o} destination={d} /></div>);
      const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
      unmount();
    }
  });
});
