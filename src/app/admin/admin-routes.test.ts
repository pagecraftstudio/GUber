import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Structural guard: every admin route entry point must run a platform guard, and nothing under /admin or the
// admin components may touch a service-role key or the browser-side Supabase client.
const ROOT = join(__dirname);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const files = walk(ROOT).filter((f) => /\.(tsx?|ts)$/.test(f) && !f.endsWith('.test.ts'));
const GUARDED = /requirePlatform\(|getPlatformServiceContext\(/;

describe('admin route guards', () => {
  const pages = files.filter((f) => /(^|\/)(page|layout|route)\.tsx?$/.test(f));
  it('finds the layout and overview page', () => {
    expect(pages.map((f) => f.slice(ROOT.length))).toEqual(expect.arrayContaining(['/layout.tsx', '/page.tsx']));
  });
  it.each(pages.map((f) => [f.slice(ROOT.length), f]))('%s calls a platform guard', (_n, f) => {
    expect(readFileSync(f!, 'utf8')).toMatch(GUARDED);
  });
  it('7.3 pages exist and the write-only ones demand super_admin', () => {
    const rel = pages.map((f) => f.slice(ROOT.length));
    expect(rel).toEqual(expect.arrayContaining(['/companies/page.tsx', '/companies/new/page.tsx', '/companies/[id]/page.tsx', '/companies/[id]/edit/page.tsx']));
    for (const p of ['/companies/new/page.tsx', '/companies/[id]/edit/page.tsx']) {
      expect(readFileSync(join(ROOT, p), 'utf8')).toMatch(/getPlatformServiceContext\(ROLE_SETS\.superAdminOnly\)/);
    }
  });
  it('7.4 pages exist and call a platform guard', () => {
    const rel = pages.map((f) => f.slice(ROOT.length));
    expect(rel).toEqual(expect.arrayContaining(['/subscriptions/page.tsx', '/plans/page.tsx']));
  });
  it('layout uses requirePlatform() with no role list (any active platform role)', () => {
    expect(readFileSync(join(ROOT, 'layout.tsx'), 'utf8')).toMatch(/requirePlatform\(\)/);
  });
});

describe('admin code never holds a privileged key or a browser DB client', () => {
  const adminFiles = [...files, ...walk(join(ROOT, '../../components/admin')), ...walk(join(ROOT, '../../features/platform')), ...walk(join(ROOT, '../../features/admin')), ...walk(join(ROOT, '../../features/companies')), ...walk(join(ROOT, '../../features/subscriptions'))].filter((f) => !f.endsWith('.test.ts'));
  it.each(adminFiles.map((f) => [f.slice(join(ROOT, '../..').length), f]))('%s', (_n, f) => {
    const src = readFileSync(f!, 'utf8');
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/i);
    expect(src).not.toMatch(/createBrowserClient|@supabase\/supabase-js'/);
  });
});
