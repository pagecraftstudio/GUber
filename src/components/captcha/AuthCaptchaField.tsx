'use client';
import type { AuthCaptchaAction } from '@/lib/captcha/auth-captcha';
import { useAuthCaptcha } from './useAuthCaptcha';

/** For server-action forms (operator sign-in, password reset, invite sign-up): the widget plus a hidden `captchaToken` input. Renders nothing while captcha is off. */
export function AuthCaptchaField({ action, lang = 'en' }: { action: AuthCaptchaAction; lang?: 'en' | 'ar' }) {
  const c = useAuthCaptcha(action, lang);
  if (!c.on) return null;
  if (c.misconfigured) return <p role="alert" className="text-sm font-medium text-status-error-fg">Security check is not configured. Contact the platform administrator.</p>;
  return (<>{c.widget}<input type="hidden" name="captchaToken" value={c.token ?? ''} /></>);
}
