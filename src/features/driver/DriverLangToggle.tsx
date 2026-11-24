import type { Lang } from '@/ds/format';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { DRIVER_TEXT } from './driver-text';
import { setDriverLanguageAction } from './language-action';

/** A plain form: works without JavaScript, 44px target, labelled in the language you would switch TO (so it can be read by someone who cannot read the current one). */
export function DriverLangToggle({ lang }: { lang: Lang }) {
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  return (
    <form action={setDriverLanguageAction}>
      <input type="hidden" name="lang" value={other} />
      <button type="submit" lang={other} aria-label={`${DRIVER_TEXT[lang].language}: ${DRIVER_TEXT[lang].switchTo}`}
        className={cx('inline-flex min-h-11 min-w-11 items-center justify-center rounded-ds-md border border-line-default bg-surface-card px-3 text-sm font-medium text-ink-primary hover:bg-surface-sunken', FOCUS)}>
        {DRIVER_TEXT[lang].switchTo}
      </button>
    </form>
  );
}
