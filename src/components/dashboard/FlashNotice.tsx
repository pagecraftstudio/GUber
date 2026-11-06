'use client';
import { useSearchParams } from 'next/navigation';
import { useDashLang } from '@/features/dashboard/lang';
import { genericErrorText, ROUTE_UI } from '@/features/dashboard/messages';
import { NoticeBox } from './FormParts';

/** Shows the result of a redirect (`?error=` / `?notice=`) that used to be dropped silently. Only fixed codes are mapped; the query text is never echoed. */
export function FlashNotice() {
  const lang = useDashLang();
  const q = useSearchParams();
  const error = q.get('error');
  const notice = q.get('notice');
  if (error === 'forbidden') return <div className="mb-5"><NoticeBox role="alert" notice={{ tone: 'error', title: genericErrorText(lang, 'forbidden') }} /></div>;
  if (error === 'stops_not_saved') return <div className="mb-5"><NoticeBox role="alert" notice={{ tone: 'warning', title: ROUTE_UI[lang].stopsNotSaved }} /></div>;
  if (notice === 'created' || notice === 'updated' || notice === 'draft_created' || notice === 'saved')
    return <div className="mb-5"><NoticeBox role="status" notice={{ tone: 'info', title: lang === 'ar' ? 'تم الحفظ.' : 'Saved.' }} /></div>;
  return null;
}
