import { useDsFlipped } from '@/ds/shell/flag';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';

const OLD_LINK = 'min-h-8 text-xs font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300';
const OLD_SELECT = 'rounded-lg border border-slate-300 bg-transparent p-1.5 text-xs dark:border-slate-600';
const OLD_BASE = 'inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-bold';

/**
 * Class names for the small row actions inside tables (suspend, revoke, invite, pause, generate). In the MASAR look they are real
 * buttons with a border or fill, not bare coloured text; otherwise the old classes, unchanged.
 */
export function useRowActionSkin() {
  const flipped = useDsFlipped();
  return flipped
    ? {
        action: buttonClass('secondary', 'md', false, 'h-8 px-3 text-[13px]'),
        main: buttonClass('primary', 'md', false, 'h-8 px-3 text-[13px]'),
        select: `${controlClass(false)} h-8 w-auto text-sm`,
      }
    : {
        action: OLD_LINK,
        main: `${OLD_BASE} bg-blue-700 text-white hover:bg-blue-800`,
        select: OLD_SELECT,
        // TemplateActions' old secondary button
        oldSecondary: `${OLD_BASE} border border-slate-400`,
      };
}
