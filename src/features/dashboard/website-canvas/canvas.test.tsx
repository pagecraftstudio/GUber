// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardLangProvider } from '../lang';
import type { DraftSection } from '@/features/website/pages-types';
import { Sections } from '@/features/site/Sections';
import type { EditorBlock } from '@/features/site/editor-markup';

vi.mock('../website-actions', () => {
  const ok = async () => ({ status: 'success' as const, message: 'saved', nonce: 1 });
  return { saveSectionFormAction: ok, moveSectionFormAction: ok, toggleSectionFormAction: ok, deleteSectionFormAction: ok, insertSectionFormAction: ok, uploadSectionImageFormAction: ok, removeSectionImageFormAction: ok, setSectionImagePositionFormAction: ok, setSectionStyleFormAction: ok };
});
import { CanvasShell } from './CanvasShell';

afterEach(cleanup);
const P = '00000000-0000-4000-8000-000000000001';
const sec = (id: string, type: DraftSection['type'], isEnabled = true, content: Record<string, unknown> = {}): DraftSection => ({ id, pageId: P, type, sortOrder: 0, isEnabled, content, updatedAt: '1' });
const blocks = (s: DraftSection[]): EditorBlock[] => s.map((x) => ({ id: x.id, type: x.type, enabled: x.isEnabled, label: `${x.type} label` }));
const ctx = { site: { schema_version: 1, settings: {}, pages: [], media: {} }, locale: 'en' as const, supabaseUrl: 'https://x.supabase.co', trips: [] };
const site = (s: DraftSection[]) => <Sections sections={s.map((x) => ({ type: x.type, content: x.content }))} ctx={ctx as never} editor={blocks(s)} />;
const SECS = [sec('a', 'hero', true, { title: { en: 'Welcome' }, cta_label: { en: 'Go' }, cta_href: 'https://x.example' }), sec('b', 'faq', false, { items: [{ question: { en: 'Q?' }, answer: { en: 'A' } }] })];
const mount = (s = SECS, canWrite = true, lang: 'en' | 'ar' = 'en', extra: { canUpload?: boolean; imageUrls?: Record<string, string> } = {}) => render(<DashboardLangProvider value={lang}><CanvasShell pageId={P} sections={s} canWrite={canWrite} {...extra}>{site(s)}</CanvasShell></DashboardLangProvider>);
const block = (id: string) => document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;

describe('editor markup', () => {
  it('without `editor` the public output has no editing hooks at all', () => {
    const { container } = render(<Sections sections={[{ type: 'about', content: { title: { en: 'Hi' } } }]} ctx={ctx as never} />);
    expect(container.querySelector('[data-block-id],[data-insert-at]')).toBeNull();
  });
  it('with `editor`: one block per section, "+" strips between and at both ends, hidden ones flagged', () => {
    mount();
    expect(document.querySelectorAll('[data-block-id]')).toHaveLength(2);
    expect([...document.querySelectorAll('[data-insert-at]')].map((e) => (e as HTMLElement).dataset.insertAt)).toEqual(['0', '1', '2']);
    expect(block('b').dataset.enabled).toBe('false');
    expect(block('b').textContent).toContain('Hidden');
  });
  it('an empty page offers a prominent first "+"', () => {
    mount([]);
    expect(screen.getByText(/Add your first section/)).toBeTruthy();
  });
});

