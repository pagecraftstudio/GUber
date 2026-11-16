// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeaderLogo } from './HeaderLogo';
import { HORIZONTAL_LOCKUP, STACKED_LOCKUP } from './lockupsProvisional';

describe('HeaderLogo', () => {
  it('is one accessible image named MASAR; the drawings are decorative', () => {
    const { container } = render(<HeaderLogo />);
    expect(screen.getAllByRole('img', { name: 'MASAR' })).toHaveLength(1);
    container.querySelectorAll('svg').forEach((s) => expect(s.getAttribute('aria-hidden')).toBe('true'));
  });
  it('horizontal lockup from lg up, stacked lockup below lg', () => {
    const { container } = render(<HeaderLogo />);
    const [h, s] = [...container.querySelectorAll('svg')];
    expect(h!.getAttribute('class')).toMatch(/hidden[^"]*lg:block/);
    expect(h!.getAttribute('viewBox')).toBe(HORIZONTAL_LOCKUP.viewBox);
    expect(s!.getAttribute('class')).toMatch(/lg:hidden/);
    expect(s!.getAttribute('viewBox')).toBe(STACKED_LOCKUP.viewBox);
  });
  it('takes the surrounding text colour (no fixed colour), so dark mode follows the tokens', () => {
    const { container } = render(<HeaderLogo />);
    container.querySelectorAll('svg').forEach((s) => expect(s.getAttribute('fill')).toBe('currentColor'));
  });
});
