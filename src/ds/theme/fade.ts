/** Adds `ds-theme-fade` to <html> for one cross-fade (see motion.css). Call just before changing the theme class, never on first load. */
export const THEME_FADE_MS = 260;
export function applyThemeFade(root: HTMLElement = document.documentElement): void {
  root.classList.add('ds-theme-fade');
  setTimeout(() => root.classList.remove('ds-theme-fade'), THEME_FADE_MS);
}
