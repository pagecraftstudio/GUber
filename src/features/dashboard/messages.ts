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
  driver_has_login: { en: 'This driver already has a login.', ar: 'هذا السائق لديه حساب دخول بالفعل.' },
  member_has_driver: { en: 'This team member is already linked to a driver record.', ar: 'عضو الفريق هذا مرتبط بسجل سائق بالفعل.' },
  owner_not_driver: { en: 'The company owner cannot be a driver login.', ar: 'لا يمكن أن يكون مالك الشركة حساب سائق.' },
  driver_needs_record: { en: 'A driver login must belong to a driver record. Pick the driver record first.', ar: 'يجب أن يرتبط حساب السائق بسجل سائق. اختر سجل السائق أولاً.' },
  driver_unavailable: { en: 'That driver record is no longer available. Reload the page.', ar: 'سجل السائق لم يعد متاحاً. أعد تحميل الصفحة.' },
  cannot_change_self: { en: 'You cannot change your own role or status.', ar: 'لا يمكنك تغيير دورك أو حالتك بنفسك.' },
  last_owner: { en: 'A company must keep at least one active owner.', ar: 'يجب أن تحتفظ الشركة بمالك نشط واحد على الأقل.' },
  user_already_member: { en: 'This person already belongs to a company.', ar: 'هذا الشخص ينتمي بالفعل إلى شركة.' },
  invite_pending: { en: 'There is already a pending invitation for this email.', ar: 'توجد دعوة معلقة لهذا البريد بالفعل.' },
  rate_limited: { en: 'Too many requests. Wait a moment and try again.', ar: 'طلبات كثيرة. انتظر قليلاً ثم حاول مجدداً.' },
  business_rule: { en: 'This action is not allowed.', ar: 'هذا الإجراء غير مسموح.' },
  internal: { en: 'Something went wrong on our side. Nothing was lost; try again.', ar: 'حدث خطأ من جانبنا. لم يضع شيء، حاول مجدداً.' },
  bus_inactive: { en: 'This bus is not active.', ar: 'هذه الحافلة غير نشطة.' },
  driver_inactive: { en: 'This driver is not active.', ar: 'هذا السائق غير نشط.' },
  seats_exceed_capacity: { en: 'The seats booked are more than the trip capacity.', ar: 'عدد المقاعد المحجوزة أكبر من سعة الرحلة.' },
  bus_and_driver_required: { en: 'Assign a bus and a driver before scheduling this trip.', ar: 'عيّن حافلة وسائقًا قبل جدولة هذه الرحلة.' },
  trip_changed: { en: 'This trip was changed by someone else. Reload the page and try again.', ar: 'تم تغيير هذه الرحلة بواسطة شخص آخر. أعد تحميل الصفحة وحاول مجدداً.' },
  trip_final: { en: 'This trip is already finished or cancelled; it has no next step.', ar: 'هذه الرحلة منتهية أو ملغاة وليس لها خطوة تالية.' },
  trip_departed: { en: 'The departure time has already passed, so the trip cannot be scheduled. Change the departure time first.', ar: 'مر وقت الانطلاق بالفعل فلا يمكن جدولة الرحلة. غيّر وقت الانطلاق أولاً.' },
  trip_not_started: { en: 'The trip cannot be completed before its departure time.', ar: 'لا يمكن إكمال الرحلة قبل وقت انطلاقها.' },
  trip_has_bookings: { en: 'This trip has bookings or booking history, so it cannot be deleted. Cancel it instead.', ar: 'لهذه الرحلة حجوزات أو سجل حجوزات فلا يمكن حذفها. ألغِها بدلاً من ذلك.' },
  trip_not_draft: { en: 'Only a draft trip can be deleted. Cancel it instead.', ar: 'يمكن حذف المسودات فقط. ألغِ الرحلة بدلاً من ذلك.' },
  trip_transition_invalid: { en: 'That status change is not allowed from the current status.', ar: 'تغيير الحالة هذا غير مسموح من الحالة الحالية.' },
  bus_conflict: { en: 'This bus is already on another trip that overlaps this time (a 30 minute turnaround is kept after every trip).', ar: 'هذه الحافلة مخصصة لرحلة أخرى تتداخل مع هذا الوقت (تُحفظ فترة 30 دقيقة بعد كل رحلة).' },
  driver_conflict: { en: 'This driver is already on another trip that overlaps this time (a 30 minute turnaround is kept after every trip).', ar: 'هذا السائق مخصص لرحلة أخرى تتداخل مع هذا الوقت (تُحفظ فترة 30 دقيقة بعد كل رحلة).' },
  trip_failed: { en: 'The trip status could not be changed. Check the trip and try again.', ar: 'تعذر تغيير حالة الرحلة. راجع الرحلة وحاول مرة أخرى.' },
  capacity_exceeds_bus: { en: 'Trip capacity is larger than the bus capacity.', ar: 'سعة الرحلة أكبر من سعة الحافلة.' },
};
export const genericErrorText = (lang: Lang, code: string, detail?: string): string =>
  (detail && GENERIC[detail]?.[lang]) || (detail && STOP_ISSUES[detail]?.[lang]) || GENERIC[code]?.[lang] || GENERIC.internal![lang];

