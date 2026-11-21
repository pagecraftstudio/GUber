// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLangProvider } from '../lang';
import type { DraftSection } from '@/features/website/pages-types';
import { overlayDetails, overlaySections } from './live-overlay';

const saved: Record<string, string>[] = [];
const inserted: Record<string, string>[] = [];
vi.mock('../website-actions', () => {
  const ok = async () => ({ status: 'success' as const, message: 'saved', nonce: 1 });
  return {
    saveSectionFormAction: async (_p: unknown, fd: FormData) => { saved.push(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); return { status: 'success' as const, message: 'saved', nonce: saved.length }; },
    moveSectionFormAction: ok, toggleSectionFormAction: ok, deleteSectionFormAction: ok,
    insertSectionFormAction: async (_p: unknown, fd: FormData) => { inserted.push(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]))); return new Promise(() => undefined); }, uploadSectionImageFormAction: ok, removeSectionImageFormAction: ok, setSectionImagePositionFormAction: ok, setSectionStyleFormAction: ok,
  };
});
import { LiveCanvas, LiveProvider } from './LiveCanvas';
import { AUTOSAVE_MS } from './PopupFields';

beforeEach(() => { vi.useFakeTimers(); saved.length = 0; inserted.length = 0; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('overlaySections', () => {
  const secs = [{ type: 'about', content: { title: { en: 'Old' }, style: { background: 'tint' } } }, { type: 'faq', content: { items: [{ question: { en: 'Q' }, answer: { en: 'A' } }] } }];
  it('lays typed keys over the saved ones and keeps the style', () => {
    const out = overlaySections(secs as never, ['a', 'b'], { a: { title: { en: 'New', ar: '' } } });
    expect(out[0]!.content).toEqual({ title: { en: 'New' }, style: { background: 'tint' } });
    expect(out[1]).toBe(secs[1]);
  });
  it('a cleared field disappears', () => {
    expect((overlaySections(secs as never, ['a', 'b'], { a: { title: { en: '', ar: '' } } })[0]!.content as Record<string, unknown>).title).toBeUndefined();
  });
  it('a draft that does not parse yet keeps the saved content', () => {
    const tooMany = { items: Array.from({ length: 41 }, () => ({ question: { en: 'Q' } })) };
    expect(overlaySections(secs as never, ['a', 'b'], { b: tooMany })[1]).toBe(secs[1]);
  });
});

describe('overlayDetails', () => {
  it('replaces title, contact and footer; null leaves settings alone', () => {
    const base = { site_title: { en: 'A' }, primary_color: '#123456' } as never;
    expect(overlayDetails(base, null)).toBe(base);
    const out = overlayDetails(base, { titleEn: 'B', titleAr: '', email: ' ', phone: '1', whatsapp: '', addressEn: '', addressAr: '', footerEn: 'f', footerAr: '' });
    expect(out).toMatchObject({ site_title: { en: 'B', ar: '' }, contact_email: null, contact_phone: '1', footer_text: { en: 'f', ar: '' }, primary_color: '#123456' });
  });
});

const P = '00000000-0000-4000-8000-000000000001';
const section: DraftSection = { id: 'a', pageId: P, type: 'about', sortOrder: 0, isEnabled: true, content: { title: { en: 'Old title' } }, updatedAt: '1' };
const page = { slug: '', title: {}, is_home: true, sections: [{ type: 'about', content: section.content }] };
const data = { company: { name: 'Co', slug: 'co' }, version: 0, published_at: new Date(0).toISOString(), site: { schema_version: 1, settings: {}, pages: [page], media: {} } };
const mount = () => render(
  <DashboardLangProvider value="en"><LiveProvider>
    <LiveCanvas shell={{ pageId: P, sections: [section], canWrite: true }} site={{ data: data as never, page: page as never, pageSlug: null, locale: 'en', supabaseUrl: 'https://x.supabase.co', trips: [], editor: [{ id: 'a', type: 'about', enabled: true, label: 'About' }] }} />
  </LiveProvider></DashboardLangProvider>,
);

describe('typing in the canvas', () => {
  it('shows at once in the site, then saves by itself after a pause (one save, not one per key)', async () => {
    mount();
    fireEvent.click(document.querySelector('[data-block-id="a"]')!);
    const input = screen.getAllByRole('textbox').find((e) => (e as HTMLInputElement).value === 'Old title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Old titl' } });
    fireEvent.change(input, { target: { value: 'Brand new title' } });
    expect(document.querySelector('[data-block-id="a"]')!.textContent).toContain('Brand new title');   // before any save
    expect(saved).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_MS + 50); });
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]!.content!)).toEqual({ title: { en: 'Brand new title' } });
    expect(saved[0]).toMatchObject({ pageId: P, sectionId: 'a' });
  });
  it('closing the popup saves what is still waiting', async () => {
    mount();
    fireEvent.click(document.querySelector('[data-block-id="a"]')!);
    const input = screen.getAllByRole('textbox').find((e) => (e as HTMLInputElement).value === 'Old title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Quick edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(saved).toHaveLength(1);
    expect(JSON.parse(saved[0]!.content!)).toEqual({ title: { en: 'Quick edit' } });
  });
  it('adding a section shows it at once, before the server has answered', async () => {
    mount();
    fireEvent.click(document.querySelector('[data-insert-at="1"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    expect(document.querySelectorAll('[data-block-id]')).toHaveLength(2);
    expect(document.querySelector('[data-block-id^="pending-"]')).toBeTruthy();
    expect(inserted).toEqual([{ pageId: P, index: '1', type: 'faq' }]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('a style choice changes the section at once', async () => {
    mount();
    fireEvent.click(document.querySelector('[data-block-id="a"]')!);
    const before = document.querySelector('[data-block-id="a"]')!.innerHTML;
    fireEvent.click(screen.getByRole('button', { name: 'Brand colour' }));
    expect(document.querySelector('[data-block-id="a"]')!.innerHTML).not.toBe(before);
  });
});
