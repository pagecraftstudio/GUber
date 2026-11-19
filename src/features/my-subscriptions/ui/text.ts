/** Member subscription screens. English: sentence case, verb-first buttons. ARABIC IS A DRAFT for the named reviewer (O1/D10). */
const ERR_EN: Record<string, string> = {
  subscription_active: 'You already have an active subscription for this plan', renewal_too_early: 'Renewal opens in the last 7 days of your subscription',
  already_booked_day: 'You already have a seat on this route for that day', subscription_open: 'You already have an open request or an active subscription for this plan',
  subscription_not_valid_on_date: 'Your subscription is not valid on that date', profile_phone_required: 'Add a valid phone number first', trip_full: 'This trip has no seats left',
  phone_taken_in_company: 'This phone number is already used by another account of this company', plan_period_ended: 'This plan has ended', subscription_not_open: 'This subscription can no longer be changed', subscription_not_active: 'This subscription is no longer active',
  rate_limited: 'Too many attempts. Try again in a minute', not_found: 'We could not find that. Refresh the page and try again', invalid_phone: 'Enter a valid phone number',
  validation: 'Check the details and try again', forbidden: 'You cannot do that', unauthenticated: 'Sign in again to continue', trip_not_bookable: 'This trip is not open for booking', trip_departed: 'This trip has already left',
};
const ERR_AR: Record<string, string> = {
  subscription_active: 'لديك اشتراك فعّال لهذه الباقة بالفعل', renewal_too_early: 'يفتح التجديد في آخر ٧ أيام من اشتراكك',
  already_booked_day: 'لديك مقعد بالفعل على هذا المسار في ذلك اليوم', subscription_open: 'لديك طلب مفتوح أو اشتراك فعّال لهذه الباقة', subscription_not_valid_on_date: 'اشتراكك غير صالح في هذا التاريخ',
  profile_phone_required: 'أضف رقم هاتف صالحاً أولاً', trip_full: 'لا توجد مقاعد متاحة في هذه الرحلة', phone_taken_in_company: 'رقم الهاتف مستخدم في حساب آخر لدى هذه الشركة',
  plan_period_ended: 'انتهت فترة هذه الباقة', subscription_not_open: 'لا يمكن تعديل هذا الاشتراك بعد الآن', subscription_not_active: 'هذا الاشتراك لم يعد فعّالاً', rate_limited: 'محاولات كثيرة. حاول بعد دقيقة',
  not_found: 'لم نجد ما طلبته. حدّث الصفحة وحاول مرة أخرى', invalid_phone: 'أدخل رقم هاتف صالحاً', validation: 'راجع البيانات وحاول مرة أخرى', forbidden: 'لا يمكنك تنفيذ ذلك',
  unauthenticated: 'سجّل الدخول مرة أخرى للمتابعة', trip_not_bookable: 'هذه الرحلة غير متاحة للحجز', trip_departed: 'غادرت هذه الرحلة بالفعل',
};
export const errorText = (lang: 'en' | 'ar', code: string, detail?: string): string => {
  const m = lang === 'ar' ? ERR_AR : ERR_EN;
  return m[detail ?? ''] ?? m[code] ?? (lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى' : 'Something went wrong. Try again');
};

export const MT = {
  en: {
    title: 'My subscriptions', back: 'My bookings', plansLink: 'Browse plans', language: 'العربية',
    masarId: 'Your MASAR ID', masarHint: 'Show this ID when you board. It never changes.', copy: 'Copy', copied: 'Copied',
    phoneTitle: 'Add your phone number', phoneText: 'A subscription request needs a phone number the company can reach.', phone: 'Phone', savePhone: 'Save phone',
    none: 'No subscriptions yet', noneText: 'Browse the plans of a company and request one.', 
    status: { pending: 'Pending', active: 'Active', rejected: 'Rejected', cancelled: 'Cancelled', expired: 'Expired' } as Record<string, string>,
    pendingText: 'Waiting for the company to approve it', validity: (a: string, b: string) => `Valid ${a} to ${b}`, cancel: 'Cancel request', cancelSub: 'Cancel subscription',
    book: 'Book a trip', upcoming: 'Upcoming trips', noTrips: 'No upcoming trips', go: 'Go', ret: 'Return', scanned: 'Scanned', subscriber: 'Subscriber', cancelTrip: 'Cancel trip',
    cancelTripNote: 'Cancelling one trip of a round trip cancels both.',
    renew: 'Renew', renewNow: 'Renew now', renewNote: 'Your new period starts after the current one ends.', renewPending: 'Renewal requested. It starts when the current period ends.',
    notices: 'Notices', markRead: 'Mark all as read', newNotice: 'New', noNotices: 'No notices',
    revokedText: 'This subscription was ended by the company. Contact them or request a new one.',
    plansTitle: 'Subscription plans', plansText: 'Choose a plan, then the company approves it. One plan gives you one go and one return scan a day.',
    noPlans: 'No plans available', noPlansText: 'Companies have not published subscription plans yet.', request: 'Request this plan', requested: 'Request sent',
    months: (n: string, unit: string) => `${n} ${unit} from approval`, monthsOne: 'month', monthsMany: 'months', range: (a: string, b: string) => `${a} to ${b}`, signInHint: 'Sign in to request a plan',
    bookTitle: 'Book a trip', bookFor: (p: string) => `With ${p}`, day: 'Day', findTrips: 'Show trips', goTrip: 'Go trip', noGoTrips: 'No trips on that day', seatsLeft: (n: string) => `${n} left`,
    returning: 'Are you returning with this company today?', yes: 'Yes, book my return too', no: 'No, only the go trip', returnTrip: 'Return trip', noReturn: 'No return trips fit that day. Your go trip can still be booked.',
    confirm: 'Confirm booking', booked: 'Booked', bookedText: 'Your seat is reserved and marked as a subscriber booking. No payment is due.', dayFull: 'You already have both seats for this day',
    goBooked: 'Your go seat is already booked for this day', loading: 'Loading', pick: 'Choose a trip', arrive: 'arrives',
  },
  ar: {
    title: 'اشتراكاتي', back: 'حجوزاتي', plansLink: 'تصفّح الباقات', language: 'English',
    masarId: 'رقم مسار الخاص بك', masarHint: 'اعرض هذا الرقم عند الصعود. لا يتغير أبداً.', copy: 'نسخ', copied: 'تم النسخ',
    phoneTitle: 'أضف رقم هاتفك', phoneText: 'طلب الاشتراك يحتاج رقماً تستطيع الشركة التواصل معك عليه.', phone: 'الهاتف', savePhone: 'حفظ الرقم',
    none: 'لا توجد اشتراكات بعد', noneText: 'تصفّح باقات شركة واطلب إحداها.',
    status: { pending: 'قيد المراجعة', active: 'فعّال', rejected: 'مرفوض', cancelled: 'ملغي', expired: 'منتهي' } as Record<string, string>,
    pendingText: 'بانتظار موافقة الشركة', validity: (a: string, b: string) => `صالح من ${a} إلى ${b}`, cancel: 'إلغاء الطلب', cancelSub: 'إلغاء الاشتراك',
    book: 'احجز رحلة', upcoming: 'الرحلات القادمة', noTrips: 'لا توجد رحلات قادمة', go: 'ذهاب', ret: 'عودة', scanned: 'تم المسح', subscriber: 'مشترك', cancelTrip: 'إلغاء الرحلة',
    cancelTripNote: 'إلغاء إحدى رحلتي الذهاب والعودة يلغي الاثنتين.',
    renew: 'تجديد', renewNow: 'جدّد الآن', renewNote: 'تبدأ الفترة الجديدة بعد انتهاء الحالية.', renewPending: 'تم طلب التجديد. يبدأ عند انتهاء الفترة الحالية.',
    notices: 'الإشعارات', markRead: 'تعليم الكل كمقروء', newNotice: 'جديد', noNotices: 'لا توجد إشعارات',
    revokedText: 'أنهت الشركة هذا الاشتراك. تواصل معها أو اطلب اشتراكاً جديداً.',
    plansTitle: 'باقات الاشتراك', plansText: 'اختر باقة ثم توافق عليها الشركة. الباقة تمنحك مسحاً واحداً للذهاب وآخر للعودة يومياً.',
    noPlans: 'لا توجد باقات متاحة', noPlansText: 'لم تنشر الشركات باقات اشتراك بعد.', request: 'اطلب هذه الباقة', requested: 'تم إرسال الطلب',
    months: (n: string, unit: string) => `${n} ${unit} من تاريخ الموافقة`, monthsOne: 'شهر', monthsMany: 'أشهر', range: (a: string, b: string) => `من ${a} إلى ${b}`, signInHint: 'سجّل الدخول لطلب باقة',
    bookTitle: 'احجز رحلة', bookFor: (p: string) => `مع ${p}`, day: 'اليوم', findTrips: 'عرض الرحلات', goTrip: 'رحلة الذهاب', noGoTrips: 'لا توجد رحلات في هذا اليوم', seatsLeft: (n: string) => `متبقي ${n}`,
    returning: 'هل ستعود مع هذه الشركة اليوم؟', yes: 'نعم، احجز العودة أيضاً', no: 'لا، رحلة الذهاب فقط', returnTrip: 'رحلة العودة', noReturn: 'لا توجد رحلات عودة مناسبة في ذلك اليوم. يمكنك حجز الذهاب فقط.',
    confirm: 'تأكيد الحجز', booked: 'تم الحجز', bookedText: 'تم حجز مقعدك وتمييزه كحجز مشترك. لا يوجد مبلغ مستحق.', dayFull: 'لديك المقعدان بالفعل في هذا اليوم',
    goBooked: 'مقعد الذهاب محجوز بالفعل في هذا اليوم', loading: 'جارٍ التحميل', pick: 'اختر رحلة', arrive: 'تصل',
  },
} as const;
