import type { Lang } from '@/features/dashboard/messages';
import type { SessionState } from './types';

export const SD: Record<Lang, {
  title: string; intro: string; noServices: string; service: string; date: string; noDay: string; startDay: string; settings: string;
  status: string; bus: string; driver: string; direction: string; station: string; seats: string; run: string; forward: string; backward: string;
  state: Record<SessionState, string>; cancelDay: string; cancelReason: string; cancelHint: string; cancelSubmit: string; dayCancelled: string;
  startTitle: string; startIntro: string; dateHint: string; vehicle: string; addVehicle: string; removeVehicle: string; startStation: string;
  pickBus: string; pickDriver: string; submit: string; replayed: string; started: (n: number) => string; openOverview: string; noBuses: string; noDrivers: string;
}> = {
  en: {
    title: 'Shuttle operations', intro: 'Today’s buses on the shuttle, where each one is and who drives it.', noServices: 'No active shuttle service yet. Set one up in the settings.',
    service: 'Service', date: 'Date', noDay: 'No shuttle day has been started for this date.', startDay: 'Start the day', settings: 'Settings',
    status: 'Day status', bus: 'Bus', driver: 'Driver', direction: 'Direction', station: 'Station', seats: 'Seats', run: 'Run', forward: 'Forward', backward: 'Backward',
    state: { ready: 'Ready', loading: 'Loading', in_transit: 'On the road', arrived: 'Arrived', completed: 'Finished', out_of_service: 'Out of service' },
    cancelDay: 'Cancel this day', cancelReason: 'Reason', cancelHint: 'Only possible while every bus is still ready. It frees the buses and drivers.', cancelSubmit: 'Cancel the day', dayCancelled: 'Day cancelled.',
    startTitle: 'Start the shuttle day', startIntro: 'Pick the buses, their drivers and where each one starts. Seats are sold per run, nothing is booked yet.', dateHint: 'Today, yesterday or tomorrow.',
    vehicle: 'Vehicle', addVehicle: 'Add a bus', removeVehicle: 'Remove', startStation: 'Starts at', pickBus: 'Choose a bus', pickDriver: 'Choose a driver', submit: 'Start the day',
    replayed: 'This day was already started. Showing the existing one.', started: (n) => `Day started with ${n} bus${n === 1 ? '' : 'es'}.`, openOverview: 'Open the overview', noBuses: 'No active buses.', noDrivers: 'No active drivers.',
  },
  ar: {
    title: 'تشغيل الشاتل', intro: 'حافلات الشاتل اليوم، وأين تقف كل واحدة ومن يقودها.', noServices: 'لا توجد خدمة شاتل نشطة بعد. أنشئها من الإعدادات.',
    service: 'الخدمة', date: 'التاريخ', noDay: 'لم يبدأ يوم شاتل لهذا التاريخ.', startDay: 'بدء اليوم', settings: 'الإعدادات',
    status: 'حالة اليوم', bus: 'الحافلة', driver: 'السائق', direction: 'الاتجاه', station: 'المحطة', seats: 'المقاعد', run: 'الدورة', forward: 'للأمام', backward: 'للخلف',
    state: { ready: 'جاهزة', loading: 'تحميل', in_transit: 'على الطريق', arrived: 'وصلت', completed: 'انتهت', out_of_service: 'خارج الخدمة' },
    cancelDay: 'إلغاء هذا اليوم', cancelReason: 'السبب', cancelHint: 'ممكن فقط والحافلات جميعها ما زالت جاهزة. يحرر الحافلات والسائقين.', cancelSubmit: 'إلغاء اليوم', dayCancelled: 'تم إلغاء اليوم.',
    startTitle: 'بدء يوم الشاتل', startIntro: 'اختر الحافلات وسائقيها ومحطة بدء كل واحدة. تُباع المقاعد لكل دورة ولا يوجد حجز بعد.', dateHint: 'اليوم أو أمس أو غداً.',
    vehicle: 'المركبة', addVehicle: 'إضافة حافلة', removeVehicle: 'حذف', startStation: 'تبدأ من', pickBus: 'اختر حافلة', pickDriver: 'اختر سائقاً', submit: 'بدء اليوم',
    replayed: 'هذا اليوم بدأ بالفعل. نعرض اليوم الموجود.', started: (n) => `بدأ اليوم بعدد ${n} من الحافلات.`, openOverview: 'فتح اللوحة', noBuses: 'لا توجد حافلات نشطة.', noDrivers: 'لا يوجد سائقون نشطون.',
  },
};
