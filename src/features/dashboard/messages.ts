import type { Allowance, UsageKey } from '@/features/subscriptions/usage';

/** All dashboard-form wording that must exist in both languages. Pure: no React, no server code. */
export type Lang = 'en' | 'ar';

const RES: Record<UsageKey, Record<Lang, { name: string; short: string }>> = {
  max_users: { en: { name: 'team members', short: 'team member' }, ar: { name: 'أعضاء الفريق', short: 'عضو فريق' } },
  max_buses: { en: { name: 'buses', short: 'bus' }, ar: { name: 'الحافلات', short: 'حافلة' } },
  max_drivers: { en: { name: 'drivers', short: 'driver' }, ar: { name: 'السائقين', short: 'سائق' } },
  max_routes: { en: { name: 'routes', short: 'route' }, ar: { name: 'المسارات', short: 'مسار' } },
  max_trips_per_month: { en: { name: 'trips this month', short: 'trip' }, ar: { name: 'الرحلات هذا الشهر', short: 'رحلة' } },
};
export const isUsageKey = (v: string | undefined): v is UsageKey => !!v && v in RES;

const NEXT = {
  en: 'Ask the company owner to upgrade the plan, or contact MALAKY Studio support. You can also free up room by removing or deactivating items you no longer need.',
  ar: 'اطلب من مالك الشركة ترقية الباقة أو تواصل مع دعم MALAKY Studio. يمكنك أيضاً توفير مساحة بإزالة العناصر غير المستخدمة أو تعطيلها.',
};

export type Tone = 'info' | 'warning' | 'error';
export type Notice = { tone: Tone; title: string; body?: string };

/** What a form shows ABOVE the fields for the allowance it was given. `null` = say nothing (no misleading numbers). */
export function allowanceNotice(lang: Lang, key: UsageKey, a: Allowance): Notice | null {
  const r = RES[key][lang];
  if (a.state === 'unavailable') return null;
  if (a.state === 'no_subscription')
    return lang === 'ar'
      ? { tone: 'error', title: 'لا يوجد اشتراك فعّال', body: 'انتهى اشتراك الشركة أو أُوقف، لذلك لا يمكن إضافة عناصر جديدة الآن. ' + NEXT.ar }
      : { tone: 'error', title: 'No active subscription', body: 'The company subscription has ended or been paused, so nothing new can be added right now. ' + NEXT.en };
  if (a.limit === null) return null; // unlimited: nothing useful to say
  if (a.used === null) return { tone: 'info', title: lang === 'ar' ? `حد الباقة: ${a.limit} ${r.name}` : `Your plan allows ${a.limit} ${r.name}.` };
  if (a.reached)
    return lang === 'ar'
      ? { tone: 'error', title: `وصلت إلى حد الباقة (${a.used} من ${a.limit} ${r.name})`, body: NEXT.ar }
      : { tone: 'error', title: `Plan limit reached: ${a.used} of ${a.limit} ${r.name} used`, body: NEXT.en };
  const left = a.remaining ?? 0;
  const low = left <= 1 || left / a.limit <= 0.2;
  return lang === 'ar'
    ? { tone: low ? 'warning' : 'info', title: `استخدمت ${a.used} من ${a.limit} ${r.name}`, body: `المتبقي: ${left}.` }
    : { tone: low ? 'warning' : 'info', title: `${a.used} of ${a.limit} ${r.name} used`, body: `${left} left on your plan.` };
}

/** The backend refused with a plan limit (53400). `key` is the limit the trigger named, if known. */
export function backendLimitNotice(lang: Lang, key: string | undefined, fresh?: Allowance): Notice {
  const r = isUsageKey(key) ? RES[key][lang] : null;
  const fromFresh = isUsageKey(key) && fresh ? allowanceNotice(lang, key, fresh) : null;
  if (lang === 'ar')
    return { tone: 'error', title: r ? `لم يتم الحفظ: وصلت إلى حد ${r.name} في باقتك` : 'لم يتم الحفظ: وصلت إلى حد الباقة', body: (fromFresh ? fromFresh.title + '. ' : '') + NEXT.ar };
  return { tone: 'error', title: r ? `Not saved: your plan's limit for ${r.name} was reached` : 'Not saved: your plan limit was reached', body: (fromFresh ? fromFresh.title + '. ' : '') + NEXT.en };
}

