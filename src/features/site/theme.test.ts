import { describe, expect, it } from 'vitest';
import { contrast } from '@/ds/contrast';
import { BUTTON_RADIUS, COLOR_PRESETS, DEFAULT_THEME, FONT_PAIRS, FONT_STACK, readTheme, themeVars } from './theme';

describe('site theme', () => {
  it('an old snapshot (no theme) gets the platform look', () => { expect(readTheme(undefined)).toEqual(DEFAULT_THEME); expect(readTheme(null)).toEqual(DEFAULT_THEME); expect(readTheme('x')).toEqual(DEFAULT_THEME); });
  it('unknown values fall back per field, never reach CSS', () => {
    const t = readTheme({ font_heading: 'comic-sans', font_body: 'cairo', button_style: 'url(javascript:1)' });
    expect(t).toEqual({ fontHeading: 'plex', fontBody: 'cairo', buttonStyle: 'soft' });
    const v = themeVars(t); expect(Object.values(v).join(' ')).not.toMatch(/javascript|comic/);
  });
  it('every pair and button style resolves to a stack and radius', () => {
    for (const p of FONT_PAIRS) { expect(FONT_STACK[p.heading]).toBeTruthy(); expect(FONT_STACK[p.body]).toBeTruthy(); }
    expect(Object.keys(BUTTON_RADIUS)).toHaveLength(3);
  });
  it('every colour preset gives readable white text on the primary', () => {
    for (const c of COLOR_PRESETS) expect(contrast(c.primary, '#ffffff'), c.id).toBeGreaterThanOrEqual(4.5);
  });
});
