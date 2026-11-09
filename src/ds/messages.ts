/**
 * Built-in chrome strings of the design system. Contextual text always comes from the caller as props.
 * ARABIC BELOW IS UNREVIEWED: D10 requires the named Arabic copy reviewer (O1, still blank) to approve it before release.
 */
import type { Lang } from './format';

export interface DsText {
  close: string; loading: string; retry: string; copy: string; copied: string; saving: string; saved: string;
  previous: string; next: string; page: (n: string, total: string) => string; pagination: string;
  clearAll: string; remove: (what: string) => string; cancel: string; confirm: string; chooseFile: string; noFile: string;
  breadcrumb: string; required: string; sortedAsc: string; sortedDesc: string; selectRow: string; selectAll: string;
  errorTitle: string; errorBody: string; notifications: string; seatsOf: (a: string, b: string) => string; booked: string; boarded: string;
}

export const DS_TEXT: Record<Lang, DsText> = {
  en: {
    close: 'Close', loading: 'Loading', retry: 'Try again', copy: 'Copy', copied: 'Copied', saving: 'Saving', saved: 'Saved',
    previous: 'Previous', next: 'Next', page: (n, t) => `Page ${n} of ${t}`, pagination: 'Pagination',
    clearAll: 'Clear all', remove: (w) => `Remove filter: ${w}`, cancel: 'Cancel', confirm: 'Confirm', chooseFile: 'Choose file', noFile: 'No file chosen',
    breadcrumb: 'Breadcrumb', required: 'required', sortedAsc: 'sorted ascending', sortedDesc: 'sorted descending', selectRow: 'Select row', selectAll: 'Select all rows',
    errorTitle: 'Something went wrong', errorBody: 'The page could not be loaded. Try again.', notifications: 'Notifications',
    seatsOf: (a, b) => `${a} of ${b} seats`, booked: 'Booked', boarded: 'Boarded',
  },
  ar: {
    close: 'إغلاق', loading: 'جارٍ التحميل', retry: 'حاول مرة أخرى', copy: 'نسخ', copied: 'تم النسخ', saving: 'جارٍ الحفظ', saved: 'تم الحفظ',
    previous: 'السابق', next: 'التالي', page: (n, t) => `الصفحة ${n} من ${t}`, pagination: 'التنقل بين الصفحات',
    clearAll: 'مسح الكل', remove: (w) => `إزالة عامل التصفية: ${w}`, cancel: 'إلغاء', confirm: 'تأكيد', chooseFile: 'اختيار ملف', noFile: 'لم يتم اختيار ملف',
    breadcrumb: 'مسار التنقل', required: 'مطلوب', sortedAsc: 'مرتب تصاعدياً', sortedDesc: 'مرتب تنازلياً', selectRow: 'تحديد الصف', selectAll: 'تحديد كل الصفوف',
    errorTitle: 'حدث خطأ ما', errorBody: 'تعذر تحميل الصفحة. حاول مرة أخرى.', notifications: 'الإشعارات',
    seatsOf: (a, b) => `${a} من ${b} مقعد`, booked: 'محجوز', boarded: 'صعد',
  },
};