export const TRIP_UI = {
  en: {
    next: { draft: 'Schedule', scheduled: 'Open boarding', boarding: 'Start trip', in_progress: 'Complete trip' },
    final: { completed: 'Completed', cancelled: 'Cancelled' },
    cancel: 'Cancel trip', del: 'Delete', confirmCancel: 'Cancel this trip? Every booking on it will be cancelled too.', confirmDelete: 'Delete this draft permanently?',
    yesCancel: 'Yes, cancel trip', yesDelete: 'Yes, delete', keep: 'Keep', working: 'Working…', actions: 'Trip actions',
    done: { advanced: 'Status updated.', cancelled: 'Trip cancelled.', deleted: 'Trip deleted.' },
    flow: 'Draft → Scheduled → Boarding → On the road → Completed',
  },
  ar: {
    next: { draft: 'جدولة', scheduled: 'فتح الصعود', boarding: 'بدء الرحلة', in_progress: 'إكمال الرحلة' },
    final: { completed: 'مكتملة', cancelled: 'ملغاة' },
    cancel: 'إلغاء الرحلة', del: 'حذف', confirmCancel: 'إلغاء هذه الرحلة؟ ستُلغى كل الحجوزات عليها أيضاً.', confirmDelete: 'حذف هذه المسودة نهائياً؟',
    yesCancel: 'نعم، ألغِ الرحلة', yesDelete: 'نعم، احذف', keep: 'إبقاء', working: 'جارٍ التنفيذ…', actions: 'إجراءات الرحلة',
    done: { advanced: 'تم تحديث الحالة.', cancelled: 'تم إلغاء الرحلة.', deleted: 'تم حذف الرحلة.' },
    flow: 'مسودة ← مجدولة ← صعود ← على الطريق ← مكتملة',
  },
} as const;

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
  en: { addRoute: 'Add a route', editRoute: 'Edit route', name: 'Route name', code: 'Route code', origin: 'Origin', destination: 'Destination', description: 'Description', create: 'Create route', save: 'Save changes', back: 'Back to routes', readOnly: 'You can view this route but not change it.' },
  ar: { addRoute: 'إضافة مسار', editRoute: 'تعديل المسار', name: 'اسم المسار', code: 'رمز المسار', origin: 'نقطة الانطلاق', destination: 'الوجهة', description: 'الوصف', create: 'إنشاء المسار', save: 'حفظ التغييرات', back: 'العودة إلى المسارات', readOnly: 'يمكنك عرض هذا المسار لكن لا يمكنك تغييره.' },
} as const;