const STOP_ISSUES: Record<string, Record<Lang, string>> = {
  stops_min_two: { en: 'Add at least two stops.', ar: 'أضف محطتين على الأقل.' },
  stops_too_many: { en: 'A route can have at most 200 stops.', ar: 'الحد الأقصى للمحطات في المسار 200.' },
  stop_name_invalid: { en: 'Enter a stop name of 2 to 120 characters.', ar: 'أدخل اسم محطة من 2 إلى 120 حرفاً.' },
  stop_name_duplicate: { en: 'This name is already used by another stop on the route.', ar: 'هذا الاسم مستخدم في محطة أخرى بالمسار.' },
  stop_address_invalid: { en: 'The address is too long (300 characters at most).', ar: 'العنوان طويل جداً (300 حرف كحد أقصى).' },
  stop_coords_invalid: { en: 'Give both latitude (-90 to 90) and longitude (-180 to 180), or leave both empty.', ar: 'أدخل خط العرض (-90 إلى 90) وخط الطول (-180 إلى 180) معاً أو اتركهما فارغين.' },
  stop_offset_invalid: { en: 'Minutes after departure must be a whole number from 0 to 32767.', ar: 'الدقائق بعد الانطلاق يجب أن تكون عدداً صحيحاً من 0 إلى 32767.' },
  stop_offset_order: { en: 'Minutes cannot be lower than the stop before it.', ar: 'الدقائق لا يمكن أن تقل عن المحطة التي قبلها.' },
  stops_min_two_active: { en: 'At least two stops must be active.', ar: 'يجب أن تكون محطتان على الأقل نشطتين.' },
  stops_need_pickup_and_dropoff: { en: 'Active stops need at least one pick-up and one drop-off.', ar: 'تحتاج المحطات النشطة إلى محطة صعود واحدة ومحطة نزول واحدة على الأقل.' },
  stop_unknown_id: { en: 'A stop no longer exists. Reload the page and try again.', ar: 'لم تعد إحدى المحطات موجودة. أعد تحميل الصفحة وحاول مجدداً.' },
  stop_has_bookings: { en: 'A stop that has bookings cannot be removed. Mark it inactive instead.', ar: 'لا يمكن حذف محطة لديها حجوزات. عطّلها بدلاً من ذلك.' },
  stops_not_a_list: { en: 'The stop list is not valid. Reload the page and try again.', ar: 'قائمة المحطات غير صالحة. أعد تحميل الصفحة وحاول مجدداً.' },
  stop_invalid: { en: 'A stop is not valid. Reload the page and try again.', ar: 'إحدى المحطات غير صالحة. أعد تحميل الصفحة وحاول مجدداً.' },
};
export const stopIssueText = (lang: Lang, code: string): string => STOP_ISSUES[code]?.[lang] ?? (lang === 'ar' ? 'قيمة غير صالحة.' : 'This value is not valid.');

const GENERIC: Record<string, Record<Lang, string>> = {
  forbidden: { en: 'You do not have permission to do this.', ar: 'ليست لديك صلاحية للقيام بذلك.' },
  unauthenticated: { en: 'Your session has ended. Sign in again.', ar: 'انتهت جلستك. سجّل الدخول مجدداً.' },
  not_found: { en: 'This item no longer exists. Reload the page.', ar: 'لم يعد هذا العنصر موجوداً. أعد تحميل الصفحة.' },
  validation: { en: 'Some of the information is not valid. Check the highlighted fields.', ar: 'بعض المعلومات غير صالحة. راجع الحقول المحددة.' },
  conflict: { en: 'This conflicts with existing data.', ar: 'هذا يتعارض مع بيانات موجودة.' },
  plate_number_taken: { en: 'A bus with this plate number already exists.', ar: 'توجد حافلة بنفس رقم اللوحة.' },
  route_code_taken: { en: 'Another route already uses this code.', ar: 'مسار آخر يستخدم هذا الرمز.' },
  rate_limited: { en: 'Too many requests. Wait a moment and try again.', ar: 'طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً.' },
  business_rule: { en: 'This action is not allowed.', ar: 'هذا الإجراء غير مسموح.' },
  internal: { en: 'Something went wrong on our side. Nothing was lost; try again.', ar: 'حدث خطأ من جانبنا. لم يضع شيء، حاول مجدداً.' },
  bus_conflict: { en: 'This bus is already assigned to an overlapping trip.', ar: 'هذه الحافلة مخصصة لرحلة متداخلة.' },
  driver_conflict: { en: 'This driver is already assigned to an overlapping trip.', ar: 'هذا السائق مخصص لرحلة متداخلة.' },
  bus_inactive: { en: 'This bus is not active.', ar: 'هذه الحافلة غير نشطة.' },
  driver_inactive: { en: 'This driver is not active.', ar: 'هذا السائق غير نشط.' },
  capacity_exceeds_bus: { en: 'Trip capacity is larger than the bus capacity.', ar: 'سعة الرحلة أكبر من سعة الحافلة.' },
};
export const genericErrorText = (lang: Lang, code: string, detail?: string): string =>
  (detail && GENERIC[detail]?.[lang]) || (detail && STOP_ISSUES[detail]?.[lang]) || GENERIC[code]?.[lang] || GENERIC.internal![lang];

export const FORM_TEXT = {
  en: { saved: 'Saved.', created: 'Created.', saving: 'Saving…', fixErrors: (n: number) => `${n} ${n === 1 ? 'problem needs' : 'problems need'} fixing before you can save.`, limitBlocked: 'Adding is paused until the plan limit is resolved.' },
  ar: { saved: 'تم الحفظ.', created: 'تم الإنشاء.', saving: 'جارٍ الحفظ…', fixErrors: (n: number) => `هناك ${n} ${n === 1 ? 'مشكلة' : 'مشاكل'} يجب إصلاحها قبل الحفظ.`, limitBlocked: 'الإضافة متوقفة حتى تُحل مشكلة حد الباقة.' },
} as const;

