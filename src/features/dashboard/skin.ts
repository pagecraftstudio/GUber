import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';

/** Class names for the small row actions inside tables (suspend, revoke, invite, pause, generate): real buttons with a border or fill. */
export function useRowActionSkin() {
  return {
    action: buttonClass('secondary', 'md', false, 'h-8 px-3 text-[13px]'),
    main: buttonClass('primary', 'md', false, 'h-8 px-3 text-[13px]'),
    select: `${controlClass(false)} h-8 w-auto text-sm`,
  };
}
