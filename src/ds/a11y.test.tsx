// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Gallery } from './gallery/Gallery';
import { polyfillDialog } from './test-setup';

beforeAll(polyfillDialog);
afterEach(cleanup);

/**
 * axe over every component and state, in both languages (plan Phase 3 exit: no serious or critical violations).
 * jsdom has no layout engine, so colour-contrast and a few visual rules cannot run here; contrast is covered by
 * contrast.test.ts (every token pair) and must still be checked in a real browser (see PHASE-3-REPORT.md).
 */
describe('axe on the component gallery', () => {
  for (const lang of ['en', 'ar'] as const) {
    it(`${lang}: no serious or critical violations`, async () => {
      const { container } = render(<Gallery lang={lang} />);
      const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, resultTypes: ['violations'] });
      const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }
});
