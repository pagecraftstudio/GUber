export type AnalyticsLocale = 'ar' | 'en';

/** Arabic is Egyptian colloquial by project rule. Keep AR/EN keys identical (parity test enforces it). */
export const ANALYTICS_COPY = {
  ar: {
    bannerTitle: 'خصوصيتك تهمنا',
    bannerBody:
      'عايزين نسجّل إزاي بتستخدم الموقع، زي الصفحات اللي بتفتحها وبتدوّر على إيه، عشان نحسّن الرحلات والخدمة. مش هنسجّل حاجة غير لو وافقت، وتقدر تغيّر رأيك في أي وقت.',
    accept: 'موافق',
    reject: 'لأ، شكرًا',
    learnMore: 'اقرا سياسة الخصوصية',
    privacyHref: '/privacy',
    settingsTitle: 'اختيارك دلوقتي',
    stateGranted: 'انت موافق على تسجيل استخدامك للموقع.',
    stateDenied: 'انت رافض تسجيل استخدامك للموقع.',
    stateUnset: 'لسه ماختارتش.',
    changeToGranted: 'وافق',
    changeToDenied: 'سحب الموافقة ومسح بياناتي',
    saved: 'اتحفظ اختيارك.',
    failed: 'حصلت مشكلة. جرّب تاني بعد شوية.',
  },
  en: {
    bannerTitle: 'Your privacy matters',
    bannerBody:
      'We would like to record how you use the site, such as the pages you open and what you search for, so we can improve trips and service. We record nothing unless you agree, and you can change your mind at any time.',
    accept: 'Agree',
    reject: 'No, thanks',
    learnMore: 'Read the privacy notice',
    privacyHref: '/privacy',
    settingsTitle: 'Your choice right now',
    stateGranted: 'You agreed to usage recording.',
    stateDenied: 'You declined usage recording.',
    stateUnset: 'You have not chosen yet.',
    changeToGranted: 'Agree',
    changeToDenied: 'Withdraw and delete my data',
    saved: 'Your choice was saved.',
    failed: 'Something went wrong. Please try again shortly.',
  },
} as const satisfies Record<AnalyticsLocale, Record<string, string>>;
