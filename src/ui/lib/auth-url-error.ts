/**
 * Messages for the `?error=` codes the server redirects the customer login to (/auth/confirm).
 * ONLY allow-listed codes map to text; anything else in the URL is ignored, never rendered.
 * Arabic is Egyptian colloquial, matching the rest of the customer UI.
 */
const MESSAGES = {
  google_failed: {
    en: 'Google sign-in did not complete. Please try again, or sign in with your email and password.',
    ar: 'تسجيل الدخول بجوجل ماكملش. جرّب تاني، أو سجّل دخول بالإيميل والباسورد.',
  },
  google_not_allowed: {
    en: 'Google sign-in is for passenger accounts only. Staff and drivers sign in with email and password.',
    ar: 'الدخول بجوجل للركّاب بس. الموظفين والسواقين بيدخلوا بالإيميل والباسورد.',
  },
  confirm_failed: {
    en: 'This link is invalid or has expired. Please request a new one.',
    ar: 'اللينك ده مش صالح أو انتهت صلاحيته. اطلب لينك جديد.',
  },
} as const;

export function authUrlError(search: string, locale: 'en' | 'ar'): string | null {
  const code = new URLSearchParams(search).get('error');
  if (!code || !Object.hasOwn(MESSAGES, code)) return null;
  return MESSAGES[code as keyof typeof MESSAGES][locale];
}
