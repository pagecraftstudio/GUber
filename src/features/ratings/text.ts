import { formatDate, formatNumber, type Lang } from '@/ds/format';

/** Wording for the rating UI, Arabic and English. Numbers and dates go through ds/format. Arabic is UNREVIEWED by a native reviewer (D10/O1). */
export const RATING_TEXT = {
  en: {
    title: 'Rate your trips', hint: 'Your rating is anonymous to the driver and the company.', trip: 'The trip', driver: 'The driver', send: 'Send rating', sending: 'Sending',
    thanks: 'Thanks, your rating was saved.', notYet: (iso: string, lang: Lang) => `Opens ${formatDate(iso, lang, { style: 'long' })}`,
    closes: (iso: string, lang: Lang) => `Rate by ${formatDate(iso, lang, { style: 'long' })}`, stars: (n: number) => `${n} ${n === 1 ? 'star' : 'stars'} out of 5`,
    langName: 'العربية', captcha: 'Complete the check to send your rating.', captchaMissing: 'The check is not available right now. Try again later.',
    errors: {
      not_boarded: 'Only passengers who boarded can rate this trip.', not_open: 'Rating opens an hour after the trip ends.', closed: 'The rating period for this trip has ended.',
      not_rateable: 'This trip cannot be rated.', already_rated: 'You already rated this trip.', invalid_stars: 'Choose 1 to 5 stars for both.',
      captcha: 'The check failed. Try again.', network: 'Could not send. Check your connection and try again.', unknown: 'Something went wrong. Try again.',
    },
    company: { newLabel: 'New', count: (n: number, lang: Lang) => `${formatNumber(n, lang)} ${n === 1 ? 'rating' : 'ratings'}`, aria: (avg: number, lang: Lang) => `Rated ${formatNumber(avg, lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} out of 5` },
  },
  ar: {
    title: 'قيّم رحلاتك', hint: 'تقييمك مجهول الهوية للسائق وللشركة.', trip: 'الرحلة', driver: 'السائق', send: 'أرسل التقييم', sending: 'جارٍ الإرسال',
    thanks: 'شكراً، تم حفظ تقييمك.', notYet: (iso: string, lang: Lang) => `يُفتح ${formatDate(iso, lang, { style: 'long' })}`,
    closes: (iso: string, lang: Lang) => `قيّم قبل ${formatDate(iso, lang, { style: 'long' })}`, stars: (n: number) => `${n} من 5 نجوم`,
    langName: 'English', captcha: 'أكمل التحقق لإرسال تقييمك.', captchaMissing: 'التحقق غير متاح الآن. حاول لاحقاً.',
    errors: {
      not_boarded: 'يمكن فقط للركاب الذين صعدوا تقييم هذه الرحلة.', not_open: 'يُفتح التقييم بعد ساعة من انتهاء الرحلة.', closed: 'انتهت فترة تقييم هذه الرحلة.',
      not_rateable: 'لا يمكن تقييم هذه الرحلة.', already_rated: 'قيّمت هذه الرحلة من قبل.', invalid_stars: 'اختر من 1 إلى 5 نجوم للاثنين.',
      captcha: 'فشل التحقق. حاول مرة أخرى.', network: 'تعذّر الإرسال. تحقق من الاتصال وحاول مرة أخرى.', unknown: 'حدث خطأ. حاول مرة أخرى.',
    },
    company: { newLabel: 'جديدة', count: (n: number, lang: Lang) => `${formatNumber(n, lang)} تقييم`, aria: (avg: number, lang: Lang) => `التقييم ${formatNumber(avg, lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} من 5` },
  },
} as const;
export type RatingText = (typeof RATING_TEXT)[Lang];
export type RatingErrorKey = keyof RatingText['errors'];

/** Server error detail -> message key. */
export function ratingErrorKey(code: string, detail?: string): RatingErrorKey {
  switch (detail) {
    case 'rating_not_boarded': return 'not_boarded';
    case 'rating_not_open': return 'not_open';
    case 'rating_closed': return 'closed';
    case 'rating_not_rateable': return 'not_rateable';
    case 'already_rated': return 'already_rated';
    case 'invalid_stars': return 'invalid_stars';
    case 'captcha_required': case 'captcha_invalid': case 'captcha_unavailable': return 'captcha';
  }
  return code === 'network' ? 'network' : 'unknown';
}
