/** Strings for the subscription report (Phase E2). ARABIC IS A DRAFT for the named reviewer. */
export const RP = {
  en: {
    title: 'Subscription report', text: 'How subscriptions are used. Dates are in your company time zone.',
    from: 'From', to: 'To', apply: 'Show report', invalidRange: 'Choose a valid range of up to 366 days',
    byPlan: 'By plan', plan: 'Plan', route: 'Route', activeNow: 'Active now', pendingNow: 'Pending now', newInRange: 'New in range', revenue: 'Revenue',
    noPlans: 'No plans yet', archived: 'Archived',
    daily: 'By day', day: 'Day', goScans: 'Go scans', returnScans: 'Return scans', goBooked: 'Go booked', returnBooked: 'Return booked', noShows: 'No-shows', noDays: 'No subscriber trips in this range',
    demand: 'Next 7 days', demandText: 'Seats subscribers hold on upcoming trips, and how many said they return the same day.', trip: 'Trip', departs: 'Departs', seatsLeft: 'Seats left', subSeats: 'Subscriber seats', returning: 'Returning today', noDemand: 'No upcoming trips with subscribers',
    definitions: 'How these numbers are counted', back: 'Back to requests',
    defs: [
      'Revenue: price of subscriptions approved in the range, counted when approved, not refunded on revoke.',
      'Active now: subscriptions valid today. Pending now: requests waiting for a decision.',
      'Scans: one boarding per direction per day. Booked: subscriber bookings on trips that day.',
      'No-show: a subscriber booking that was never boarded after the trip departed.',
      'Returning today: subscribers who chose to return the same day on that trip.',
    ],
  },
  ar: {
    title: 'تقرير الاشتراكات', text: 'كيف تُستخدم الاشتراكات. التواريخ بتوقيت شركتك.',
    from: 'من', to: 'إلى', apply: 'عرض التقرير', invalidRange: 'اختر نطاقاً صحيحاً لا يزيد عن ٣٦٦ يوماً',
    byPlan: 'حسب الباقة', plan: 'الباقة', route: 'المسار', activeNow: 'فعّالة الآن', pendingNow: 'قيد المراجعة', newInRange: 'جديدة في النطاق', revenue: 'الإيراد',
    noPlans: 'لا توجد باقات بعد', archived: 'مؤرشفة',
    daily: 'حسب اليوم', day: 'اليوم', goScans: 'مسح الذهاب', returnScans: 'مسح العودة', goBooked: 'حجوزات الذهاب', returnBooked: 'حجوزات العودة', noShows: 'لم يحضروا', noDays: 'لا توجد رحلات مشتركين في هذا النطاق',
    demand: 'الأيام السبعة القادمة', demandText: 'المقاعد التي يحجزها المشتركون في الرحلات القادمة وعدد من اختار العودة في نفس اليوم.', trip: 'الرحلة', departs: 'المغادرة', seatsLeft: 'المقاعد المتاحة', subSeats: 'مقاعد المشتركين', returning: 'عائدون اليوم', noDemand: 'لا توجد رحلات قادمة بها مشتركون',
    definitions: 'كيف تُحتسب الأرقام', back: 'العودة إلى الطلبات',
    defs: [
      'الإيراد: سعر الاشتراكات المعتمدة في النطاق، يُحتسب عند الموافقة ولا يُخصم عند الإنهاء.',
      'فعّالة الآن: اشتراكات سارية اليوم. قيد المراجعة: طلبات بانتظار القرار.',
      'المسح: صعود واحد لكل اتجاه في اليوم. الحجوزات: حجوزات المشتركين في رحلات ذلك اليوم.',
      'لم يحضر: حجز مشترك لم يصعد صاحبه بعد مغادرة الرحلة.',
      'عائدون اليوم: مشتركون اختاروا العودة في نفس اليوم على هذه الرحلة.',
    ],
  },
} as const;
