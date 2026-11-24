import { formatDate, formatNumber, formatPercent, formatTime, type Lang } from '@/ds/format';
import type { BoardErrorCode } from './driverApi';

/**
 * ALL driver-app wording, Arabic and English, in one place (plan item 15, D17: Arabic default for drivers, English toggle).
 * Dynamic parts are functions that take the language, so numbers and dates always go through ds/format (Arabic UI = Arabic-Indic digits).
 * The scan-card verdict sentences stay in scan-card.ts (both languages shown on purpose); they are the same strings the dashboard uses.
 * Arabic wording is UNREVIEWED by a native reviewer (same status as the shell chrome, D10/O1): flag before launch.
 */
export interface DriverText {
  title: string; offlineTitle: string; offlineBody: string; loadErrorTitle: string; retry: string; loadingTrips: string;
  emptyTitle: string; emptyBody: string; assignedTrips: string; selectedTrip: string; progress: string;
  expected: string; boarded: string; remaining: string;
  manualLabel: string; manualPlaceholder: string; checkPassenger: string; stopCamera: string; scanCamera: string; cameraUnavailable: string;
  scanResult: string; student: string; subscription: string; booking: string; today: string; boardNow: string; notNow: string; close: string;
  expiredWord: string; goTrip: string; returnTrip: string; subscriberWord: string;
  language: string; switchTo: string;
  figures: (boarded: number, expected: number, lang: Lang) => string;
  until: (iso: string, daysLeft: number | undefined, lang: Lang) => string;
  usage: (goUsed: boolean, returnUsed: boolean) => string;
  seats: (n: number, lang: Lang) => string;
  seatsBoarded: (n: number, lang: Lang) => string;
  payment: Record<string, string>;
  boardedOk: (who: string) => string;
  alreadyBoarded: (who: string, atIso: string, lang: Lang) => string;
  ticketNo: (n: number, lang: Lang) => string;
  subscriberDirection: (dir: 'go' | 'return') => string;
}

const arSeats = (n: number, lang: Lang) => `${formatNumber(n, lang)} ${n === 1 ? 'مقعد' : n === 2 ? 'مقعدان' : n >= 3 && n <= 10 ? 'مقاعد' : 'مقعدًا'}`;
const stamp = (iso: string, lang: Lang) => `${formatDate(iso, lang, { style: 'long' })}, ${formatTime(iso, lang)}`;

