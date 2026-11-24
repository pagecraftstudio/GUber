import { formatDate, formatDay, formatNumber, formatTime, type Lang } from '@/ds/format';
import type { ScreenErrorCode } from './driverScreensApi';

/**
 * Wording for the driver screens of P7b slice C (Today, Trip manifest, End trip, My profile, Inbox, tab bar), Arabic and English.
 * Same rules as driver-text.ts: Arabic is the default for drivers, dynamic parts are functions that take the language, and every number and date
 * goes through ds/format (Arabic UI = Arabic-Indic digits). Status words (Scheduled, Boarding...) come from ds STATUS_MAP, not from here.
 * Seat plurals reuse DRIVER_TEXT.seats. Arabic wording is UNREVIEWED by a native reviewer (D10/O1): flag before launch.
 */
export interface DriverScreensText {
  nav: { label: string; today: string; boarding: string; inbox: string; profile: string };
  today: {
    title: string; earlier: string; earlierHint: string; todayHeading: string; upcoming: string;
    emptyTitle: string; emptyBody: string; loadErrorTitle: string; retry: string; loading: string; refresh: string; offlineTitle: string; offlineBody: string;
    boardedOf: (boarded: number, expected: number, lang: Lang) => string;
    window: (depIso: string, arrIso: string, lang: Lang) => string;
    openTrip: (from: string, to: string) => string;
  };
  manifest: {
    back: string; passengers: string; noPassengersTitle: string; noPassengersBody: string; loadErrorTitle: string; retry: string; loading: string; refresh: string;
    scan: string; endTrip: string; endBeforeDeparture: string; endUnavailable: string;
    subscriber: string; reference: string; pickup: string; dropoff: string; tripLabel: string;
    boardedOfSeats: (boarded: number, seats: number, lang: Lang) => string;
    summary: (boarded: number, expected: number, lang: Lang) => string;
    confirmTitle: string; confirmYes: string; confirmNo: string;
    confirmBody: (boarded: number, expected: number, lang: Lang) => string;
    confirmRemaining: (remaining: number, lang: Lang) => string;
    doneTitle: string;
    doneBody: (endedIso: string | null, boarded: number | undefined, expected: number | undefined, lang: Lang) => string;
    doneAlready: string;
  };
  profile: {
    title: string; company: string; phone: string; licenseNumber: string; licenseExpiry: string; tripsCompleted: string; notOnFile: string;
    loadErrorTitle: string; retry: string; loading: string;
    expiredTitle: string; soonTitle: string; unknownTitle: string; unknownBody: string;
    expiredBody: (expiryDay: string, daysAgo: number, lang: Lang) => string;
    soonBody: (expiryDay: string, daysLeft: number, lang: Lang) => string;
    okHint: (daysLeft: number, lang: Lang) => string;
    expiryValue: (expiryDay: string, lang: Lang) => string;
  };
  inbox: {
    title: string; empty: string; markAll: string; more: string; loadError: string; retry: string; loading: string; unread: string; from: string; refresh: string;
  };
  errors: Record<ScreenErrorCode, string>;
}

/** Arabic day counts. `after` = the count follows a preposition (منذ / بعد), where the dual is يومين instead of يومان. */
const arDays = (n: number, lang: Lang, after = false): string =>
  n === 1 ? 'يوم واحد' : n === 2 ? (after ? 'يومين' : 'يومان') : `${formatNumber(n, lang)} ${n >= 3 && n <= 10 ? 'أيام' : 'يومًا'}`;
const enDays = (n: number, lang: Lang): string => `${formatNumber(n, lang)} day${n === 1 ? '' : 's'}`;
const stamp = (iso: string, lang: Lang): string => `${formatDate(iso, lang, { style: 'long' })}${lang === 'ar' ? '،' : ','} ${formatTime(iso, lang)}`;

