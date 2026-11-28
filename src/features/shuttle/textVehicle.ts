import type { Lang } from '@/features/dashboard/messages';

export const SV: Record<Lang, {
  back: string; driver: string; capacity: string; station: string; run: string; direction: string; dayClosed: string; dayStatus: string; overdue: string; lateFlag: string;
  openLoading: string; startLoading: string; reverseAtEnd: string; closeLoading: string; depart: string; arrive: string; outOfService: string; returnToService: string; endSession: string;
  arrivedLater: string; minutesAgo: string; minutesHint: string; reason: string; reasonHint: string; confirmEnd: string;
  position: string; route: string; visit: string; arrivedAt: string; loadingStarted: string; loadingClosed: string; notYet: string; legTitle: string; noLeg: string; legs: string; from: string; to: string;
  departedAt: string; arrivedAtLeg: string; status: string; events: string; none: string; resumes: (s: string) => string;
  legStatus: Record<'in_transit' | 'arrived' | 'interrupted', string>; kind: Record<string, string>; role: Record<string, string>; ended: string;
}> = {
  en: {
    back: 'Back to the overview', driver: 'Driver', capacity: 'Seats', station: 'Now at', run: 'Run', direction: 'Direction', dayClosed: 'This day is not open, so nothing can be changed.', dayStatus: 'Day',
    overdue: 'This leg is taking more than twice its expected time.', lateFlag: 'Arrival recorded late',
    openLoading: 'Open loading', startLoading: 'Start loading', reverseAtEnd: 'Last station: turn around', closeLoading: 'Close loading', depart: 'Depart', arrive: 'Arrived', outOfService: 'Out of service',
    returnToService: 'Back in service', endSession: 'End for today', arrivedLater: 'It arrived earlier', minutesAgo: 'Minutes ago', minutesHint: 'Leave 0 if it arrived just now.', reason: 'Reason', reasonHint: 'Needed when it arrived more than a minute ago.',
    confirmEnd: 'Ends this bus for the day. It cannot be undone.', position: 'Position', route: 'Route', visit: 'This station', arrivedAt: 'Arrived', loadingStarted: 'Loading started', loadingClosed: 'Loading closed', notYet: 'Not yet',
    legTitle: 'On the road', noLeg: 'Not moving.', legs: 'Legs so far', from: 'From', to: 'To', departedAt: 'Left', arrivedAtLeg: 'Arrived', status: 'Status', events: 'Recent activity', none: 'Nothing yet.',
    resumes: (s) => `Resumes as: ${s}`, ended: 'This bus has finished for the day.',
    legStatus: { in_transit: 'On the road', arrived: 'Arrived', interrupted: 'Interrupted' },
    kind: {
      'session.loading_opened': 'Loading opened', 'session.loading_closed': 'Loading closed', 'leg.departed': 'Departed', 'leg.arrived': 'Arrived', 'run.reversed': 'Turned around',
      'session.out_of_service': 'Out of service', 'session.returned': 'Back in service', 'session.ended': 'Ended for the day', 'session.started': 'Day started for this bus', 'leg.overdue': 'Leg overdue',
    },
    role: { owner: 'Owner', manager: 'Manager', operations: 'Operations', booking: 'Booking', driver: 'Driver', platform: 'Platform', system: 'System' },
  },
  ar: {
    back: 'العودة إلى اللوحة', driver: 'السائق', capacity: 'المقاعد', station: 'الآن في', run: 'الدورة', direction: 'الاتجاه', dayClosed: 'هذا اليوم غير مفتوح لذلك لا يمكن تغيير شيء.', dayStatus: 'اليوم',
    overdue: 'هذه الرحلة تستغرق أكثر من ضعف وقتها المتوقع.', lateFlag: 'تم تسجيل الوصول متأخراً',
    openLoading: 'فتح التحميل', startLoading: 'بدء التحميل', reverseAtEnd: 'المحطة الأخيرة: العودة للاتجاه المعاكس', closeLoading: 'إغلاق التحميل', depart: 'مغادرة', arrive: 'وصلت', outOfService: 'خارج الخدمة',
    returnToService: 'العودة للخدمة', endSession: 'إنهاء لليوم', arrivedLater: 'وصلت قبل ذلك', minutesAgo: 'قبل كم دقيقة', minutesHint: 'اترك 0 إذا وصلت الآن.', reason: 'السبب', reasonHint: 'مطلوب إذا وصلت قبل أكثر من دقيقة.',
    confirmEnd: 'ينهي هذه الحافلة لليوم ولا يمكن التراجع.', position: 'الموضع', route: 'المسار', visit: 'هذه المحطة', arrivedAt: 'وصلت', loadingStarted: 'بدأ التحميل', loadingClosed: 'أُغلق التحميل', notYet: 'ليس بعد',
    legTitle: 'على الطريق', noLeg: 'متوقفة.', legs: 'الرحلات حتى الآن', from: 'من', to: 'إلى', departedAt: 'غادرت', arrivedAtLeg: 'وصلت', status: 'الحالة', events: 'آخر النشاط', none: 'لا شيء بعد.',
    resumes: (s) => `تستأنف كـ: ${s}`, ended: 'انتهت هذه الحافلة لليوم.',
    legStatus: { in_transit: 'على الطريق', arrived: 'وصلت', interrupted: 'متوقفة' },
    kind: {
      'session.loading_opened': 'فُتح التحميل', 'session.loading_closed': 'أُغلق التحميل', 'leg.departed': 'غادرت', 'leg.arrived': 'وصلت', 'run.reversed': 'عادت بالاتجاه المعاكس',
      'session.out_of_service': 'خارج الخدمة', 'session.returned': 'عادت للخدمة', 'session.ended': 'أُنهيت لليوم', 'session.started': 'بدأ اليوم لهذه الحافلة', 'leg.overdue': 'رحلة متأخرة',
    },
    role: { owner: 'المالك', manager: 'المدير', operations: 'العمليات', booking: 'الحجز', driver: 'السائق', platform: 'المنصة', system: 'النظام' },
  },
};
