import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.mock\./.test(n)) out.push(p);
  }
  return out;
}

describe('every real supabase signOut call states its scope explicitly', () => {
  const calls = walk(join(process.cwd(), 'src')).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/auth\.signOut\(([^)]*)\)/g)].map((m) => ({ f, arg: m[1]!.trim() })));

  it('finds the known call sites', () => { expect(calls.length).toBeGreaterThanOrEqual(4); });
  it("no bare signOut() (library default 'global' would end every device)", () => {
    expect(calls.filter((c) => c.arg === '')).toEqual([]);
  });
  it("'global' is never used", () => {
    expect(calls.filter((c) => /global/.test(c.arg))).toEqual([]);
  });
  it("only password reset may use 'others'", () => {
    expect(calls.filter((c) => /others/.test(c.arg)).map((c) => c.f.replace(/\\/g, '/').split('/src/')[1])).toEqual(['features/auth/actions.ts']);
  });
});
