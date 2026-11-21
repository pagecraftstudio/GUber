import { z } from 'zod';

/**
 * Per-section look (E4): background, alignment and spacing, each a choice from a short list stored under `style` in the section's
 * content. Fixed lists, never CSS, so every combination stays readable on a phone and in Arabic. Alignment is "start" / "center"
 * (logical: start is the left in English and the right in Arabic). A section with no style renders exactly as it did before E4.
 * Pure; shared by the editor, the write schemas and the public renderer.
 */
export const BACKGROUNDS = ['plain', 'tint', 'brand'] as const;
export const ALIGNS = ['start', 'center'] as const;
export const SPACINGS = ['compact', 'normal', 'roomy'] as const;
export type Background = (typeof BACKGROUNDS)[number];
export type Align = (typeof ALIGNS)[number];
export type Spacing = (typeof SPACINGS)[number];
export type SectionStyle = { background: Background; align: Align; spacing: Spacing };
export const DEFAULT_STYLE: SectionStyle = { background: 'plain', align: 'start', spacing: 'normal' };

/** Write side: strict, every key optional. */
export const sectionStyleWrite = z.strictObject({ background: z.enum(BACKGROUNDS).optional(), align: z.enum(ALIGNS).optional(), spacing: z.enum(SPACINGS).optional() });
/** Read side (public snapshot): lenient. An unreadable style is ignored, never a reason to hide the section. */
export const sectionStyleRead = z.object({ background: z.string().optional(), align: z.string().optional(), spacing: z.string().optional() }).optional().catch(undefined);

const pick = <T extends string>(list: readonly T[], v: unknown, d: T): T => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d);
export function readStyle(raw: unknown): SectionStyle {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { background: pick(BACKGROUNDS, o.background, 'plain'), align: pick(ALIGNS, o.align, 'start'), spacing: pick(SPACINGS, o.spacing, 'normal') };
}
/** What to store: only the parts that differ from the default, or nothing at all. */
export function compactStyle(s: Partial<SectionStyle>): Partial<SectionStyle> {
  const out: Partial<SectionStyle> = {};
  if (s.background && s.background !== 'plain') out.background = s.background;
  if (s.align && s.align !== 'start') out.align = s.align;
  if (s.spacing && s.spacing !== 'normal') out.spacing = s.spacing;
  return out;
}

const PY: Record<Spacing, string> = { compact: '1.5rem', normal: '2.5rem', roomy: '4.5rem' };
const HERO_PY: Record<Spacing, string> = { compact: '2.5rem', normal: '3.5rem', roomy: '6rem' };
// Brand background: text and borders inherit the accent's readable "on" colour instead of the page's greys.
const BRAND = 'bg-[var(--site-accent,var(--ds-action-primary))] text-[var(--site-on-accent,var(--ds-action-on-primary))] [&_.text-ink-secondary]:text-[inherit] [&_.border-line-default]:border-current [&_a]:text-[inherit] [&_a]:underline';

/** Wrapper classes + CSS variables for a section, or null when nothing differs from the default (then no wrapper is rendered at all). */
export function sectionWrap(type: string, raw: unknown): { className: string; vars: Record<string, string> } | null {
  const s = readStyle(raw);
  const hero = type === 'hero';                                   // the hero has its own background (image or accent band): only spacing and alignment apply
  const bg = hero ? 'plain' : s.background;
  if (bg === 'plain' && s.align === 'start' && s.spacing === 'normal') return null;
  const className = [bg === 'tint' ? 'bg-surface-sunken' : bg === 'brand' ? BRAND : '', s.align === 'center' ? 'text-center' : ''].filter(Boolean).join(' ');
  // Variables only when spacing was changed, so every other style leaves each section's own default padding untouched.
  return { className, vars: s.spacing === 'normal' ? {} : { '--sec-py': PY[s.spacing], '--hero-py': HERO_PY[s.spacing] } };
}
