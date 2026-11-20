import type { WebsiteSettings } from './types';
import type { DraftPage, DraftSection } from './pages-types';
import type { PreviewResult } from './preview-service';

/**
 * Which step of the setup wizard the owner is on. DERIVED from the draft, never stored: a reload, a second device or a colleague
 * lands on the same step, and nothing can drift out of sync with the real data. Pure (no I/O), so it is unit-tested exhaustively.
 *
 * Steps: identity (title) -> content (home hero) -> contact (a way to reach the company) -> preview (the draft can be published)
 * -> publish (live). Logo and colours are optional parts of identity and never block a step.
 */
export const WIZARD_STEPS = ['identity', 'content', 'contact', 'preview', 'publish'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export type WizardInput = {
  settings: Pick<WebsiteSettings, 'siteTitle' | 'contactEmail' | 'contactPhone' | 'contactWhatsapp' | 'logoMediaId'>;
  home: DraftPage | null;
  homeSections: DraftSection[];
  draft: PreviewResult;
  isPublished: boolean;
};
export type WizardState = {
  steps: Array<{ key: WizardStep; complete: boolean }>;
  /** First step that still needs the owner, or 'publish' when everything before it is done. */
  current: WizardStep;
  isPublished: boolean;
  /** The database checklist passes: Publish can be pressed. */
  readyToPublish: boolean;
  /** Not blocking; shown as hints on the last step. */
  tips: Array<'no_logo'>;
};

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
const titleOf = (c: Record<string, unknown>): boolean => {
  const t = c.title;
  return !!t && typeof t === 'object' && (filled((t as { en?: unknown }).en) || filled((t as { ar?: unknown }).ar));
};

export function computeWizardState(i: WizardInput): WizardState {
  const identity = filled(i.settings.siteTitle?.en) || filled(i.settings.siteTitle?.ar);
  const hero = i.homeSections.find((s) => s.type === 'hero' && s.isEnabled);
  const content = !!i.home && i.home.isPublished && !!hero && titleOf(hero.content);
  const contact = filled(i.settings.contactEmail) || filled(i.settings.contactPhone) || filled(i.settings.contactWhatsapp);
  const readyToPublish = i.draft.ok;
  const complete: Record<WizardStep, boolean> = { identity, content, contact, preview: readyToPublish && identity && content && contact, publish: i.isPublished };
  const firstOpen = (['identity', 'content', 'contact'] as const).find((k) => !complete[k]);
  const current: WizardStep = firstOpen ?? (i.isPublished ? 'publish' : 'preview');
  return {
    steps: WIZARD_STEPS.map((key) => ({ key, complete: complete[key] })),
    current,
    isPublished: i.isPublished,
    readyToPublish,
    tips: i.settings.logoMediaId ? [] : ['no_logo'],
  };
}
