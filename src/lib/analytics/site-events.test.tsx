// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvents = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('./client', () => ({ trackEvents: (...a: unknown[]) => trackEvents(...a) }));
import { readTracked, useSiteEvents } from './site-events';

const html = (s: string) => { document.body.innerHTML = s; };
beforeEach(() => trackEvents.mockClear());
afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('readTracked', () => {
  it('reads a catalogued event with its allowed keys, from a nested click target', () => {
    html(`<a id="a" data-track="book_click" data-track-props='{"trip_id":"t1"}'><span id="s">Book</span></a>`);
    expect(readTracked(document.getElementById('s'))).toEqual({ event: 'book_click', properties: { trip_id: 't1' } });
  });
  it('refuses events outside the site list, keys outside the catalog, non-scalars, long strings and bad JSON', () => {
    const cases = [
      `<a id="a" data-track="booking_success" data-track-props="{}">x</a>`,
      `<a id="a" data-track="book_click" data-track-props='{"email":"a@b.co"}'>x</a>`,
      `<a id="a" data-track="book_click" data-track-props='{"trip_id":{"x":1}}'>x</a>`,
      `<a id="a" data-track="book_click" data-track-props='{"trip_id":"${'a'.repeat(201)}"}'>x</a>`,
      `<a id="a" data-track="book_click" data-track-props='not json'>x</a>`,
      `<a id="a" data-track="book_click" data-track-props='[1]'>x</a>`,
    ];
    for (const c of cases) { html(c); expect(readTracked(document.getElementById('a')), c).toBeNull(); }
    html('<a id="a">plain</a>'); expect(readTracked(document.getElementById('a'))).toBeNull();
  });
});

describe('useSiteEvents', () => {
  it('sends a tracked click once it is enabled, and ignores untracked clicks', () => {
    html(`<a id="a" data-track="contact_click" data-track-props='{"channel":"email"}'>m</a><a id="b">x</a>`);
    renderHook(() => useSiteEvents(true, 'ar'));
    document.getElementById('b')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.getElementById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(trackEvents).toHaveBeenCalledTimes(1);
    expect(trackEvents).toHaveBeenCalledWith('ar', [{ event: 'contact_click', properties: { channel: 'email' } }]);
  });
  it('does nothing before consent (disabled), and stops when disabled again', () => {
    html(`<a id="a" data-track="contact_click" data-track-props='{"channel":"email"}'>m</a>`);
    const { rerender } = renderHook(({ on }) => useSiteEvents(on, 'en'), { initialProps: { on: false } });
    document.getElementById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(trackEvents).not.toHaveBeenCalled();
    rerender({ on: true }); rerender({ on: false });
    document.getElementById('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(trackEvents).not.toHaveBeenCalled();
  });
  it('counts a section view once, when it is on screen, and only for a clean section name', () => {
    let cb: IntersectionObserverCallback = () => undefined;
    const unobserve = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { constructor(c: IntersectionObserverCallback) { cb = c; } observe() {} unobserve = unobserve; disconnect() {} });
    html(`<div id="h" data-track-section="hero"></div><div id="x" data-track-section="Bad Name!"></div>`);
    renderHook(() => useSiteEvents(true, 'en'));
    const entry = (id: string, isIntersecting: boolean) => ({ isIntersecting, target: document.getElementById(id)! }) as unknown as IntersectionObserverEntry;
    cb([entry('h', false)], {} as IntersectionObserver);
    expect(trackEvents).not.toHaveBeenCalled();
    cb([entry('h', true), entry('h', true), entry('x', true)], {} as IntersectionObserver);
    expect(trackEvents).toHaveBeenCalledTimes(1);
    expect(trackEvents).toHaveBeenCalledWith('en', [{ event: 'section_view', properties: { section: 'hero' } }]);
  });
});
