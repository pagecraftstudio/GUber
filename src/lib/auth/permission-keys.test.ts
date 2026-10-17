import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permission-keys';

describe('PERMISSIONS vs migration 0005 seed', () => {
  it('has exactly the seeded keys (no drift)', () => {
    const sql = readFileSync('supabase/migrations/0005_seed_catalog.sql', 'utf8');
    const block = sql.slice(sql.indexOf('insert into permissions'), sql.indexOf('-- grants as data'));
    const seeded = [...block.matchAll(/\('([a-z_.]+)','[a-z_]+'\)/g)].map((m) => m[1]).sort();
    expect(seeded.length).toBeGreaterThan(20);
    expect(Object.values(PERMISSIONS).sort()).toEqual(seeded);
  });
});
