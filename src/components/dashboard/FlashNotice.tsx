'use client';
import { useSearchParams } from 'next/navigation';
import { useDashLang } from '@/features/dashboard/lang';
import { genericErrorText } from '@/features/dashboard/messages';
import { NoticeBox } from './FormParts';

const TRIP_ERRORS = ['bus_conflict', 'driver_conflict', 'bus_inactive', 'driver_inactive', 'capacity_exceeds_bus', 'seats_exceed_capacity', 'bus_and_driver_required', 'trip_failed'];

/** Shows the result of a redirect (`?error=` / `?notice=`) that used to be dropped silently. Only fixed codes are mapped; the query text is never echoed. */
export function FlashNotice() {
  const lang = useDashLang();
  const q = useSearchParams();
  const error = q.get('error');
  const notice = q.get('notice');
  if (error === 'forbidden') return <div className="mb-5"><NoticeBox role="alert" notice={{ tone: 'error', title: genericErrorText(lang, 'forbidden') }} /></div>;
  if (error && TRIP_ERRORS.includes(error)) return <div className="mb-5"><NoticeBox role="alert" notice={{ tone: 'error', title: genericErrorText(lang, 'business_rule', error) }} /></div>;
  if (notice === 'created' || notice === 'updated' || notice === 'draft_created' || notice === 'saved')
    return <div className="mb-5"><NoticeBox role="status" notice={{ tone: 'info', title: lang === 'ar' ? 'تم الحفظ.' : 'Saved.' }} /></div>;
  return null;
}
