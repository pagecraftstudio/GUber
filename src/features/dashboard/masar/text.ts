import type { Lang } from '@/ds/format';
import { genericErrorText } from '../messages';
import { EXTRA } from '@/components/dashboard/SaveStatus';

/**
 * Strings for the MASAR company screens (journey 2). English follows Appendix C: sentence case, verb-first buttons, no greeting titles.
 * Arabic is a DRAFT for the named reviewer (O1/D10). Trip action strings reuse TRIP_UI; booking cell strings reuse BookingParts TXT,
 * so the wording of existing actions does not drift between the old and new looks.
 */
export const J2 = {
  en: {
    overview: 'Overview', today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday',
    tripsToday: 'Trips today', seatsBookedToday: 'Seats booked today', unpaid: 'Unpaid bookings', unpaidHint: 'Upcoming trips only',
    seatsOf: (a: string, b: string) => `${a} of ${b} seats`,
    nextDepartures: 'Next departures', noDepartures: 'No upcoming trips', noDeparturesText: 'Trips you schedule appear here.', addTrip: 'Add a trip', viewAll: 'View all trips',
    quickLinks: 'Manage', workspace: (n: string) => `${n} workspace`,
    trips: 'Trips', bookings: 'Bookings', regular: 'Regular trips',
    upcoming: 'Upcoming', past: 'Past', all: 'All', period: 'Trip period',
    time: 'Time', route: 'Route', assignment: 'Assignment', seats: 'Seats', status: 'Status', actions: 'Actions', trip: 'Trip',
    noBus: 'No bus', noDriver: 'No driver', goReturn: 'Go and return', returnTrip: 'Return trip',
    noTrips: 'No trips match', noTripsText: 'Try another period or clear the filters.',
    tripsCount: (n: number) => `${n} ${n === 1 ? 'trip' : 'trips'}`, seatsWord: 'seats',
    reference: 'Reference', passenger: 'Passenger', payment: 'Payment', boarding: 'Boarding', action: 'Action', restricted: 'Restricted',
    noBookings: 'No bookings match', noBookingsText: 'Try another period or clear the filters.', allTrips: 'See this trip only',
    search: 'Search', searchPh: 'Reference, name, phone or student ID', apply: 'Apply filters', clear: 'Clear all', remove: 'Remove filter', filters: 'Filters',
    from: 'From', to: 'To', anyRoute: 'All routes', anyBus: 'All buses', anyDriver: 'All drivers', anyStatus: 'All statuses', anySource: 'All sources', anyPay: 'All payments', anyBoarding: 'All boarding',
    sortBy: 'Sort by', sortTripAsc: 'Trip date, earliest first', sortTripDesc: 'Trip date, latest first', sortNew: 'Newest bookings first', sortOld: 'Oldest bookings first',
    quickToday: 'Today', quickTomorrow: 'Tomorrow', quickWeek: 'This week', quickNextWeek: 'Next week',
    sourceRegular: 'Regular', sourceManual: 'One-off', sourceWeb: 'Online', sourceStaff: 'Staff',
    page: 'Pagination', previous: 'Previous', next: 'Next',
    cancelDialogTitle: 'Cancel this booking?', cancelDialogText: 'The seats are released. If the passenger paid, record a refund afterwards.', cancelKeep: 'Keep booking', cancelNow: 'Cancel booking', cancelled: 'Cancelled',
    amount: 'Amount paid', paidInFull: 'Mark paid in full', refund: 'Refund', remaining: 'Remaining',
    noTicket: 'No ticket', boarded: 'Boarded', partBoarded: 'Partly boarded', notBoarded: 'Not boarded',
    tripCancelTitle: 'Cancel this trip?', tripDeleteTitle: 'Delete this draft?',
    saving: 'Saving', saved: 'Saved', error: 'Something went wrong', loadError: 'Could not load this page.', retry: 'Try again',
  },
  ar: {
    overview: 'نظرة عامة', today: 'اليوم', tomorrow: 'غدًا', yesterday: 'أمس',
    tripsToday: 'رحلات اليوم', seatsBookedToday: 'مقاعد محجوزة اليوم', unpaid: 'حجوزات غير مدفوعة', unpaidHint: 'الرحلات القادمة فقط',
    seatsOf: (a: string, b: string) => `${a} من ${b} مقعدًا`,
    nextDepartures: 'الرحلات القادمة', noDepartures: 'لا توجد رحلات قادمة', noDeparturesText: 'الرحلات التي تجدولها تظهر هنا.', addTrip: 'إضافة رحلة', viewAll: 'عرض كل الرحلات',
    quickLinks: 'الإدارة', workspace: (n: string) => `مساحة عمل ${n}`,
    trips: 'الرحلات', bookings: 'الحجوزات', regular: 'الرحلات المتكررة',
    upcoming: 'القادمة', past: 'السابقة', all: 'الكل', period: 'فترة الرحلات',
    time: 'الوقت', route: 'المسار', assignment: 'التعيين', seats: 'المقاعد', status: 'الحالة', actions: 'الإجراءات', trip: 'الرحلة',
    noBus: 'بدون حافلة', noDriver: 'بدون سائق', goReturn: 'ذهاب وعودة', returnTrip: 'رحلة عودة',
    noTrips: 'لا توجد رحلات مطابقة', noTripsText: 'جرّب فترة أخرى أو امسح عوامل التصفية.',
    tripsCount: (n: number) => `${n} ${n === 1 ? 'رحلة' : 'رحلات'}`, seatsWord: 'مقاعد',
    reference: 'المرجع', passenger: 'الراكب', payment: 'الدفع', boarding: 'الصعود', action: 'الإجراء', restricted: 'غير متاح',
    noBookings: 'لا توجد حجوزات مطابقة', noBookingsText: 'جرّب فترة أخرى أو امسح عوامل التصفية.', allTrips: 'عرض هذه الرحلة فقط',
    search: 'بحث', searchPh: 'المرجع أو الاسم أو الهاتف أو الرقم الجامعي', apply: 'تطبيق', clear: 'مسح الكل', remove: 'إزالة عامل التصفية', filters: 'عوامل التصفية',
    from: 'من', to: 'إلى', anyRoute: 'كل المسارات', anyBus: 'كل الحافلات', anyDriver: 'كل السائقين', anyStatus: 'كل الحالات', anySource: 'كل المصادر', anyPay: 'كل المدفوعات', anyBoarding: 'كل حالات الصعود',
    sortBy: 'الترتيب', sortTripAsc: 'تاريخ الرحلة، الأقدم أولًا', sortTripDesc: 'تاريخ الرحلة، الأحدث أولًا', sortNew: 'الأحدث حجزًا أولًا', sortOld: 'الأقدم حجزًا أولًا',
    quickToday: 'اليوم', quickTomorrow: 'غدًا', quickWeek: 'هذا الأسبوع', quickNextWeek: 'الأسبوع القادم',
    sourceRegular: 'متكررة', sourceManual: 'مرة واحدة', sourceWeb: 'عبر الموقع', sourceStaff: 'الموظفون',
    page: 'التنقل بين الصفحات', previous: 'السابق', next: 'التالي',
    cancelDialogTitle: 'إلغاء هذا الحجز؟', cancelDialogText: 'سيتم تحرير المقاعد. إذا دفع الراكب، سجّل الاسترداد بعد ذلك.', cancelKeep: 'إبقاء الحجز', cancelNow: 'إلغاء الحجز', cancelled: 'ملغى',
    amount: 'المبلغ المدفوع', paidInFull: 'تحديد كمدفوع بالكامل', refund: 'استرداد', remaining: 'المتبقي',
    noTicket: 'بدون تذكرة', boarded: 'صعد', partBoarded: 'صعد جزء منهم', notBoarded: 'لم يصعد',
    tripCancelTitle: 'إلغاء هذه الرحلة؟', tripDeleteTitle: 'حذف هذه المسودة؟',
    saving: 'جارٍ الحفظ', saved: 'تم الحفظ', error: 'حدث خطأ ما', loadError: 'تعذّر تحميل هذه الصفحة.', retry: 'حاول مرة أخرى',
  },
} as const;

/** Labels for the ds SaveStatus, reusing the existing error wording (EXTRA codes, then generic). */
export function saveLabels(lang: Lang) {
  return {
    saving: J2[lang].saving,
    saved: J2[lang].saved,
    error: (e: { code: string; detail?: string | undefined }) => (e.detail && EXTRA[e.detail]?.[lang]) || genericErrorText(lang, e.code, e.detail),
  };
}
