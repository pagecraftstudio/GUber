import 'server-only';
import { cookies } from 'next/headers';
import type { Lang } from '@/ds/format';
import { DRIVER_LANG_COOKIE, parseDriverLang } from './lang';

export async function readDriverLang(): Promise<Lang> {
  return parseDriverLang((await cookies()).get(DRIVER_LANG_COOKIE)?.value);
}