export const DRIVER_SCREENS_TEXT: Record<Lang, DriverScreensText> = {
  en: {
    nav: { label: 'Driver sections', today: 'Today', boarding: 'Boarding', inbox: 'Inbox', profile: 'Profile' },
    today: {
      title: 'Today', earlier: 'Still open', earlierHint: 'These trips are not finished. Open one to end it.', todayHeading: 'Today', upcoming: 'Upcoming',
      emptyTitle: 'No trips are assigned to you right now', emptyBody: 'When your company assigns you a trip it shows up here.',
      loadErrorTitle: 'Could not load your trips', retry: 'Try again', loading: 'Loading your trips', refresh: 'Refresh',
      offlineTitle: 'You are offline', offlineBody: 'The list may be out of date until the signal is back.',
      boardedOf: (b, e, lang) => `${formatNumber(b, lang)} of ${formatNumber(e, lang)} boarded`,
      window: (dep, arr, lang) => `${formatDate(dep, lang, { style: 'long' })}, ${formatTime(dep, lang)} – ${formatTime(arr, lang)}`,
      openTrip: (from, to) => `Open trip ${from} to ${to}`,
    },
    manifest: {
      back: 'Back to today', passengers: 'Passengers', noPassengersTitle: 'No passengers booked', noPassengersBody: 'Confirmed bookings for this trip show up here.',
      loadErrorTitle: 'Could not load this trip', retry: 'Try again', loading: 'Loading the passenger list', refresh: 'Refresh',
      scan: 'Scan passengers', endTrip: 'End trip', endBeforeDeparture: 'You can end the trip after its departure time.', endUnavailable: 'This trip cannot be ended.',
      subscriber: 'Subscriber', reference: 'Booking', pickup: 'Pickup', dropoff: 'Drop-off', tripLabel: 'Trip',
      boardedOfSeats: (b, s, lang) => `${formatNumber(b, lang)} of ${formatNumber(s, lang)} boarded`,
      summary: (b, e, lang) => `${formatNumber(b, lang)} of ${formatNumber(e, lang)} boarded`,
      confirmTitle: 'End this trip?', confirmYes: 'End trip', confirmNo: 'Not yet',
      confirmBody: (b, e, lang) => `${formatNumber(b, lang)} of ${formatNumber(e, lang)} passengers boarded. Ending the trip closes boarding and cannot be undone.`,
      confirmRemaining: (r, lang) => `${formatNumber(r, lang)} passenger${r === 1 ? '' : 's'} not boarded yet.`,
      doneTitle: 'Trip ended',
      doneBody: (at, b, e, lang) => `${at ? `Ended ${stamp(at, lang)}. ` : ''}${typeof b === 'number' && typeof e === 'number' ? `${formatNumber(b, lang)} of ${formatNumber(e, lang)} passengers boarded.` : ''}`.trim(),
      doneAlready: 'This trip was already ended.',
    },
    profile: {
      title: 'My profile', company: 'Company', phone: 'Phone', licenseNumber: 'Licence number', licenseExpiry: 'Licence expiry', tripsCompleted: 'Trips completed', notOnFile: 'Not on file',
      loadErrorTitle: 'Could not load your profile', retry: 'Try again', loading: 'Loading your profile',
      expiredTitle: 'Your licence has expired', soonTitle: 'Your licence expires soon', unknownTitle: 'No licence expiry on file', unknownBody: 'Ask your company to add your licence details.',
      expiredBody: (day, ago, lang) => `It expired on ${formatDay(day, lang)} (${enDays(ago, lang)} ago). Contact your company before your next trip.`,
      soonBody: (day, left, lang) => `It expires on ${formatDay(day, lang)} (${left === 0 ? 'today' : `in ${enDays(left, lang)}`}). Renew it in time.`,
      okHint: (left, lang) => `${enDays(left, lang)} left`,
      expiryValue: (day, lang) => formatDay(day, lang),
    },
    inbox: {
      title: 'Inbox', empty: 'No notifications yet.', markAll: 'Mark all as read', more: 'Show older', loadError: 'Could not load notifications.', retry: 'Try again', loading: 'Loading', unread: 'unread', from: 'From', refresh: 'Refresh',
    },
    errors: {
      not_signed_in: 'Your session has ended. Sign in again.',
      trip_not_found: 'This trip is not assigned to you.',
      driver_not_found: 'Your driver record could not be found. Ask your company.',
      not_started: 'This trip has not started yet.',
      cannot_end: 'This trip cannot be ended.',
      rate_limited: 'Too many requests. Wait a few seconds, then try again.',
      network: 'No connection. Check your signal, then try again.',
      unknown: 'Something went wrong. Try again.',
    },
  },
  ar: {
    nav: { label: 'أقسام السائق', today: 'اليوم', boarding: 'الصعود', inbox: 'الوارد', profile: 'ملفي' },
    today: {
      title: 'اليوم', earlier: 'رحلات لم تنتهِ', earlierHint: 'هذه الرحلات لم تُنهَ بعد. افتح الرحلة لإنهائها.', todayHeading: 'اليوم', upcoming: 'القادمة',
      emptyTitle: 'لا توجد رحلات مسندة إليك الآن', emptyBody: 'عندما تسند إليك الشركة رحلة ستظهر هنا.',
      loadErrorTitle: 'تعذّر تحميل رحلاتك', retry: 'حاول مرة أخرى', loading: 'جارٍ تحميل رحلاتك', refresh: 'تحديث',
      offlineTitle: 'أنت غير متصل', offlineBody: 'قد تكون القائمة قديمة حتى تعود الإشارة.',
      boardedOf: (b, e, lang) => `صعد ${formatNumber(b, lang)} من ${formatNumber(e, lang)}`,
      window: (dep, arr, lang) => `${formatDate(dep, lang, { style: 'long' })}، ${formatTime(dep, lang)} – ${formatTime(arr, lang)}`,
      openTrip: (from, to) => `فتح الرحلة من ${from} إلى ${to}`,
    },
    manifest: {
      back: 'العودة إلى اليوم', passengers: 'الركاب', noPassengersTitle: 'لا يوجد ركاب محجوزون', noPassengersBody: 'تظهر هنا الحجوزات المؤكدة لهذه الرحلة.',
      loadErrorTitle: 'تعذّر تحميل هذه الرحلة', retry: 'حاول مرة أخرى', loading: 'جارٍ تحميل قائمة الركاب', refresh: 'تحديث',
      scan: 'مسح الركاب', endTrip: 'إنهاء الرحلة', endBeforeDeparture: 'يمكنك إنهاء الرحلة بعد موعد انطلاقها.', endUnavailable: 'لا يمكن إنهاء هذه الرحلة.',
      subscriber: 'مشترك', reference: 'الحجز', pickup: 'الصعود من', dropoff: 'النزول في', tripLabel: 'الرحلة',
      boardedOfSeats: (b, s, lang) => `صعد ${formatNumber(b, lang)} من ${formatNumber(s, lang)}`,
      summary: (b, e, lang) => `صعد ${formatNumber(b, lang)} من ${formatNumber(e, lang)}`,
      confirmTitle: 'إنهاء هذه الرحلة؟', confirmYes: 'إنهاء الرحلة', confirmNo: 'ليس الآن',
      confirmBody: (b, e, lang) => `صعد ${formatNumber(b, lang)} من ${formatNumber(e, lang)} راكبًا. إنهاء الرحلة يغلق الصعود ولا يمكن التراجع عنه.`,
      confirmRemaining: (r, lang) => `${r === 1 ? 'راكب واحد لم يصعد بعد' : r === 2 ? 'راكبان لم يصعدا بعد' : `${formatNumber(r, lang)} ${r >= 3 && r <= 10 ? 'ركاب' : 'راكبًا'} لم يصعدوا بعد`}.`,
      doneTitle: 'تم إنهاء الرحلة',
      doneBody: (at, b, e, lang) => `${at ? `أُنهيت في ${stamp(at, lang)}. ` : ''}${typeof b === 'number' && typeof e === 'number' ? `صعد ${formatNumber(b, lang)} من ${formatNumber(e, lang)} راكبًا.` : ''}`.trim(),
      doneAlready: 'تم إنهاء هذه الرحلة من قبل.',
    },
    profile: {
      title: 'ملفي', company: 'الشركة', phone: 'الهاتف', licenseNumber: 'رقم الرخصة', licenseExpiry: 'انتهاء الرخصة', tripsCompleted: 'الرحلات المكتملة', notOnFile: 'غير مسجّل',
      loadErrorTitle: 'تعذّر تحميل ملفك', retry: 'حاول مرة أخرى', loading: 'جارٍ تحميل ملفك',
      expiredTitle: 'رخصتك منتهية', soonTitle: 'رخصتك على وشك الانتهاء', unknownTitle: 'لا يوجد تاريخ انتهاء للرخصة', unknownBody: 'اطلب من شركتك إضافة بيانات رخصتك.',
      expiredBody: (day, ago, lang) => `انتهت في ${formatDay(day, lang)} (منذ ${arDays(ago, lang, true)}). تواصل مع شركتك قبل رحلتك القادمة.`,
      soonBody: (day, left, lang) => `تنتهي في ${formatDay(day, lang)} (${left === 0 ? 'اليوم' : `بعد ${arDays(left, lang, true)}`}). جدّدها في الوقت المناسب.`,
      okHint: (left, lang) => `متبقي ${arDays(left, lang)}`,
      expiryValue: (day, lang) => formatDay(day, lang),
    },
    inbox: {
      title: 'الوارد', empty: 'لا توجد إشعارات بعد.', markAll: 'تحديد الكل كمقروء', more: 'عرض الأقدم', loadError: 'تعذّر تحميل الإشعارات.', retry: 'حاول مرة أخرى', loading: 'جارٍ التحميل', unread: 'غير مقروءة', from: 'من', refresh: 'تحديث',
    },
    errors: {
      not_signed_in: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
      trip_not_found: 'هذه الرحلة غير مسندة إليك.',
      driver_not_found: 'تعذّر العثور على سجل السائق الخاص بك. اسأل شركتك.',
      not_started: 'لم تبدأ هذه الرحلة بعد.',
      cannot_end: 'لا يمكن إنهاء هذه الرحلة.',
      rate_limited: 'طلبات كثيرة. انتظر بضع ثوانٍ ثم حاول مرة أخرى.',
      network: 'لا يوجد اتصال. تحقق من الإشارة ثم حاول مرة أخرى.',
      unknown: 'حدث خطأ ما. حاول مرة أخرى.',
    },
  },
};