export const DRIVER_UI = {
  en: { login: 'Login', none: 'No login yet', linked: (n: string) => `Linked to ${n}`, pending: (d: string) => `Invitation pending (expires ${d})`, invite: 'Invite login', link: 'Link existing member', email: 'Login email', member: 'Team member', pick: 'Select…', send: 'Create invitation', linkBtn: 'Link', inviteFor: (n: string) => `Invite login for ${n}`, linkFor: (n: string) => `Link a team member to ${n}`, suspendedNote: 'login suspended', needRecord: 'Driver record', noRecords: 'Every active driver already has a login or a pending invitation. Add the driver on the Drivers page first.', driverHint: 'Drivers always belong to a driver record, so pick which one this login is for.', linkLink: 'Invitation link (shown once, copy it now)', expires: 'Expires', syncNote: 'Drivers and team members are kept in step: suspending a driver login deactivates the driver record, and changing the role away from Driver unlinks it.' },
  ar: { login: 'حساب الدخول', none: 'لا يوجد حساب بعد', linked: (n: string) => `مرتبط بـ ${n}`, pending: (d: string) => `دعوة معلقة (تنتهي ${d})`, invite: 'دعوة لحساب', link: 'ربط عضو موجود', email: 'بريد الدخول', member: 'عضو الفريق', pick: 'اختر…', send: 'إنشاء دعوة', linkBtn: 'ربط', inviteFor: (n: string) => `دعوة حساب للسائق ${n}`, linkFor: (n: string) => `ربط عضو فريق بالسائق ${n}`, suspendedNote: 'الحساب موقوف', needRecord: 'سجل السائق', noRecords: 'كل سائق نشط لديه حساب أو دعوة معلقة. أضف السائق من صفحة السائقين أولاً.', driverHint: 'الحساب يتبع سجل سائق دائماً، لذا اختر السجل الذي يخصه هذا الحساب.', linkLink: 'رابط الدعوة (يظهر مرة واحدة، انسخه الآن)', expires: 'ينتهي', syncNote: 'السائقون وأعضاء الفريق متزامنون: إيقاف حساب سائق يعطّل سجله، وتغيير الدور بعيداً عن سائق يفك الارتباط.' },
} as const;

export const USER_UI = {
  en: { title: 'Team members', invite: 'Invite a teammate', email: 'Email address', role: 'Role', send: 'Create invitation', members: 'Members', invites: 'Pending invitations', name: 'Name', status: 'Status', actions: 'Actions', save: 'Save role', suspend: 'Suspend', reactivate: 'Reactivate', revoke: 'Revoke', you: 'You', self: 'You cannot change your own role or status.', noInvites: 'No pending invitations.', link: 'Invitation link (shown once, copy it now)', expires: 'Expires', readOnly: 'You can see the team but only the company owner can change it.', active: 'Active', suspended: 'Suspended', roleFor: (n: string) => `Role for ${n}`, saveFor: (n: string) => `Save role for ${n}`, suspendFor: (n: string) => `Suspend ${n}`, reactivateFor: (n: string) => `Reactivate ${n}`, revokeFor: (e: string) => `Revoke invitation for ${e}` },
  ar: { title: 'أعضاء الفريق', invite: 'دعوة زميل', email: 'البريد الإلكتروني', role: 'الدور', send: 'إنشاء دعوة', members: 'الأعضاء', invites: 'الدعوات المعلقة', name: 'الاسم', status: 'الحالة', actions: 'إجراءات', save: 'حفظ الدور', suspend: 'إيقاف', reactivate: 'إعادة تفعيل', revoke: 'إلغاء', you: 'أنت', self: 'لا يمكنك تغيير دورك أو حالتك بنفسك.', noInvites: 'لا توجد دعوات معلقة.', link: 'رابط الدعوة (يظهر مرة واحدة، انسخه الآن)', expires: 'ينتهي', readOnly: 'يمكنك رؤية الفريق لكن مالك الشركة فقط يستطيع تغييره.', active: 'نشط', suspended: 'موقوف', roleFor: (n: string) => `دور ${n}`, saveFor: (n: string) => `حفظ دور ${n}`, suspendFor: (n: string) => `إيقاف ${n}`, reactivateFor: (n: string) => `إعادة تفعيل ${n}`, revokeFor: (e: string) => `إلغاء دعوة ${e}` },
} as const;

