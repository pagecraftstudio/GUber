// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RollingNumber } from './data/RollingNumber';
import { OccupancyBar } from './domain/RouteLine';

afterEach(cleanup);
const roll = (c: HTMLElement) => c.querySelectorAll('.ds-roll-col');

describe('RollingNumber', () => {
  it('first render is still: no roll, no count-up, text is exactly the formatted number', () => {
    const { container } = render(<RollingNumber value={1250} lang="en" />);
    expect(container.textContent).toBe('1,250');
    expect(roll(container).length).toBe(0);
  });
  it('same value again does nothing', () => {
    const { container, rerender } = render(<RollingNumber value={7} lang="en" />);
    rerender(<RollingNumber value={7} lang="en" />);
    expect(roll(container).length).toBe(0);
  });
  it('a rise rolls up, a fall rolls down, and only the digits that changed move', () => {
    const { container, rerender } = render(<RollingNumber value={19} lang="en" />);
    rerender(<RollingNumber value={20} lang="en" />);
    const up = roll(container);
    expect(up.length).toBe(2); // 1->2 and 9->0 both changed
    expect(up[0]!.getAttribute('data-dir')).toBe('up');
    rerender(<RollingNumber value={21} lang="en" />);
    expect(roll(container).length).toBe(1); // only the ones digit changed
    rerender(<RollingNumber value={20} lang="en" />);
    expect(roll(container)[0]!.getAttribute('data-dir')).toBe('down');
  });
  it('text content never includes the outgoing digit, so it is read once and tests see one number', () => {
    const { container, rerender } = render(<RollingNumber value={2} lang="en" />);
    rerender(<RollingNumber value={3} lang="en" />);
    expect(container.textContent).toBe('3');
    expect(container.querySelector('.ds-roll-old')?.getAttribute('data-d')).toBe('2');
    expect(container.querySelector('.ds-roll-old')?.getAttribute('aria-hidden')).toBe('true');
  });
  it('Arabic-Indic digits roll the same way and stay in the same numeral system', () => {
    const { container, rerender } = render(<RollingNumber value={9} lang="ar" />);
    expect(container.textContent).toBe('\u0669');
    rerender(<RollingNumber value={8} lang="ar" />);
    expect(container.textContent).toBe('\u0668');
    expect(container.querySelector('.ds-roll-old')?.getAttribute('data-d')).toBe('\u0669');
  });
  it('thousands separators stay still; a new leading digit fades in instead of rolling', () => {
    const { container, rerender } = render(<RollingNumber value={999} lang="en" />);
    rerender(<RollingNumber value={1000} lang="en" />);
    expect(container.textContent).toBe('1,000');
    expect(container.querySelectorAll('.ds-roll-in').length).toBe(1);
  });
  it('an unrelated re-render keeps the same nodes, so the animation is not restarted mid-flight', () => {
    const { container, rerender } = render(<RollingNumber value={4} lang="en" />);
    rerender(<RollingNumber value={5} lang="en" />);
    const col = roll(container)[0];
    rerender(<RollingNumber value={5} lang="en" />);
    expect(roll(container)[0]).toBe(col);
  });
  it('reads left to right even inside Arabic text, and has no serious accessibility violations', async () => {
    const { container, rerender } = render(<div dir="rtl"><RollingNumber value={12} lang="ar" /></div>);
    rerender(<div dir="rtl"><RollingNumber value={13} lang="ar" /></div>);
    expect(container.querySelector('[dir="ltr"]')).not.toBeNull();
    const r = await axe.run(container, { resultTypes: ['violations'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});

describe('OccupancyBar moves by transform, not width', () => {
  it('fill is a scaled full-width bar; no width in the inline style', () => {
    const { container } = render(<OccupancyBar booked={5} capacity={20} label="Seats" figures="5 of 20" />);
    const fill = container.querySelector('.ds-fill') as HTMLElement;
    expect(fill.style.transform).toBe('scaleX(0.25)');
    expect(fill.style.width).toBe('');
  });
  it('clamps to 0 to 1 and handles zero capacity', () => {
    const a = render(<OccupancyBar booked={50} capacity={20} label="x" figures="x" />);
    expect((a.container.querySelector('.ds-fill') as HTMLElement).style.transform).toBe('scaleX(1)');
    const b = render(<OccupancyBar booked={3} capacity={0} label="x" figures="x" />);
    expect((b.container.querySelector('.ds-fill') as HTMLElement).style.transform).toBe('scaleX(0)');
  });
  it('the meter keeps its accessible value', () => {
    const { container } = render(<OccupancyBar booked={5} capacity={20} label="Seats" figures="5 of 20" />);
    const m = container.querySelector('[role="meter"]')!;
    expect(m.getAttribute('aria-valuenow')).toBe('5');
    expect(m.getAttribute('aria-valuetext')).toBe('5 of 20');
  });
});
