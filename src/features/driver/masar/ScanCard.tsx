'use client';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { formatDate } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import type { ScanCard as Card } from '../driverApi';
import { OTHER_COMPANY_TEXT, PAYMENT_TEXT, UNVERIFIED_TEXT, VERDICT_TEXT } from '../scan-card';

const TONE = { ok: 'success', warn: 'warning', bad: 'error' } as const;
const day = (iso: string) => formatDate(`${iso}T12:00:00Z`, 'en', { style: 'long' });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3 py-2"><dt className="text-[13px] text-ink-secondary">{label}</dt><dd className="min-w-0 text-end text-base font-medium break-words text-ink-primary">{children}</dd></div>;
}

/**
 * The one card a scan produces. Colour is decided by the verdict, and the verdict is always written out in Arabic and English, so the card
 * reads correctly without colour. Showing it changes nothing on the server: only "Board now" does, and the server checks everything again.
 */
export function ScanCard({ card, busy, onBoard, onClose }: { card: Card; busy: boolean; onBoard: () => void; onClose: () => void }) {
  const v = VERDICT_TEXT[card.verdict];
  const sub = card.subscription, bk = card.booking;
  return (
    <section aria-label="Scan result" data-testid="scan-card" data-verdict={card.verdict} className="space-y-3">
      <InlineAlert tone={TONE[v.tone]}>
        <p lang="ar" dir="rtl" className="text-xl font-medium">{v.ar}</p>
        <p lang="en" dir="ltr" className="mt-1 text-base">{v.en}</p>
      </InlineAlert>

      {!card.verified ? <InlineAlert tone="warning"><p lang="ar" dir="rtl" className="font-medium">{UNVERIFIED_TEXT.ar}</p><p lang="en" dir="ltr" className="text-sm">{UNVERIFIED_TEXT.en}</p></InlineAlert> : null}

      {card.student || sub || bk ? (
        <dl className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card px-4">
          {card.student ? <Row label="Student">{card.student.name ? <bdi dir="auto">{card.student.name}</bdi> : <span className="text-ink-secondary">–</span>}<span dir="ltr" className="block font-mono text-[13px] tracking-wider text-ink-secondary">{card.student.masar_id}</span></Row> : null}
          {sub ? (
            <Row label="Subscription">
              {sub.state === 'valid'
                ? <>{sub.plan_name ? <bdi dir="auto">{sub.plan_name}</bdi> : null}<span className="block text-[13px] font-normal text-ink-secondary tabular-nums">{sub.valid_to ? `Until ${day(sub.valid_to)}${typeof sub.days_left === 'number' ? ` (${sub.days_left} days left)` : ''}` : ''}</span></>
                : <>Expired{sub.valid_to ? <span className="block text-[13px] font-normal text-ink-secondary tabular-nums">{day(sub.valid_to)}</span> : null}</>}
            </Row>
          ) : null}
          {sub?.state === 'valid' && sub.direction ? <Row label="Today">{sub.direction === 'go' ? 'Go' : 'Return'} trip<span className="block text-[13px] font-normal text-ink-secondary">Go {sub.go_used ? 'used' : 'not used'} · Return {sub.return_used ? 'used' : 'not used'}</span></Row> : null}
          {!sub && card.has_other_company_subscription ? <Row label="Subscription"><span lang="ar" dir="rtl" className="block">{OTHER_COMPANY_TEXT.ar}</span><span lang="en" className="block text-[13px] font-normal text-ink-secondary">{OTHER_COMPANY_TEXT.en}</span></Row> : null}
          {bk ? (
            <Row label="Booking"><span dir="ltr" className="font-mono">{bk.reference}</span><span className="block text-[13px] font-normal text-ink-secondary">{bk.seats} seat{bk.seats === 1 ? '' : 's'}{bk.seats > 1 ? `, ${bk.seats_boarded} boarded` : ''} · {PAYMENT_TEXT[bk.payment_status] ?? bk.payment_status}{bk.is_subscriber_booking ? ' · Subscriber' : ''}</span></Row>
          ) : null}
        </dl>
      ) : null}

      <div className="flex flex-col gap-2">
        {card.can_board ? <Button size="lg" fullWidth loading={busy} onClick={onBoard} className="!h-14 text-lg">Board now</Button> : null}
        <Button size="lg" fullWidth variant="secondary" disabled={busy} onClick={onClose} className="!h-12">{card.can_board ? 'Not now' : 'Close'}</Button>
      </div>
    </section>
  );
}
