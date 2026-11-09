import type { Lang } from '../format';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type StatusIcon = 'check' | 'clock' | 'x' | 'minus' | 'dot' | 'live' | 'circle';
export interface StatusDef { tone: StatusTone; icon: StatusIcon; label: { en: string; ar: string } }

/**
 * ONE mapping for every status in the product (plan Appendix B). Keys are the real backend values; nothing is renamed.
 * "Delayed" and "Failed" from the brief have no backend state and are not built.
 * ARABIC LABELS ARE UNREVIEWED (D10, O1 blank) except نشط / متوقف which already shipped in the dashboard.
 */
export const STATUS_MAP = {
  booking: {
    pending: { tone: 'warning', icon: 'clock', label: { en: 'Pending', ar: 'قيد الانتظار' } },
    confirmed: { tone: 'success', icon: 'check', label: { en: 'Confirmed', ar: 'مؤكد' } },
    cancelled: { tone: 'error', icon: 'x', label: { en: 'Cancelled', ar: 'ملغي' } },
    completed: { tone: 'neutral', icon: 'check', label: { en: 'Completed', ar: 'مكتمل' } },
    no_show: { tone: 'warning', icon: 'minus', label: { en: 'No show', ar: 'لم يحضر' } },
  },
  payment: {
    unpaid: { tone: 'warning', icon: 'clock', label: { en: 'Unpaid', ar: 'غير مدفوع' } },
    partial: { tone: 'info', icon: 'circle', label: { en: 'Partly paid', ar: 'مدفوع جزئياً' } },
    paid: { tone: 'success', icon: 'check', label: { en: 'Paid', ar: 'مدفوع' } },
    refunded: { tone: 'neutral', icon: 'minus', label: { en: 'Refunded', ar: 'مسترد' } },
  },
  boarding: {
    not_boarded: { tone: 'neutral', icon: 'circle', label: { en: 'Not boarded', ar: 'لم يصعد' } },
    partial: { tone: 'info', icon: 'circle', label: { en: 'Partly boarded', ar: 'صعد جزء منهم' } },
    boarded: { tone: 'success', icon: 'check', label: { en: 'Boarded', ar: 'صعد' } },
  },
  trip: {
    draft: { tone: 'neutral', icon: 'dot', label: { en: 'Draft', ar: 'مسودة' } },
    scheduled: { tone: 'info', icon: 'clock', label: { en: 'Scheduled', ar: 'مجدولة' } },
    boarding: { tone: 'info', icon: 'live', label: { en: 'Boarding', ar: 'جارٍ الصعود' } },
    in_progress: { tone: 'info', icon: 'circle', label: { en: 'In progress', ar: 'قيد التنفيذ' } },
    completed: { tone: 'success', icon: 'check', label: { en: 'Completed', ar: 'مكتملة' } },
    cancelled: { tone: 'error', icon: 'x', label: { en: 'Cancelled', ar: 'ملغاة' } },
  },
  bus: {
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    maintenance: { tone: 'warning', icon: 'minus', label: { en: 'Maintenance', ar: 'صيانة' } },
    inactive: { tone: 'neutral', icon: 'dot', label: { en: 'Inactive', ar: 'متوقف' } },
  },
  driver: {
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    inactive: { tone: 'neutral', icon: 'dot', label: { en: 'Inactive', ar: 'متوقف' } },
  },
  route: {
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    inactive: { tone: 'neutral', icon: 'dot', label: { en: 'Inactive', ar: 'متوقف' } },
  },
  member: {
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    suspended: { tone: 'error', icon: 'minus', label: { en: 'Suspended', ar: 'موقوف' } },
  },
  company: {
    trial: { tone: 'info', icon: 'clock', label: { en: 'Trial', ar: 'تجريبي' } },
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    suspended: { tone: 'error', icon: 'minus', label: { en: 'Suspended', ar: 'موقوف' } },
    cancelled: { tone: 'error', icon: 'x', label: { en: 'Cancelled', ar: 'ملغي' } },
  },
  subscription: {
    trialing: { tone: 'info', icon: 'clock', label: { en: 'Trialing', ar: 'فترة تجريبية' } },
    active: { tone: 'success', icon: 'check', label: { en: 'Active', ar: 'نشط' } },
    past_due: { tone: 'warning', icon: 'clock', label: { en: 'Past due', ar: 'متأخر السداد' } },
    cancelled: { tone: 'error', icon: 'x', label: { en: 'Cancelled', ar: 'ملغي' } },
    expired: { tone: 'neutral', icon: 'minus', label: { en: 'Expired', ar: 'منتهي' } },
  },
  invite: {
    pending: { tone: 'warning', icon: 'clock', label: { en: 'Pending', ar: 'قيد الانتظار' } },
    accepted: { tone: 'success', icon: 'check', label: { en: 'Accepted', ar: 'مقبولة' } },
    revoked: { tone: 'neutral', icon: 'x', label: { en: 'Revoked', ar: 'ملغاة' } },
    expired: { tone: 'neutral', icon: 'minus', label: { en: 'Expired', ar: 'منتهية' } },
  },
} as const satisfies Record<string, Record<string, StatusDef>>;

export type StatusDomain = keyof typeof STATUS_MAP;
export const statusLabel = (d: StatusDomain, value: string, lang: Lang): string => (STATUS_MAP[d] as Record<string, StatusDef>)[value]?.label[lang] ?? value;
