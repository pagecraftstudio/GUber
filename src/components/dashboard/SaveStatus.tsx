'use client';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDashLang } from '@/features/dashboard/lang';
import { FORM_TEXT, genericErrorText } from '@/features/dashboard/messages';
import type { FormState } from '@/features/dashboard/form-state';
import type { AutoResult } from '@/features/dashboard/autosave-actions';

export const EXTRA: Record<string, { en: string; ar: string }> = {
  title_required: { en: 'Add a website name in at least one language.', ar: 'أضف اسم الموقع بلغة واحدة على الأقل.' },
  contact_required: { en: 'Add an email, phone or WhatsApp number.', ar: 'أضف بريدًا إلكترونيًا أو رقم هاتف أو واتساب.' },
  hero_title_required: { en: 'Add a headline for the top banner.', ar: 'أضف عنوانًا للبانر العلوي.' },
  home_page_missing: { en: 'The home page is missing. Reload and try again.', ar: 'الصفحة الرئيسية غير موجودة. أعد التحميل وحاول مرة أخرى.' },
  image_too_large: { en: 'The image is larger than 2 MB.', ar: 'حجم الصورة أكبر من 2 ميجابايت.' },
  image_type_not_supported: { en: 'Use a PNG, JPEG or WebP image.', ar: 'استخدم صورة PNG أو JPEG أو WebP.' },
  invalid_section_content: { en: 'Some content is not allowed (HTML or an unsafe link).', ar: 'بعض المحتوى غير مسموح (HTML أو رابط غير آمن).' },
  subscription_not_active: { en: 'This subscription is no longer active.', ar: 'هذا الاشتراك لم يعد فعّالاً.' },
  revoke_booking_not_cancellable: { en: 'One of the selected bookings can no longer be cancelled. Reload and try again.', ar: 'لم يعد ممكناً إلغاء أحد الحجوزات المحددة. أعد التحميل وحاول مرة أخرى.' },
  amount_exceeds_total: { en: 'More than the booking total.', ar: 'أكثر من إجمالي الحجز.' },
  amount_invalid: { en: 'Enter a valid amount.', ar: 'أدخل مبلغاً صحيحاً.' },
  booking_not_cancellable: { en: 'Cancelled booking: use refund.', ar: 'حجز ملغي: استخدم الاسترداد.' },
  booking_cannot_be_cancelled: { en: 'This booking can no longer be cancelled.', ar: 'لا يمكن إلغاء هذا الحجز بعد الآن.' },
  trip_closed: { en: 'This trip is closed.', ar: 'هذه الرحلة مغلقة.' },
  publish_settings_missing: { en: 'Save the website settings first.', ar: 'احفظ إعدادات الموقع أولًا.' },
  publish_title_required: { en: 'Add a website title in Website settings first.', ar: 'أضف عنوان الموقع في إعدادات الموقع أولًا.' },
  publish_home_page_required: { en: 'The home page must be included when publishing.', ar: 'يجب تضمين الصفحة الرئيسية عند النشر.' },
  publish_home_section_required: { en: 'The home page needs at least one visible section.', ar: 'تحتاج الصفحة الرئيسية إلى قسم واحد ظاهر على الأقل.' },
  publish_too_large: { en: 'The site is too large to publish. Remove some content.', ar: 'الموقع كبير جدًا للنشر. احذف بعض المحتوى.' },
  publish_invalid_content: { en: 'Some content is not allowed (HTML or an unsafe link).', ar: 'بعض المحتوى غير مسموح (HTML أو رابط غير آمن).' },
};

type View = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; code: string; detail?: string };

export const viewOfForm = (s: FormState, pending: boolean): View =>
  pending ? { kind: 'saving' } : s.status === 'success' ? { kind: 'saved' } : s.status === 'error' ? { kind: 'error', code: s.code, ...(s.detail ? { detail: s.detail } : {}) } : { kind: 'idle' };
export const viewOfInline = (r: AutoResult | null, pending: boolean): View =>
  pending ? { kind: 'saving' } : !r ? { kind: 'idle' } : r.ok ? { kind: 'saved' } : { kind: 'error', code: r.code, ...(r.detail ? { detail: r.detail } : {}) };

/** Small live status next to an autosaving control: Saving… / Saved / what went wrong. Always in the DOM so screen readers announce it. */
export function SaveStatus({ view, className = '' }: { view: View; className?: string }) {
  const lang = useDashLang();
  const T = FORM_TEXT[lang];
  const c = { muted: 'text-ink-muted', ok: 'text-status-success-fg', bad: 'text-status-error-fg', wrap: 'text-xs font-medium' };
  let body = null;
  if (view.kind === 'saving') body = <span className={`inline-flex items-center gap-1 ${c.muted}`}><Loader2 size={12} className="animate-spin" aria-hidden="true" />{T.saving}</span>;
  else if (view.kind === 'saved') body = <span className={`inline-flex items-center gap-1 ${c.ok}`}><Check size={12} aria-hidden="true" />{T.saved}</span>;
  else if (view.kind === 'error') body = <span role="alert" className={`inline-flex items-center gap-1 ${c.bad}`}><AlertCircle size={12} aria-hidden="true" />{(view.detail && EXTRA[view.detail]?.[lang]) || genericErrorText(lang, view.code, view.detail)}</span>;
  return <span aria-live="polite" className={`min-h-4 ${c.wrap} ${className}`}>{body}</span>;
}
