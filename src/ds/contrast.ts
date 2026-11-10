/** WCAG 2.x contrast helpers (pure). Used by the design page and by tests that prove the plan's Appendix A numbers. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  const digits = m?.[1];
  if (!digits) throw new Error(`invalid hex colour: ${hex}`);
  const n = parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function luminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type Grade = 'AAA' | 'AA' | 'AA-large' | 'fail';
/** Text grading. Non-text UI components need 3:1 (use `contrast(...) >= 3`). */
export function gradeText(ratio: number): Grade {
  return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail';
}

/**
 * Tenant colour guardrail (plan 5.4, D5). A company colour may reach CSS only if it is a strict 6-digit hex and one of
 * white or black text reaches 4.5:1 on it. Anything else returns null and the caller falls back to the MASAR colours.
 * White is preferred when both pass, so company headers keep a consistent light-on-dark look.
 */
export function tenantAccent(hex: string | null | undefined): { accent: string; onAccent: string } | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const accent = hex.toLowerCase();
  if (contrast(accent, '#ffffff') >= 4.5) return { accent, onAccent: '#ffffff' };
  if (contrast(accent, '#000000') >= 4.5) return { accent, onAccent: '#000000' };
  return null;
}
