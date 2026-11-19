import type { ExpiringSubscription } from './types';

/** The ready-to-send WhatsApp text, in the member's own language (profiles.locale). The platform sends nothing: staff open the link and press send. */
export function expiryMessage(s: Pick<ExpiringSubscription, 'memberName' | 'planName' | 'routeName' | 'companyName' | 'validTo' | 'memberLocale'>): string {
  return s.memberLocale === 'en'
    ? `Hello ${s.memberName}, your "${s.planName}" subscription with ${s.companyName} (${s.routeName}) ends on ${s.validTo}. To keep riding without a break, renew it from My subscriptions on MASAR (Renew now). Your new period starts right after the current one ends.`
    : `مرحباً ${s.memberName}، ينتهي اشتراكك "${s.planName}" مع ${s.companyName} (${s.routeName}) بتاريخ ${s.validTo}. لتواصل الركوب دون انقطاع، جدّد اشتراكك من صفحة اشتراكاتي على مسار (جدّد الآن). تبدأ فترتك الجديدة مباشرة بعد انتهاء الحالية.`;
}

/** wa.me wants digits only (country code included). Returns null when the stored phone has no usable digits. */
export function whatsappLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
