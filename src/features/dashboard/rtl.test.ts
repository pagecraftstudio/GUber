import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PAGE_AR } from '@/features/dashboard/messages';
import { DashboardLangProvider } from '@/features/dashboard/lang';
import { Bi, Dt, T } from '@/components/dashboard/T';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill } from '@/components/dashboard/DataTable';
import { Ltr } from '@/components/dashboard/Ltr';
import { isNavActive, visibleNav } from '@/components/dashboard/nav';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
const DASH_FILES = [...walk('src/app/dashboard'), ...walk('src/components/dashboard'), ...walk('src/features/dashboard')];
const read = (p: string) => readFileSync(p, 'utf8');
const ar = (node: React.ReactElement) => renderToStaticMarkup(createElement(DashboardLangProvider, { value: 'ar' }, node));
const en = (node: React.ReactElement) => renderToStaticMarkup(createElement(DashboardLangProvider, { value: 'en' }, node));

describe('RTL: no physical-direction styling in the company dashboard', () => {
  // Tailwind logical utilities (ms-/me-/ps-/pe-/start-/end-/border-s/border-e/text-start/text-end) flip with `dir`; these do not.
  const PHYSICAL = /(?<![\w-])(?:text-left|text-right|[mp][lr]-(?:\d|\[)|(?:lg:|sm:|md:|xl:)[mp][lr]-(?:\d|\[)|(?:left|right)-(?:\d|\[)|border-[lr](?:-|\b)|rounded-[lr]{1,2}(?:-|\b)|float-(?:left|right))/;
  for (const f of DASH_FILES) {
    it(`${f} uses logical classes only`, () => {
      const hit = read(f).match(PHYSICAL);
      expect(hit?.[0] ?? null).toBeNull();
    });
  }
  it('no dashboard file hard-codes a sliding drawer direction', () => {
    expect(DASH_FILES.filter((f) => /translate-x/.test(read(f)))).toEqual([]);
  });
  it('the shell frame anchors with start-0/border-e and flips its arrow in RTL', () => {
    const s = read('src/ds/shell/ShellFrame.tsx');
    expect(s).toContain('start-0');
    expect(s).toContain('border-e');
    expect(s).toContain('rtl:-scale-x-100');
  });
  it('the server renders the saved direction from a cookie (no left-to-right flash)', () => {
    expect(read('src/app/dashboard/layout.tsx')).toContain("malaky-dashboard-language");
    expect(read('src/ds/shell/DashboardShellMasar.tsx')).toContain('document.cookie');
  });
});

describe('RTL: page chrome translation', () => {
  it('every literal shown through <T>, table labels, and header props has an Arabic entry', () => {
    const missing = new Set<string>();
    const need = (text: string) => { if (text.trim() && !PAGE_AR[text]) missing.add(text); };
    for (const f of DASH_FILES.filter((x) => x.startsWith('src/app/dashboard'))) {
      const s = read(f);
      for (const m of s.matchAll(/<T>(\S[^<{}]*)<\/T>/g)) need(m[1]!);
      for (const m of s.matchAll(/\blabel: ?'([^']+)'/g)) need(m[1]!);
      for (const m of s.matchAll(/\b(?:eyebrow|title|description|emptyTitle|emptyText)="([^"]+)"/g)) need(m[1]!);
      for (const m of s.matchAll(/\b(?:eyebrow|title|description|emptyTitle|emptyText)=\{[^}]*?'([^']+)'[^}]*\}/g)) need(m[1]!);
      for (const m of s.matchAll(/(?<![-\w])label="([^"]+)"/g)) need(m[1]!);
      for (const m of s.matchAll(/\b(?:label|hint):'([^']+)'/g)) need(m[1]!);
    }
    expect([...missing]).toEqual([]);
  });
  it('every dictionary value is Arabic text (no English left in the Arabic column)', () => {
    const bad = Object.entries(PAGE_AR).filter(([, v]) => !/[؀-ۿ]/.test(v));
    expect(bad).toEqual([]);
  });
  it('<T> shows Arabic in Arabic, English in English, and passes unknown text (data) through', () => {
    expect(ar(createElement(T, null, 'Routes'))).toBe('المسارات');
    expect(en(createElement(T, null, 'Routes'))).toBe('Routes');
    expect(ar(createElement(T, null, 'Karim Express 7'))).toBe('Karim Express 7');
  });
  it('<Bi> picks by language', () => {
    expect(ar(createElement(Bi, { en: 'Yes', ar: 'نعم' }))).toBe('نعم');
    expect(en(createElement(Bi, { en: 'Yes', ar: 'نعم' }))).toBe('Yes');
  });
  it('PageHeader and DataTable chrome follow the language and the table is start-aligned', () => {
    const header = createElement(PageHeader, { eyebrow: 'Fleet operations', title: 'Fleet management', description: 'Manage your vehicles, registration details and seating capacity.' });
    expect(ar(header)).toContain('إدارة الأسطول');
    expect(en(header)).toContain('Fleet management');
    const table = createElement(DataTable<{ id: string; a: string }>, { rows: [{ id: '1', a: 'x' }], columns: [{ key: 'a', label: 'Status' }] });
    expect(ar(table)).toContain('الحالة');
    expect(ar(table)).toContain('text-start');
    const empty = createElement(DataTable<{ id: string }>, { rows: [], columns: [] });
    expect(ar(empty)).toContain('لا يوجد شيء بعد');
  });
  it('status pills translate known states and keep unknown ones', () => {
    expect(ar(createElement(StatusPill, { value: 'no_show' }))).toContain('لم يحضر');
    expect(ar(createElement(StatusPill, { value: 'weird_state' }))).toContain('weird state');
  });
  it('<Ltr> isolates phone numbers, plates and references', () => {
    expect(renderToStaticMarkup(createElement(Ltr, null, '+201000000001'))).toBe('<span dir="ltr" class="inline-block ">+201000000001</span>');
  });
  it('<Dt> renders a dir=ltr <time> with Latin digits in Arabic', () => {
    const out = ar(createElement(Dt, { value: '2026-03-05T10:00:00.000Z' }));
    expect(out).toContain('dir="ltr"');
    expect(out).toMatch(/[0-9]/);
    expect(out).not.toMatch(/[٠-٩]/);
  });
});

describe('sidebar navigation', () => {
  const keys = (p: string[]) => visibleNav(p).map((n) => n.key);
  it('hides modules the member cannot read, keeps overview', () => {
    expect(keys([])).toEqual(['overview']);
    expect(keys(['customers.read', 'settings.read', 'users.read'])).toEqual(['overview', 'users', 'customers', 'settings']);
  });
  it('marks a module active on its sub-pages only', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true);
    expect(isNavActive('/dashboard', '/dashboard/routes')).toBe(false);
    expect(isNavActive('/dashboard/routes', '/dashboard/routes/abc')).toBe(true);
    expect(isNavActive('/dashboard/routes', '/dashboard/routes-x')).toBe(false);
  });
});
