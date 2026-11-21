/**
 * Look of a company website (E3): a FIXED set of choices, never free CSS. Fonts and button shapes come from these tables, colours
 * are validated hex (and checked for contrast by tenantAccent). Because every value is picked from a list, any combination stays
 * readable on a phone and in Arabic. Pure; shared by the editor and the public renderer.
 */
export const FONT_KEYS = ['plex', 'cairo', 'tajawal'] as const;
export type FontKey = (typeof FONT_KEYS)[number];
export const BUTTON_STYLES = ['square', 'soft', 'pill'] as const;
export type ButtonStyle = (typeof BUTTON_STYLES)[number];

type Bi = { en: string; ar: string };

/** CSS stacks. Latin cut first, Arabic cut second, then system fallbacks. The variables come from ds/fonts (fonts.ts, site-fonts.ts). */
export const FONT_STACK: Record<FontKey, string> = {
  plex: 'var(--font-latin), var(--font-arabic), ui-sans-serif, system-ui, sans-serif',
  cairo: 'var(--font-cairo-latin), var(--font-cairo-arabic), ui-sans-serif, system-ui, sans-serif',
  tajawal: 'var(--font-tajawal-latin), var(--font-tajawal-arabic), ui-sans-serif, system-ui, sans-serif',
};
export const FONT_LABEL: Record<FontKey, Bi> = { plex: { en: 'Plex', ar: 'بلكس' }, cairo: { en: 'Cairo', ar: 'القاهرة' }, tajawal: { en: 'Tajawal', ar: 'تجوال' } };

export const FONT_PAIRS: Array<{ id: string; label: Bi; heading: FontKey; body: FontKey }> = [
  { id: 'plex', label: { en: 'Clean', ar: 'نظيف' }, heading: 'plex', body: 'plex' },
  { id: 'cairo', label: { en: 'Friendly', ar: 'ودود' }, heading: 'cairo', body: 'cairo' },
  { id: 'tajawal', label: { en: 'Modern', ar: 'عصري' }, heading: 'tajawal', body: 'tajawal' },
  { id: 'cairo-plex', label: { en: 'Mixed', ar: 'مختلط' }, heading: 'cairo', body: 'plex' },
];

export const BUTTON_RADIUS: Record<ButtonStyle, string> = { square: '0.125rem', soft: '0.375rem', pill: '9999px' };
export const BUTTON_LABEL: Record<ButtonStyle, Bi> = { square: { en: 'Square', ar: 'حاد' }, soft: { en: 'Soft', ar: 'ناعم' }, pill: { en: 'Pill', ar: 'دائري' } };

/** Colour presets (primary = buttons and the accent band, secondary = supporting). All pass the 4.5:1 text check against white. */
export const COLOR_PRESETS: Array<{ id: string; label: Bi; primary: string; secondary: string }> = [
  { id: 'ocean', label: { en: 'Ocean', ar: 'المحيط' }, primary: '#1d4ed8', secondary: '#0f172a' },
  { id: 'forest', label: { en: 'Forest', ar: 'الغابة' }, primary: '#047857', secondary: '#12332a' },
  { id: 'sunset', label: { en: 'Sunset', ar: 'الغروب' }, primary: '#b91c1c', secondary: '#3b1212' },
  { id: 'plum', label: { en: 'Plum', ar: 'البرقوق' }, primary: '#7e22ce', secondary: '#2e1065' },
  { id: 'amber', label: { en: 'Amber', ar: 'العنبر' }, primary: '#92400e', secondary: '#2b1a0a' },
  { id: 'slate', label: { en: 'Slate', ar: 'الأردواز' }, primary: '#334155', secondary: '#0f172a' },
];

const isFont = (v: unknown): v is FontKey => typeof v === 'string' && (FONT_KEYS as readonly string[]).includes(v);
const isButton = (v: unknown): v is ButtonStyle => typeof v === 'string' && (BUTTON_STYLES as readonly string[]).includes(v);

export type SiteTheme = { fontHeading: FontKey; fontBody: FontKey; buttonStyle: ButtonStyle };
export const DEFAULT_THEME: SiteTheme = { fontHeading: 'plex', fontBody: 'plex', buttonStyle: 'soft' };

/**
 * The theme a snapshot carries. A snapshot published BEFORE E3 has no `theme` key and renders with the platform look, exactly as
 * it always did (its old `font_heading: 'cairo'` column value was never a design choice). Unknown values fall back per field.
 */
export function readTheme(raw: unknown): SiteTheme {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { fontHeading: isFont(o.font_heading) ? o.font_heading : DEFAULT_THEME.fontHeading, fontBody: isFont(o.font_body) ? o.font_body : DEFAULT_THEME.fontBody, buttonStyle: isButton(o.button_style) ? o.button_style : DEFAULT_THEME.buttonStyle };
}

/** CSS custom properties a site wrapper sets; the renderer's classes read them. Only values from the tables above ever reach CSS. */
export function themeVars(t: SiteTheme): Record<string, string> {
  return { '--site-font-heading': FONT_STACK[t.fontHeading], '--site-font-body': FONT_STACK[t.fontBody], '--site-btn-radius': BUTTON_RADIUS[t.buttonStyle] };
}
