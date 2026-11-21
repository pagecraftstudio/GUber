import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOW_STEPS } from './flow-steps';

/**
 * Regression (production crash "FLOW_STEPS.includes is not a function"): a value exported from a 'use client' file reaches a SERVER
 * page as an opaque reference, not as the real array. The step list therefore lives in a plain module that both sides import.
 */
describe('website flow steps', () => {
  it('is a real array in a module that is not a client module', () => {
    expect(Array.isArray(FLOW_STEPS)).toBe(true);
    expect(FLOW_STEPS.includes('design')).toBe(true);
    expect(readFileSync(new URL('./flow-steps.ts', import.meta.url), 'utf8')).not.toMatch(/^['"]use client['"]/m);
  });
  it('the client nav file does not export the list (a server page could not read it)', () => {
    expect(readFileSync(new URL('./FlowNav.tsx', import.meta.url), 'utf8')).not.toMatch(/export const FLOW_STEPS/);
  });
});