export const DRIVER_TEXT: Record<Lang, DriverText> = {
  en: {
    title: 'Boarding', offlineTitle: 'You are offline', offlineBody: 'Boarding needs a connection. Scans are not saved until the signal is back.',
    loadErrorTitle: 'Could not load your trips', retry: 'Try again', loadingTrips: 'Loading your trips',
    emptyTitle: 'No trips are assigned to you right now', emptyBody: 'When your company assigns you a trip it shows up here.',
    assignedTrips: 'Assigned trips', selectedTrip: 'Selected trip', progress: 'Boarding progress',
    expected: 'Expected', boarded: 'Boarded', remaining: 'Remaining',
    manualLabel: 'Or enter the ticket code or MASAR ID', manualPlaceholder: 'MALAKY:TICKET:… or MSR-XXXX-XXXX', checkPassenger: 'Check passenger',
    stopCamera: 'Stop camera', scanCamera: 'Scan QR with camera', cameraUnavailable: 'Camera unavailable. Allow camera access, or type the code below.',
    scanResult: 'Scan result', student: 'Student', subscription: 'Subscription', booking: 'Booking', today: 'Today', boardNow: 'Board now', notNow: 'Not now', close: 'Close',
    expiredWord: 'Expired', goTrip: 'Go trip', returnTrip: 'Return trip', subscriberWord: 'Subscriber',
    language: 'Language', switchTo: 'العربية',
    figures: (b, e, lang) => `${formatNumber(b, lang)} of ${formatNumber(e, lang)} (${formatPercent(e > 0 ? b / e : 0, lang)})`,
    until: (iso, d, lang) => `Until ${formatDate(`${iso}T12:00:00Z`, lang, { style: 'long' })}${typeof d === 'number' ? ` (${formatNumber(d, lang)} days left)` : ''}`,
    usage: (g, r) => `Go ${g ? 'used' : 'not used'} · Return ${r ? 'used' : 'not used'}`,
    seats: (n, lang) => `${formatNumber(n, lang)} seat${n === 1 ? '' : 's'}`,
    seatsBoarded: (n, lang) => `, ${formatNumber(n, lang)} boarded`,
    payment: { paid: 'Paid', unpaid: 'Unpaid', partial: 'Part paid', refunded: 'Refunded' },
    boardedOk: (who) => `Boarded:${who}`,
    alreadyBoarded: (who, at, lang) => `Already boarded (${who.trim()}, ${stamp(at, lang)})`,
    ticketNo: (n, lang) => ` ticket ${formatNumber(n, lang)}`,
    subscriberDirection: (d) => `Subscriber, ${d}`,
  },
  ar: {
    title: 'الصعود', offlineTitle: 'أنت غير متصل', offlineBody: 'الصعود يحتاج إلى اتصال. لا يتم حفظ المسح حتى تعود الإشارة.',
    loadErrorTitle: 'تعذّر تحميل رحلاتك', retry: 'حاول مرة أخرى', loadingTrips: 'جارٍ تحميل رحلاتك',
    emptyTitle: 'لا توجد رحلات مسندة إليك الآن', emptyBody: 'عندما تسند إليك الشركة رحلة ستظهر هنا.',
    assignedTrips: 'الرحلات المسندة', selectedTrip: 'الرحلة المختارة', progress: 'تقدّم الصعود',
    expected: 'المتوقع', boarded: 'صعدوا', remaining: 'المتبقي',
    manualLabel: 'أو أدخل رمز التذكرة أو رقم MASAR ID', manualPlaceholder: 'MALAKY:TICKET:… أو MSR-XXXX-XXXX', checkPassenger: 'تحقق من الراكب',
    stopCamera: 'إيقاف الكاميرا', scanCamera: 'مسح رمز QR بالكاميرا', cameraUnavailable: 'الكاميرا غير متاحة. اسمح بالوصول إلى الكاميرا أو اكتب الرمز بالأسفل.',
    scanResult: 'نتيجة المسح', student: 'الطالب', subscription: 'الاشتراك', booking: 'الحجز', today: 'اليوم', boardNow: 'تأكيد الصعود', notNow: 'ليس الآن', close: 'إغلاق',
    expiredWord: 'منتهٍ', goTrip: 'رحلة الذهاب', returnTrip: 'رحلة العودة', subscriberWord: 'مشترك',
    language: 'اللغة', switchTo: 'English',
    figures: (b, e, lang) => `${formatNumber(b, lang)} من ${formatNumber(e, lang)} (${formatPercent(e > 0 ? b / e : 0, lang)})`,
    until: (iso, d, lang) => `حتى ${formatDate(`${iso}T12:00:00Z`, lang, { style: 'long' })}${typeof d === 'number' ? ` (متبقي ${formatNumber(d, lang)} يوم)` : ''}`,
    usage: (g, r) => `الذهاب: ${g ? 'مستخدم' : 'غير مستخدم'} · العودة: ${r ? 'مستخدم' : 'غير مستخدم'}`,
    seats: arSeats,
    seatsBoarded: (n, lang) => `، صعد ${formatNumber(n, lang)}`,
    payment: { paid: 'مدفوع', unpaid: 'غير مدفوع', partial: 'مدفوع جزئياً', refunded: 'مسترد' },
    boardedOk: (who) => `تم الصعود:${who}`,
    alreadyBoarded: (who, at, lang) => `صعد بالفعل (${who.trim()}، ${stamp(at, lang)})`,
    ticketNo: (n, lang) => ` تذكرة ${formatNumber(n, lang)}`,
    subscriberDirection: (d) => `مشترك، ${d === 'go' ? 'ذهاب' : 'عودة'}`,
  },
};

/** The English wording is the one driverApi.BOARD_MESSAGES already ships (and its tests pin); only Arabic is new here. */
const AR_BOARD: Record<BoardErrorCode, string> = {
  not_signed_in: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
  trip_not_found: 'هذه الرحلة غير مسندة إليك.',
  invalid_code: 'الرمز غير معروف. اطلب من الراكب فتح رمز QR أو التذكرة من جديد ثم امسحه مرة أخرى.',
  invalid_ticket: 'تذكرة غير صالحة. اطلب من الراكب فتح تذكرته من جديد ثم حاول مرة أخرى.',
  wrong_trip: 'هذه التذكرة لرحلة أخرى.',
  cancelled: 'تم إلغاء هذه التذكرة.',
  boarding_closed: 'تم إغلاق الصعود لهذه الرحلة.',
  subscription_invalid: 'هذا الاشتراك غير ساري اليوم. اطلب من الراكب مراجعة الشركة.',
  already_scanned: 'سافر هذا المشترك في هذا الاتجاه اليوم بالفعل.',
  no_subscription: 'لا يوجد اشتراك ساري لهذا الرقم (MASAR ID).',
  no_booking: 'لا يوجد حجز لهذا المشترك في هذه الرحلة.',
  not_open: 'لم يُفتح الصعود لهذه الرحلة بعد.',
  rate_limited: 'المسح سريع جدًا. انتظر بضع ثوانٍ ثم تابع.',
  network: 'لا يوجد اتصال. تحقق من الإشارة ثم حاول مرة أخرى. لم يتم تسجيل هذا المسح.',
  unknown: 'حدث خطأ ما. حاول مرة أخرى.',
};
export const arBoardMessages = AR_BOARD;
