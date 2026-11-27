import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from './permission-keys';

describe('PERMISSIONS vs migration seeds (0005 + later additions, incl. 0074 shuttle)', () => {
  it('has exactly the seeded keys (no drift)', () => {
    const sql = readFileSync('supabase/migrations/0005_seed_catalog.sql', 'utf8');
    const block = sql.slice(sql.indexOf('insert into permissions'), sql.indexOf('-- grants as data'));
    const added = readFileSync('supabase/migrations/0043_domains_seed_and_backfill.sql', 'utf8');
    const addedBlock = added.slice(added.indexOf('insert into public.permissions'), added.indexOf('insert into public.role_permissions'));
    const shuttle = readFileSync('supabase/migrations/0074_shuttle_foundations.sql', 'utf8');
    const shuttleBlock = shuttle.slice(shuttle.indexOf('insert into public.permissions'), shuttle.indexOf('-- grants as data'));
    const seeded = [
      ...block.matchAll(/\('([a-z_.]+)','[a-z_]+'\)/g),
      ...addedBlock.matchAll(/\('([a-z_.]+)',\s*'[a-z_]+'\)/g),
      ...shuttleBlock.matchAll(/\('([a-z_.]+)','[a-z_]+'\)/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(seeded.length).toBeGreaterThan(20);
    expect(Object.values(PERMISSIONS).sort()).toEqual(seeded);
  });
});
