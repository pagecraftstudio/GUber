/**
 * TypeScript mirror of src/styles/tokens.css (light column) for the design page and tests.
 * tokens.test.ts asserts every value here appears in tokens.css, so the two cannot drift.
 */
export const PRIMITIVES = {
  'green-900': '#0B3D2E',
  'green-800': '#0F4F3B',
  'green-700': '#0A7D56',
  'mint-500': '#14C88A',
  'neutral-000': '#FFFFFF',
  'neutral-025': '#FAFAFA',
  'neutral-050': '#F5F5F5',
  'neutral-100': '#EEEEEE',
  'neutral-200': '#DCDCDC',
  'neutral-300': '#8A8A8A',
  'neutral-500': '#6B6B6B',
  'neutral-700': '#444444',
  'neutral-900': '#171717',
  'neutral-950': '#000000',
} as const;

export const STATUS = {
  success: { fg: '#126C4A', bg: '#E8F5EF' },
  warning: { fg: '#8F5F0F', bg: '#FDF6E7' },
  error: { fg: '#B03535', bg: '#FBEDED' },
  info: { fg: '#2867A6', bg: '#EAF2FA' },
  neutral: { fg: '#444444', bg: '#F5F5F5' },
} as const;

export interface ContrastPair {
  label: string;
  fg: string;
  bg: string;
  /** 'text' needs 4.5, 'non-text' needs 3. */
  kind: 'text' | 'non-text';
}

/** Every pair the system relies on. Appendix A of the plan. The design page renders this table. */
export const REQUIRED_PAIRS: ContrastPair[] = [
  { label: 'Primary text on card', fg: PRIMITIVES['neutral-900'], bg: PRIMITIVES['neutral-000'], kind: 'text' },
  { label: 'Primary text on page', fg: PRIMITIVES['neutral-900'], bg: PRIMITIVES['neutral-025'], kind: 'text' },
  { label: 'Secondary text on card', fg: PRIMITIVES['neutral-700'], bg: PRIMITIVES['neutral-000'], kind: 'text' },
  { label: 'Muted text on card', fg: PRIMITIVES['neutral-500'], bg: PRIMITIVES['neutral-000'], kind: 'text' },
  { label: 'Muted text on sunken', fg: PRIMITIVES['neutral-500'], bg: PRIMITIVES['neutral-050'], kind: 'text' },
  { label: 'Primary button label (white on green-900)', fg: '#FFFFFF', bg: PRIMITIVES['green-900'], kind: 'text' },
  { label: 'Primary button hover (white on green-800)', fg: '#FFFFFF', bg: PRIMITIVES['green-800'], kind: 'text' },
  { label: 'Green text on card (green-700)', fg: PRIMITIVES['green-700'], bg: PRIMITIVES['neutral-000'], kind: 'text' },
  { label: 'Green text on sunken (green-700)', fg: PRIMITIVES['green-700'], bg: PRIMITIVES['neutral-050'], kind: 'text' },
  { label: 'Mint on green-900 (dark surfaces only)', fg: PRIMITIVES['mint-500'], bg: PRIMITIVES['green-900'], kind: 'text' },
  { label: 'Black on mint button', fg: PRIMITIVES['neutral-950'], bg: PRIMITIVES['mint-500'], kind: 'text' },
  { label: 'Control border on card', fg: PRIMITIVES['neutral-300'], bg: PRIMITIVES['neutral-000'], kind: 'non-text' },
  { label: 'Control border on sunken', fg: PRIMITIVES['neutral-300'], bg: PRIMITIVES['neutral-050'], kind: 'non-text' },
  { label: 'Control border on page', fg: PRIMITIVES['neutral-300'], bg: PRIMITIVES['neutral-025'], kind: 'non-text' },
  { label: 'Focus ring on card', fg: PRIMITIVES['green-900'], bg: PRIMITIVES['neutral-000'], kind: 'non-text' },
  ...(Object.entries(STATUS) as [string, { fg: string; bg: string }][]).map(
    ([k, v]): ContrastPair => ({ label: `Status ${k}`, fg: v.fg, bg: v.bg, kind: 'text' }),
  ),
];
