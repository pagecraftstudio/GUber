'use client';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate, type Lang } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import type { ScanCard as Card } from '../driverApi';
import { DRIVER_TEXT } from '../driver-text';
import { OTHER_COMPANY_TEXT, UNVERIFIED_TEXT, VERDICT_TEXT } from '../scan-card';

const TONE = { ok: 'success', warn: 'warning', bad: 'error' } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-2"><dt className="text-[13px] text-ink-secondary">{label}</dt><dd className="min-w-0 text-end text-base font-medium break-words text-ink-primary">{children}</dd></div>;
}

/**
 * The one card a scan produces. Colour is decided by the verdict, and the verdict is always written out in Arabic and English, so the card
 * reads correctly without colour. Showing it changes nothing on the server: only "Board now" does, and the server checks everything again.
 */
export function ScanCard({ card, busy, onBoard, onClose, lang = 'en' }: { card: Card; busy: boolean; onBoard: () => void; onClose: () => void; lang?: Lang }) {
  const x = DRIVER_TEXT[lang];
  const v = VERDICT_TEXT[card.verdict];
  const sub = card.subscription, bk = card.booking;
  return (
    <section aria-label={x.scanResult} data-testid="scan-card" data-verdict={card.verdict} className="space-y-3">
      <InlineAlert tone={TONE[v.tone]}>
        <p lang="ar" dir="rtl" className="text-xl font-medium">{v.ar}</p>
        <p lang="en" dir="ltr" className="mt-1 text-base">{v.en}</p>
      </InlineAlert>

      {!card.verified ? <InlineAlert tone="warning"><p lang="ar" dir="rtl" className="font-medium">{UNVERIFIED_TEXT.ar}</p><p lang="en" dir="ltr" className="text-sm">{UNVERIFIED_TEXT.en}</p></InlineAlert> : null}

      {card.student || sub || bk ? (
        <dl className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card px-4">
          {card.student ? <Row label={x.student}>{card.student.name ? <bdi dir="auto">{card.student.name}</bdi> : <span className="text-ink-secondary">–</span>}<span dir="ltr" className="block font-mono text-[13px] tracking-wider text-ink-secondary">{card.student.masar_id}</span></Row> : null}
          {sub ? (
            <Row label={x.subscription}>
              {sub.state === 'valid'
                ? <>{sub.plan_name ? <bdi dir="auto">{sub.plan_name}</bdi> : null}<span className="block text-[13px] font-normal text-ink-secondary tabular-nums">{sub.valid_to ? x.until(sub.valid_to, sub.days_left, lang) : ''}</span></>
                : <>{x.expiredWord}{sub.valid_to ? <span className="block text-[13px] font-normal text-ink-secondary tabular-nums">{formatDate(`${sub.valid_to}T12:00:00Z`, lang, { style: 'long' })}</span> : null}</>}
            </Row>
          ) : null}
          {sub?.state === 'valid' && sub.direction ? <Row label={x.today}>{sub.direction === 'go' ? x.goTrip : x.returnTrip}<span className="block text-[13px] font-normal text-ink-secondary">{x.usage(Boolean(sub.go_used), Boolean(sub.return_used))}</span></Row> : null}
          {!sub && card.has_other_company_subscription ? <Row label={x.subscription}><span lang="ar" dir="rtl" className="block">{OTHER_COMPANY_TEXT.ar}</span><span lang="en" className="block text-[13px] font-normal text-ink-secondary">{OTHER_COMPANY_TEXT.en}</span></Row> : null}
          {bk ? (
            <Row label={x.booking}><span dir="ltr" className="font-mono">{bk.reference}</span><span className="block text-[13px] font-normal text-ink-secondary">{x.seats(bk.seats, lang)}{bk.seats > 1 ? x.seatsBoarded(bk.seats_boarded, lang) : ''} · {x.payment[bk.payment_status] ?? bk.payment_status}{bk.is_subscriber_booking ? ` · ${x.subscriberWord}` : ''}</span></Row>
          ) : null}
        </dl>
      ) : null}

      <div className="flex flex-col gap-2">
        {card.can_board ? <Button size="lg" fullWidth loading={busy} onClick={onBoard} className="!h-14 text-lg">{x.boardNow}</Button> : null}
        <Button size="lg" fullWidth variant="secondary" disabled={busy} onClick={onClose} className="!h-12">{card.can_board ? x.notNow : x.close}</Button>
      </div>
    </section>
  );
}