export const fieldErrorText = (lang: Lang, code: string): string =>
  code === 'taken' ? (lang === 'ar' ? 'مستخدم بالفعل.' : 'Already in use.') : lang === 'ar' ? 'قيمة غير صالحة.' : 'This value is not valid.';

export const LABELS = {
  en: {
    addBus: 'Add a vehicle', addDriver: 'Add a driver', plate: 'Plate number', busName: 'Name', seats: 'Seats', make: 'Make', model: 'Model', addBusBtn: 'Add vehicle',
    fullName: 'Full name', phone: 'Phone', license: 'License number', licenseExpiry: 'License expiry', addDriverBtn: 'Add driver',
    required: 'Fields marked * are required.',
  },
  ar: {
    addBus: 'إضافة مركبة', addDriver: 'إضافة سائق', plate: 'رقم اللوحة', busName: 'الاسم', seats: 'المقاعد', make: 'الصانع', model: 'الطراز', addBusBtn: 'إضافة مركبة',
    fullName: 'الاسم الكامل', phone: 'الهاتف', license: 'رقم الرخصة', licenseExpiry: 'انتهاء الرخصة', addDriverBtn: 'إضافة سائق',
    required: 'الحقول المميزة بـ * مطلوبة.',
  },
} as const;

export const STOP_UI = {
  en: {
    title: 'Stops', help: 'List the stops in the order the bus visits them. Minutes are counted from departure and cannot go down along the route.',
    add: 'Add stop', empty: 'No stops yet. Add the first stop of this route.', stop: (i: number, n: number) => `Stop ${i} of ${n}`,
    name: 'Stop name', address: 'Address', type: 'Stop type', both: 'Pick-up and drop-off', pickup: 'Pick-up only', dropoff: 'Drop-off only',
    offset: 'Minutes after departure', lat: 'Latitude', lng: 'Longitude', coordsHint: 'Optional. Give both or neither.', active: 'Active (shown to customers)',
    up: (n: string) => `Move ${n} up`, down: (n: string) => `Move ${n} down`, remove: (n: string) => `Remove ${n}`, unnamed: 'unnamed stop',
    moved: (n: string, p: number, t: number) => `${n} moved to position ${p} of ${t}.`, removed: (n: string, t: number) => `${n} removed. ${t} stops left. Save to apply.`, added: (p: number) => `Stop added at position ${p}.`,
    list: 'Route stops',
  },
  ar: {
    title: 'المحطات', help: 'اذكر المحطات بالترتيب الذي تمر به الحافلة. تُحسب الدقائق من لحظة الانطلاق ولا يجوز أن تنقص على امتداد المسار.',
    add: 'إضافة محطة', empty: 'لا توجد محطات بعد. أضف أول محطة في هذا المسار.', stop: (i: number, n: number) => `المحطة ${i} من ${n}`,
    name: 'اسم المحطة', address: 'العنوان', type: 'نوع المحطة', both: 'صعود ونزول', pickup: 'صعود فقط', dropoff: 'نزول فقط',
    offset: 'الدقائق بعد الانطلاق', lat: 'خط العرض', lng: 'خط الطول', coordsHint: 'اختياري. أدخلهما معاً أو اتركهما فارغين.', active: 'نشطة (تظهر للعملاء)',
    up: (n: string) => `نقل ${n} للأعلى`, down: (n: string) => `نقل ${n} للأسفل`, remove: (n: string) => `إزالة ${n}`, unnamed: 'محطة بلا اسم',
    moved: (n: string, p: number, t: number) => `نُقلت ${n} إلى الموضع ${p} من ${t}.`, removed: (n: string, t: number) => `أُزيلت ${n}. المتبقي ${t} محطات. احفظ للتطبيق.`, added: (p: number) => `أُضيفت محطة في الموضع ${p}.`,
    list: 'محطات المسار',
  },
} as const;

export const ROUTE_UI = {
  en: { addRoute: 'Add a route', editRoute: 'Edit route', name: 'Route name', code: 'Route code', origin: 'Origin', destination: 'Destination', description: 'Description', create: 'Create route', save: 'Save changes', back: 'Back to routes', readOnly: 'You can view this route but not change it.', stopsNotSaved: 'The route was created but its stops could not be saved. Add them here and save.' },
  ar: { addRoute: 'إضافة مسار', editRoute: 'تعديل المسار', name: 'اسم المسار', code: 'رمز المسار', origin: 'نقطة الانطلاق', destination: 'الوجهة', description: 'الوصف', create: 'إنشاء المسار', save: 'حفظ التغييرات', back: 'العودة إلى المسارات', readOnly: 'يمكنك عرض هذا المسار لكن لا يمكنك تغييره.', stopsNotSaved: 'أُنشئ المسار لكن تعذّر حفظ محطاته. أضفها هنا ثم احفظ.' },
} as const;
