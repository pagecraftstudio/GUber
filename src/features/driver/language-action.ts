'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireDriver } from '@/lib/auth/guards';
import { DRIVER_LANG_COOKIE, parseDriverLang } from './lang';

/** Stores the driver's language choice. Signed-in drivers only; the value is whitelisted, never echoed. A preference, not a security setting. */
export async function setDriverLanguageAction(formData: FormData): Promise<void> {
  await requireDriver();
  const raw = formData.get('lang');
  const lang = parseDriverLang(typeof raw === 'string' ? raw : null);
  (await cookies()).set(DRIVER_LANG_COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  revalidatePath('/driver', 'layout');
}
