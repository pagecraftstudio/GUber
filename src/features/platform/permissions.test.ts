import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_ROLES } from '@/lib/auth/types';
import { ROLE_SETS, canRole } from './permissions';

const dir = join(process.cwd(), 'supabase', 'migrations');
const key = (r: readonly string[]) => [...r].sort().join(',');
const known = new Set(Object.values(ROLE_SETS).map((r) => key(r)));

/** Every distinct role list passed to assert_platform in the admin migrations (0016+). */
function dbRoleLists(): string[] {
  const out = new Set<string>();
  for (const f of readdirSync(dir).filter((n) => /^00(1[6-9]|[2-9]\d)_/.test(n))) {
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/assert_platform\(array\[([^\]]+)\]/g)) {
      out.add(key(m[1]!.split(',').map((x) => x.trim().replace(/'/g, ''))));
    }
  }
  return [...out];
}

describe('platform permission matrix', () => {
  it('only uses real platform roles', () => {
    for (const r of Object.values(ROLE_SETS).flat()) expect(PLATFORM_ROLES).toContain(r);
  });
  it('every role list in the admin RPCs is a named set in ROLE_SETS (no drift)', () => {
    const lists = dbRoleLists();
    expect(lists.length).toBeGreaterThan(0);
    for (const l of lists) expect(known, `RPC role list "${l}" has no ROLE_SETS entry`).toContain(l);
  });
  it('every non-trivial set is actually used by a DB RPC', () => {
    const lists = new Set(dbRoleLists());
    for (const [name, r] of Object.entries(ROLE_SETS)) expect(lists, name).toContain(key(r));
  });
  it('role matrix', () => {
    expect(canRole('super_admin', 'superAdminOnly')).toBe(true);
    expect(canRole('support', 'superAdminOnly')).toBe(false);
    expect(canRole('billing', 'subscriptionWriters')).toBe(true);
    expect(canRole('support', 'subscriptionWriters')).toBe(false);
    expect(canRole('support', 'noteWriters')).toBe(true);
    expect(canRole('billing', 'noteWriters')).toBe(false);
    expect(canRole('billing', 'auditSummary')).toBe(false);
    expect(canRole(null, 'anyStaff')).toBe(false);
  });
});
