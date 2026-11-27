import type { Lang } from '@/features/dashboard/messages';

export const ST: Record<Lang, {
  title: string; intro: string; chooseRoute: string; noRoutes: string; notInPlan: string; notInPlanHint: string;
  serviceTitle: string; name: string; direction: string; forward: string; backward: string; directionHint: string;
  allowReverse: string; ttl: string; ttlHint: string; walkIn: string; maxSeats: string; hub: string; hubNone: string; hubHint: string;
  save: string; create: string; active: string; inactive: string; deactivate: string; activate: string; noService: string; readOnly: string;
  faresTitle: string; faresHint: string; fareFrom: string; fareTo: string; fareEmpty: string; saveFares: string; needTwoStops: string; needService: string; fareFor: (a: string, b: string) => string;
}> = {
  en: {
    title: 'Shuttle settings', intro: 'A continuous shuttle loops through the stations of one route all day. Configure the service and its fares here.',
    chooseRoute: 'Route', noRoutes: 'Create a route with at least two stops first.', notInPlan: 'Shuttle operations are not included in your plan.',
    notInPlanHint: 'Ask the platform team to enable shuttle operations. You can still see the settings below.',
    serviceTitle: 'Shuttle service', name: 'Service name', direction: 'Outbound direction', forward: 'Forward (in stop order)', backward: 'Backward (against stop order)',
    directionHint: 'Which way along the route counts as “outbound”, away from the university. Student plans use it.',
    allowReverse: 'Reverse at the last station and keep running', ttl: 'Request expires after (minutes)', ttlHint: 'An online request is not a seat. It lapses if nobody confirms it in time.',
    walkIn: 'Drivers may add walk-in passengers', maxSeats: 'Seats per request (max)', hub: 'Hub station', hubNone: 'None', hubHint: 'Optional. Usually the university stop.',
    save: 'Save service', create: 'Create service', active: 'Active', inactive: 'Inactive', deactivate: 'Switch off', activate: 'Switch on', noService: 'No shuttle service on this route yet.', readOnly: 'You can view these settings but not change them.',
    faresTitle: 'Fares per pair of stations', faresHint: 'Leave a cell empty for “no fare”. Each direction is priced on its own. Subscribers pay nothing.',
    fareFrom: 'From', fareTo: 'To', fareEmpty: 'No fare', saveFares: 'Save fares', needTwoStops: 'The route needs at least two active stops to set fares.', needService: 'Create the service first, then set fares.',
    fareFor: (a, b) => `Fare from ${a} to ${b}`,
  },
  ar: {
    title: 'إعدادات الشاتل', intro: 'الشاتل المستمر يدور بين محطات مسار واحد طوال اليوم. اضبط الخدمة وأسعارها من هنا.',
    chooseRoute: 'المسار', noRoutes: 'أنشئ أولاً مساراً به محطتان على الأقل.', notInPlan: 'تشغيل الشاتل غير مشمول في باقتك.',
    notInPlanHint: 'اطلب من فريق المنصة تفعيل تشغيل الشاتل. يمكنك مشاهدة الإعدادات أدناه.',
    serviceTitle: 'خدمة الشاتل', name: 'اسم الخدمة', direction: 'اتجاه الذهاب', forward: 'للأمام (بترتيب المحطات)', backward: 'للخلف (عكس ترتيب المحطات)',
    directionHint: 'أي اتجاه على المسار يُعد «ذهاباً» بعيداً عن الجامعة. تعتمد عليه باقات الطلاب.',
    allowReverse: 'العودة عند المحطة الأخيرة ومواصلة التشغيل', ttl: 'ينتهي الطلب بعد (دقائق)', ttlHint: 'الطلب عبر الإنترنت ليس مقعداً محجوزاً. ينتهي إذا لم يؤكده أحد في الوقت المحدد.',
    walkIn: 'يمكن للسائق إضافة ركاب من الموقف', maxSeats: 'أقصى عدد مقاعد في الطلب', hub: 'المحطة الرئيسية', hubNone: 'بدون', hubHint: 'اختياري. غالباً محطة الجامعة.',
    save: 'حفظ الخدمة', create: 'إنشاء الخدمة', active: 'نشطة', inactive: 'متوقفة', deactivate: 'إيقاف', activate: 'تشغيل', noService: 'لا توجد خدمة شاتل على هذا المسار بعد.', readOnly: 'يمكنك عرض هذه الإعدادات لكن لا يمكنك تغييرها.',
    faresTitle: 'الأسعار لكل زوج من المحطات', faresHint: 'اترك الخانة فارغة لعدم وجود سعر. كل اتجاه له سعره. المشتركون لا يدفعون شيئاً.',
    fareFrom: 'من', fareTo: 'إلى', fareEmpty: 'بدون سعر', saveFares: 'حفظ الأسعار', needTwoStops: 'يحتاج المسار إلى محطتين نشطتين على الأقل لضبط الأسعار.', needService: 'أنشئ الخدمة أولاً ثم اضبط الأسعار.',
    fareFor: (a, b) => `سعر الرحلة من ${a} إلى ${b}`,
  },
};