describe('canvas interaction', () => {
  it('clicking a block opens its popup with controls and fields; the block is marked selected', () => {
    mount();
    fireEvent.click(block('a'));
    const dlg = screen.getByRole('dialog');
    expect(dlg.textContent).toContain('Hero banner');
    for (const name of [/Up/, /Down/, /Hide/, /Delete/, /Save/]) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(block('a').dataset.selected).toBe('true');
    expect((screen.getByRole('button', { name: /Up/ }) as HTMLButtonElement).disabled).toBe(true);        // first block cannot move up
  });
  it('a hidden section offers Show, not Hide', () => {
    mount();
    fireEvent.click(block('b'));
    expect(screen.getByRole('button', { name: /Show/ })).toBeTruthy();
    expect((screen.getByRole('button', { name: /Down/ }) as HTMLButtonElement).disabled).toBe(true);      // last block
  });
  it('every click inside the site is swallowed: links and FAQ toggles cannot navigate or open', () => {
    mount();
    const link = document.querySelector('a[href="https://x.example"]')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
  it('"+" opens the add menu with every offered section; Escape closes and hands focus back', () => {
    mount();
    const plus = document.querySelector<HTMLElement>('[data-insert-at="1"]')!;
    plus.focus(); fireEvent.click(plus);
    const dlg = screen.getByRole('dialog');
    expect(dlg.querySelectorAll('li button')).toHaveLength(8);
    expect(dlg.textContent).toContain('FAQ');
    fireEvent.keyDown(dlg, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(plus);
  });
  it('Enter on a focused block opens it (keyboard users)', () => {
    mount();
    block('a').focus();
    fireEvent.keyDown(block('a'), { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('closes when the selected section is gone (deleted) and when a section was added through the menu', () => {
    const { rerender } = mount();
    fireEvent.click(block('a'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    const one = SECS.slice(1);
    rerender(<DashboardLangProvider value="en"><CanvasShell pageId={P} sections={one} canWrite>{site(one)}</CanvasShell></DashboardLangProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('[data-insert-at="0"]')!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    const more = [sec('n', 'about'), ...one];
    rerender(<DashboardLangProvider value="en"><CanvasShell pageId={P} sections={more} canWrite>{site(more)}</CanvasShell></DashboardLangProvider>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('read-only staff: clicks are swallowed but no popup ever opens', () => {
    mount(SECS, false);
    fireEvent.click(block('a'));
    fireEvent.click(document.querySelector<HTMLElement>('[data-insert-at="0"]')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('popup follows the dashboard language (Arabic: RTL, Arabic labels)', () => {
    mount(SECS, true, 'ar');
    fireEvent.click(block('a'));
    const dlg = screen.getByRole('dialog');
    expect(dlg.getAttribute('dir')).toBe('rtl');
    expect(dlg.textContent).toContain('البانر الرئيسي');
  });
  it('popups pass an accessibility audit', async () => {
    mount();
    fireEvent.click(block('a'));
    const r = await axe.run(screen.getByRole('dialog'), { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('hero image card (E2)', () => {
  const IMG = '00000000-0000-4000-8000-000000000701';
  const withImg = [sec('a', 'hero', true, { title: { en: 'Welcome' }, image_media_id: IMG, image_position: 'full' }), sec('b', 'about')];
  it('no image yet: offers Upload, no position choice, no Remove', () => {
    mount(SECS, true, 'en', { canUpload: true });
    fireEvent.click(block('a'));
    expect(screen.getByText('Upload image')).toBeTruthy();
    expect(screen.queryByText('Where it sits')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
  it('with an image: Replace, Remove, and the two positions with the stored one selected', () => {
    mount(withImg, true, 'en', { canUpload: true, imageUrls: { a: 'https://x.supabase.co/storage/v1/object/public/company-public/c/a.png' } });
    fireEvent.click(block('a'));
    expect(screen.getByText('Replace')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => [r.value, r.checked])).toEqual([['beside', false], ['full', true]]);
  });
  it('without media permission the picture cannot be changed, and says why', () => {
    mount(withImg, true, 'en', { canUpload: false });
    fireEvent.click(block('a'));
    expect(screen.queryByText('Replace')).toBeNull();
    expect(screen.getByText(/need media permission/i)).toBeTruthy();
  });
  it('only a hero has the card', () => {
    mount([sec('b', 'about')], true, 'en', { canUpload: true });
    fireEvent.click(block('b'));
    expect(screen.queryByText('Banner image')).toBeNull();
  });
  it('an oversize or wrong-type file is refused in the browser with a message and is not submitted', () => {
    mount(SECS, true, 'en', { canUpload: true });
    fireEvent.click(block('a'));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const big = new File([new Uint8Array(10)], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 3_000_000 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(screen.getByRole('alert').textContent).toMatch(/larger than 2 MB/);
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })] } });
    expect(screen.getByRole('alert').textContent).toMatch(/PNG, JPEG or WebP/);
  });
  it('Arabic labels, and no axe violations with the card open', async () => {
    mount(withImg, true, 'ar', { canUpload: true });
    fireEvent.click(block('a'));
    expect(screen.getByText('صورة البانر')).toBeTruthy();
    expect(screen.getByText('خلفية بعرض الصفحة')).toBeTruthy();
    const res = await axe.run(screen.getByRole('dialog'));
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
});