export const SETTINGS_UI = {
  en: { company: 'Company profile', companyNote: 'Name, legal details and contact data are managed by the platform team. Ask MALAKY support to change them.', name: 'Name', slug: 'Address name', legalName: 'Legal name', taxNumber: 'Tax number', contactEmail: 'Contact email', contactPhone: 'Contact phone', country: 'Country', status: 'Status',
    booking: 'Booking and operations', readOnly: 'You can view these settings but not change them.', timezone: 'Time zone', timezoneHint: 'An IANA name, for example Africa/Cairo.', currency: 'Currency', currencyHint: 'Three capital letters, for example EGP.', defaultLocale: 'Default language', supportedLocales: 'Supported languages', ar: 'Arabic', en: 'English',
    bookingEnabled: 'Accept online bookings', allowGuestBooking: 'Allow booking without an account', cutoff: 'Booking cut-off (minutes before departure)', cancelWindow: 'Cancellation window (hours before departure)', maxSeats: 'Seats per booking (max)', buffer: 'Turnaround time between trips (minutes)', bufferHint: 'Applies to new trips only.', save: 'Save settings', yes: 'Yes', no: 'No' },
  ar: { company: 'ملف الشركة', companyNote: 'الاسم والبيانات القانونية وبيانات التواصل يديرها فريق المنصة. تواصل مع دعم MALAKY لتغييرها.', name: 'الاسم', slug: 'اسم العنوان', legalName: 'الاسم القانوني', taxNumber: 'الرقم الضريبي', contactEmail: 'البريد الإلكتروني', contactPhone: 'هاتف التواصل', country: 'الدولة', status: 'الحالة',
    booking: 'الحجز والتشغيل', readOnly: 'يمكنك عرض هذه الإعدادات لكن لا يمكنك تغييرها.', timezone: 'المنطقة الزمنية', timezoneHint: 'اسم IANA، مثل Africa/Cairo.', currency: 'العملة', currencyHint: 'ثلاثة أحرف كبيرة، مثل EGP.', defaultLocale: 'اللغة الافتراضية', supportedLocales: 'اللغات المدعومة', ar: 'العربية', en: 'الإنجليزية',
    bookingEnabled: 'قبول الحجز عبر الإنترنت', allowGuestBooking: 'السماح بالحجز بدون حساب', cutoff: 'إغلاق الحجز (دقائق قبل الانطلاق)', cancelWindow: 'مهلة الإلغاء (ساعات قبل الانطلاق)', maxSeats: 'الحد الأقصى للمقاعد في الحجز', buffer: 'الوقت بين الرحلات (دقائق)', bufferHint: 'يسري على الرحلات الجديدة فقط.', save: 'حفظ الإعدادات', yes: 'نعم', no: 'لا' },
} as const;

