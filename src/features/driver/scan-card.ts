import type { ScanCard, ScanVerdict } from './driverApi';

/**
 * What the driver reads for each verdict (scan_identity, 0052). Arabic AND English on every line: the driver app is English-only today
 * (item 15 will translate the rest), but the sentence the driver may have to say out loud to a student must work in both languages.
 * `tone` decides the colour; the words must say the same thing, so colour is never the only signal.
 */
export type CardTone = 'ok' | 'warn' | 'bad';
export const VERDICT_TEXT: Record<ScanVerdict, { tone: CardTone; ar: string; en: string }> = {
  ok_not_yet_boarded: { tone: 'ok', ar: 'مسموح بالركوب', en: 'Allowed to board' },
  ok_boarded: { tone: 'warn', ar: 'صعد بالفعل في هذه الرحلة', en: 'Already boarded on this trip' },
  already_scanned: { tone: 'warn', ar: 'استخدم هذا الاتجاه اليوم بالفعل', en: 'Already travelled in this direction today' },
  no_booking: { tone: 'bad', ar: 'مشترك، لكن لا يوجد حجز له في هذه الرحلة', en: 'Subscriber, but no seat booked on this trip' },
  no_subscription: { tone: 'bad', ar: 'لا يوجد اشتراك ساري مع هذه الشركة', en: 'No active subscription with this company' },
  expired: { tone: 'bad', ar: 'الاشتراك منتهٍ', en: 'Subscription expired' },
  wrong_trip: { tone: 'bad', ar: 'هذه التذكرة لرحلة أخرى', en: 'This ticket is for another trip' },
  cancelled: { tone: 'bad', ar: 'الحجز ملغى', en: 'Booking cancelled' },
  not_confirmed: { tone: 'bad', ar: 'الحجز غير مؤكد بعد', en: 'Booking not confirmed yet' },
  qr_expired: { tone: 'warn', ar: 'انتهت صلاحية الرمز. اطلب من الطالب فتحه من جديد', en: 'QR expired. Ask the student to reopen it' },
};
export const UNVERIFIED_TEXT = { ar: 'غير موثّق: اطلب إثبات هوية', en: 'Unverified: ask for a photo ID' };
export const OTHER_COMPANY_TEXT = { ar: 'لديه اشتراك مع شركة أخرى فقط', en: 'Subscribed with another company only' };

export const PAYMENT_TEXT: Record<string, string> = { paid: 'Paid', unpaid: 'Unpaid', partial: 'Part paid', refunded: 'Refunded' };

/** One line the driver can act on, from the card alone (also what tests assert). */
export const cardHeadline = (c: ScanCard) => VERDICT_TEXT[c.verdict];
