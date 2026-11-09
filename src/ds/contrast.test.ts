import { describe, expect, it } from 'vitest';
import { contrast, gradeText } from './contrast';
import { REQUIRED_PAIRS } from './tokens';

const r = (a: string, b: string) => Number(contrast(a, b).toFixed(2));

describe('contrast helper reproduces plan Appendix A', () => {
  it('known failures from the brief', () => {
    expect(r('#14C88A', '#FFFFFF')).toBe(2.17); // mint on white fails
    expect(r('#DCDCDC', '#FFFFFF')).toBe(1.37); // spec border fails 3:1
    expect(r('#B7791F', '#FFFFFF')).toBe(3.64); // spec warning text fails
    expect(r('#FFEB3B', '#FFFFFF')).toBe(1.22); // guardrail example, rejected tenant colour
  });
  it('known passes', () => {
    expect(r('#0B3D2E', '#FFFFFF')).toBeGreaterThan(12);
    expect(r('#14243A', '#FFFFFF')).toBe(15.63);
    expect(r('#0F766E', '#FFFFFF')).toBe(5.47);
    expect(r('#B45309', '#FFFFFF')).toBe(5.02);
    expect(r('#3563E9', '#FFFFFF')).toBe(5.11);
  });
  it('grades', () => {
    expect(gradeText(4.5)).toBe('AA');
    expect(gradeText(2.17)).toBe('fail');
  });
});

describe('every required token pair passes', () => {
  for (const p of REQUIRED_PAIRS) {
    it(`${p.label}`, () => {
      expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(p.kind === 'text' ? 4.5 : 3);
    });
  }
});