/** Arabic for page chrome written in English inside server pages (shown by <T>). Anything missing falls back to the English text; a unit test checks the pages' literals are all covered. */
export const PAGE_AR: Record<string, string> = {
  "Login": "حساب الدخول",
  "Actions": "الإجراءات",
  "Fleet operations": "عمليات الأسطول",
  "Fleet management": "إدارة الأسطول",
  "Manage your vehicles, registration details and seating capacity.": "أدر مركباتك وبيانات تسجيلها وسعة المقاعد.",
  "Network management": "إدارة الشبكة",
  "Routes & destinations": "المسارات والوجهات",
  "Scheduling & dispatch": "الجدولة والتشغيل",
  "Trips": "الرحلات",
  "Create trip drafts, assign available resources and manage the trip lifecycle.": "أنشئ مسودات الرحلات وخصص الموارد المتاحة وأدر دورة حياة الرحلة.",
  "People & compliance": "الأفراد والامتثال",
  "Drivers": "السائقون",
  "Keep driver contact details, license records and availability up to date.": "حدّث بيانات تواصل السائقين وسجلات الرخص والتوافر.",
  "Passenger operations": "عمليات الركاب",
  "Bookings": "الحجوزات",
  "Review reservations, passenger details and payment status.": "راجع الحجوزات وبيانات الركاب وحالة الدفع.",
  "Brand presence": "الهوية والحضور",
  "Website settings": "إعدادات الموقع",
  "Configure your operator website identity, brand colours and customer contact details.": "اضبط هوية موقع شركتك وألوان العلامة وبيانات تواصل العملاء.",
  "Operator workspace": "مساحة عمل المشغل",
  "Here is your operations workspace. Choose a module to get started.": "هذه مساحة عمل عملياتك. اختر وحدة للبدء.",
  "Add a route": "إضافة مسار",
  "Name the route, then list its stops in the order the bus visits them.": "سمِّ المسار ثم اذكر محطاته بترتيب مرور الحافلة.",
  "Vehicle": "المركبة",
  "Seats": "المقاعد",
  "Status": "الحالة",
  "Update": "تحديث",
  "Route": "المسار",
  "Origin": "الانطلاق",
  "Destination": "الوجهة",
  "Manage": "إدارة",
  "Phone": "الهاتف",
  "Driver": "السائق",
  "License": "الرخصة",
  "License expiry": "انتهاء الرخصة",
  "Trip": "الرحلة",
  "Departure": "الانطلاق",
  "Assignment": "التخصيص",
  "Transition": "الانتقال",
  "Reference": "المرجع",
  "Passenger": "الراكب",
  "Booking status": "حالة الحجز",
  "Payment": "الدفع",
  "Total": "الإجمالي",
  "Fleet": "الأسطول",
  "Routes": "المسارات",
  "Website": "الموقع",
  "Nothing here yet": "لا يوجد شيء بعد",
  "Records will appear here when you add them.": "ستظهر السجلات هنا عند إضافتها.",
  "Save": "حفظ",
  "Edit": "تعديل",
  "View": "عرض",
  "Active": "نشط",
  "Inactive": "غير نشط",
  "Maintenance": "صيانة",
  "Deactivate": "تعطيل",
  "Activate": "تفعيل",
  "No route code": "بلا رمز",
  "Create and maintain your company's travel corridors and their stops.": "أنشئ ممرات سفر شركتك وحافظ عليها مع محطاتها.",
  "Create a trip draft and assign an available bus and driver.": "أنشئ مسودة رحلة وخصص لها حافلة وسائقاً متاحين.",
  "Customer details and booking history.": "بيانات العميل وسجل حجوزاته.",
  "People who booked with your company. Search by name, phone, email or student number.": "الأشخاص الذين حجزوا لدى شركتك. ابحث بالاسم أو الهاتف أو البريد أو الرقم الجامعي.",
  "People who can sign in to this company, their roles, and pending invitations.": "الأشخاص الذين يمكنهم الدخول إلى هذه الشركة وأدوارهم والدعوات المعلّقة.",
  "Review scheduled trips, assignments and the trip lifecycle.": "راجع الرحلات المجدولة والتخصيصات ودورة حياة الرحلة.",
  "Your company profile and how booking and scheduling behave.": "ملف شركتك وكيفية عمل الحجز والجدولة.",
  "Edit the route and its stops.": "عدّل المسار ومحطاته.",
  "Route details and stops.": "تفاصيل المسار ومحطاته.",
  "This customer has no bookings yet.": "ليس لهذا العميل حجوزات بعد.",
  "No bookings": "لا توجد حجوزات",
  "Try a different name, phone or email.": "جرّب اسماً أو هاتفاً أو بريداً آخر.",
  "Customers appear here after their first booking.": "يظهر العملاء هنا بعد أول حجز لهم.",
  "No matching customers": "لا يوجد عملاء مطابقون",
  "No customers yet": "لا يوجد عملاء بعد",
  "Workspace": "مساحة العمل",
  "Email": "البريد الإلكتروني",
  "Expires": "ينتهي",
  "Name": "الاسم",
  "Role": "الدور",
  "Since": "منذ",
  "University": "الجامعة",
  "Add a trip": "إضافة رحلة",
  "Prices": "الأسعار",
  "All": "الكل",
  "Time": "الوقت",
  "No trips match": "لا توجد رحلات مطابقة",
  "Try another period or clear the filters.": "جرّب فترة أخرى أو امسح عوامل التصفية.",
  "Regular trips": "الرحلات المنتظمة",
  "Regular trip": "رحلة منتظمة",
  "Upcoming": "القادمة",
  "Past": "السابقة",
  "Schedule": "الجدول",
  "Period": "الفترة",
  "No regular trips yet": "لا توجد رحلات منتظمة بعد",
  "Add one above to repeat a trip every week.": "أضف رحلة بالأعلى لتتكرر كل أسبوع.",
  "Trips that repeat on the same days every week. Each one creates normal trips you can book, assign and cancel.": "رحلات تتكرر في نفس الأيام كل أسبوع. كل واحدة تنشئ رحلات عادية يمكنك حجزها وتخصيصها وإلغاءها.",
  "Customers": "العملاء",
  "Settings": "الإعدادات",
  "Team members": "أعضاء الفريق",
  "Back to customers": "العودة إلى العملاء",
  "Back to trips": "العودة إلى الرحلات",
  "Back to routes": "العودة إلى المسارات",
  "Search customers": "ابحث في العملاء",
  "Search": "بحث",
  "Clear search": "مسح البحث",
  "Previous page": "الصفحة السابقة",
  "Next page": "الصفحة التالية",
  "Details": "التفاصيل",
  "Student number": "الرقم الجامعي",
  "Customer since": "عميل منذ",
  "Staff notes": "ملاحظات الموظفين",
  "Members": "الأعضاء",
  "Pending invitations": "الدعوات المعلّقة",
  "No pending invitations.": "لا توجد دعوات معلّقة.",
  "(you)": "(أنت)",
  "Company profile": "ملف الشركة",
  "Name, legal details and contact data are managed by the platform team. Ask MALAKY support to change them.": "الاسم والبيانات القانونية وبيانات التواصل يديرها فريق المنصة. اطلب من دعم MALAKY تغييرها.",
  "Address name": "اسم العنوان",
  "Legal name": "الاسم القانوني",
  "Tax number": "الرقم الضريبي",
  "Contact email": "بريد التواصل",
  "Contact phone": "هاتف التواصل",
  "Country": "الدولة",
  "Booking and operations": "الحجز والعمليات",
  "You can view these settings but not change them.": "يمكنك عرض هذه الإعدادات لكن لا يمكنك تغييرها.",
  "You can see the team, but only the company owner can change it.": "يمكنك رؤية الفريق لكن مالك الشركة وحده يستطيع تغييره.",
  "Time zone": "المنطقة الزمنية",
  "Currency": "العملة",
  "Default language": "اللغة الافتراضية",
  "Supported languages": "اللغات المدعومة",
  "Arabic": "العربية",
  "English": "الإنجليزية",
  "Yes": "نعم",
  "No": "لا",
  "Accept online bookings": "قبول الحجوزات عبر الإنترنت",
  "Allow booking without an account": "السماح بالحجز بدون حساب",
  "Booking cut-off (minutes before departure)": "إغلاق الحجز (دقائق قبل الانطلاق)",
  "Cancellation window (hours before departure)": "مهلة الإلغاء (ساعات قبل الانطلاق)",
  "Seats per booking (max)": "أقصى عدد مقاعد للحجز",
  "Turnaround time between trips (minutes)": "الفاصل بين الرحلات (دقائق)",
  "Create a trip": "إنشاء رحلة",
  "Your workspace": "مساحتك",
  "Your company data is isolated from other operators. Access to each module is controlled by your assigned permissions.": "بيانات شركتك معزولة عن بقية المشغّلين. الوصول إلى كل وحدة تحدده صلاحياتك.",
  "Manage destinations and lines": "إدارة الوجهات والخطوط",
  "Vehicles and capacity": "المركبات والسعة",
  "Driver profiles and licenses": "ملفات السائقين ورخصهم",
  "Schedules and assignments": "الجداول والتخصيصات",
  "Passengers and payments": "الركاب والمدفوعات",
  "Brand and contact settings": "الهوية وإعدادات التواصل",
  "No bus": "بلا حافلة",
  "Restricted": "مقيّد",
  "Customer": "العميل",
  "trial": "تجريبي",
  "active": "نشط",
  "suspended": "موقوف",
  "cancelled": "ملغى",
  "inactive": "غير نشط",
  "scheduled": "مجدولة",
  "confirmed": "مؤكد",
  "paid": "مدفوع",
  "completed": "مكتملة",
  "boarding": "جارٍ الصعود",
  "no show": "لم يحضر",
  "refunded": "مسترد",
  "pending": "معلّق",
  "draft": "مسودة",
  "maintenance": "صيانة",
  "unpaid": "غير مدفوع",
  "partial": "جزئي",
  "departed": "انطلقت",
  "open": "مفتوحة",
  "in progress": "قيد التنفيذ",
  "Previous": "السابق",
  "Next": "التالي",
  "Website identity": "هوية الموقع",
  "Customer contact": "بيانات تواصل العملاء",
  "Website title (English)": "عنوان الموقع (بالإنجليزية)",
  "Website title (Arabic)": "عنوان الموقع (بالعربية)",
  "Primary colour": "اللون الأساسي",
  "Secondary colour": "اللون الثانوي",
  "Footer text (English)": "نص التذييل (بالإنجليزية)",
  "Footer text (Arabic)": "نص التذييل (بالعربية)",
  "Email address": "البريد الإلكتروني",
  "Phone number": "رقم الهاتف",
  "WhatsApp number": "رقم واتساب",
  "Publishing, custom domains, logo uploads and multi-page content editing are separate workflows and are not enabled by this settings form.": "النشر والنطاقات المخصصة ورفع الشعار وتحرير المحتوى متعدد الصفحات مسارات منفصلة وغير مفعّلة في نموذج الإعدادات هذا.",
  "Save website settings": "حفظ إعدادات الموقع",
  "Apply": "تطبيق",
  "No driver": "بلا سائق",
  "Welcome back": "أهلاً بعودتك",
  "Confirmed": "مؤكد",
  "Completed": "مكتمل",
  "No show": "لم يحضر",
  "Unpaid": "غير مدفوع",
  "Partial": "جزئي",
  "Paid": "مدفوع",
  "Refunded": "مسترد",
};
