import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script shared with the CLI
import { BASELINE, scan } from '../../scripts/ds/raw-colors.mjs';

/** Phase 6d ratchet. Raw palette classes and hex literals may only go down. The new system never has any. */
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, number>;
const now = scan() as Record<string, number>;
const HOWTO = 'Run `node scripts/ds/raw-colors.mjs --write` after removing colours, and commit the new baseline.';

describe('raw colour ratchet', () => {
  it('no file gains raw colours and no new file has any (use semantic tokens from src/styles/tokens.css)', () => {
    const worse = Object.entries(now).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f, n]) => `${f}: ${baseline[f] ?? 0} -> ${n}`);
    expect(worse).toEqual([]);
  });
  it(`the baseline is tight, so progress cannot be given back. ${HOWTO}`, () => {
    const stale = Object.entries(baseline).filter(([f, n]) => (now[f] ?? 0) < n).map(([f, n]) => `${f}: ${n} -> ${now[f] ?? 0}`);
    expect(stale).toEqual([]);
  });
  it('the new system (ds, masar views) has none at all', () => {
    expect(Object.keys(now).filter((f) => /^src\/ds\/|\/masar\//.test(f))).toEqual([]);
  });
});
