// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { morphOpen } from './morph';

afterEach(() => { vi.restoreAllMocks(); delete (document as { startViewTransition?: unknown }).startViewTransition; delete document.documentElement.dataset.morphing; });

describe('morphOpen', () => {
  it('just runs the update when the browser has no view transitions', () => {
    const update = vi.fn();
    morphOpen(document.createElement('div'), update);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('just runs the update when there is no source element', () => {
    const update = vi.fn();
    morphOpen(null, update);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('names the card, then clears the name and runs the update inside the transition', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    let cb: () => void = () => {};
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (f: () => void) => { cb = f; return { finished: Promise.resolve() }; };
    const el = document.createElement('article');
    const update = vi.fn();
    morphOpen(el, update);
    expect(el.style.viewTransitionName).toBe('ds-morph');
    expect(update).not.toHaveBeenCalled();
    cb();
    expect(el.style.viewTransitionName).toBe('');
    expect(update).toHaveBeenCalledTimes(1);
    await Promise.resolve(); await Promise.resolve();
    expect(document.documentElement.dataset.morphing).toBeUndefined();
  });
  it('does not morph with reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const start = vi.fn();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    const update = vi.fn();
    morphOpen(document.createElement('div'), update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
