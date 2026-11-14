import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script shared with the CLI
import { scan } from '../../scripts/ds/raw-colors.mjs';

/** Phase 6d: no file names a raw palette class or hex colour. Use the semantic tokens from src/styles/tokens.css. */
describe('raw colours', () => {
  it('none anywhere in src (tokens, dev bar, tenant data defaults and the QR backing are exempt)', () => {
    expect(scan()).toEqual({});
  });
});
