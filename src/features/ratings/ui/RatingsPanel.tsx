'use client';
import { useState } from 'react';
import { Button } from '@/ds/primitives/Button';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import type { Lang } from '@/ds/format';
import { submitRatingAction } from '../actions';
import { useCaptchaGate } from '@/components/captcha/useCaptchaGate';
import type { RateableBooking } from '../types';
import { RATING_TEXT, ratingErrorKey } from '../text';
import { StarInput } from './StarInput';

function RateCard({ item, lang, onDone }: { item: RateableBooking; lang: Lang; onDone: (id: string) => void }) {
  const x = RATING_TEXT[lang];
  const gate = useCaptchaGate('rating', lang);
  const [tripStars, setTripStars] = useState(0);
  const [driverStars, setDriverStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = item.state === 'open';
  const canSend = open && tripStars > 0 && driverStars > 0 && gate.ready && !busy;

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await submitRatingAction({ bookingId: item.bookingId, tripStars, driverStars }, gate.token);
      if (r.ok) { onDone(item.bookingId); return; }
      setError(x.errors[ratingErrorKey(r.code, r.detail)]);
    } catch { setError(x.errors.network); } finally { gate.spent(); setBusy(false); }
  };

  return (
    <li className="space-y-3 rounded-lg border border-line-default bg-surface-card p-4">
      <p className="text-base font-medium text-ink-primary"><bdi dir="auto">{item.originName}</bdi> → <bdi dir="auto">{item.destinationName}</bdi></p>
      <p className="text-sm text-ink-secondary"><bdi dir="auto">{item.companyName}</bdi></p>
      {open ? (
        <>
          <StarInput label={x.trip} value={tripStars} onChange={setTripStars} describe={x.stars} disabled={busy} />
          <StarInput label={x.driver} value={driverStars} onChange={setDriverStars} describe={x.stars} disabled={busy} />
          {gate.widget ? <div><p className="mb-1 text-sm text-ink-secondary">{x.captcha}</p>{gate.widget}</div> : null}
          {gate.misconfigured ? <InlineAlert tone="warning" title={x.captchaMissing} /> : null}
          {error ? <InlineAlert tone="error" title={error} /> : null}
          <p className="text-[13px] text-ink-secondary">{x.closes(item.closesAt, lang)}</p>
          <Button type="button" size="lg" onClick={send} disabled={!canSend} loading={busy}>{busy ? x.sending : x.send}</Button>
        </>
      ) : (
        <p className="text-sm text-ink-secondary">{x.notYet(item.opensAt, lang)}</p>
      )}
    </li>
  );
}

/** "Rate your trips" on My bookings: the boarded trips that are rateable now, plus the ones opening soon. Rated and closed trips are not listed. */
export function RatingsPanel({ items, initialLang = 'en' }: { items: RateableBooking[]; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [done, setDone] = useState<string[]>([]);
  const x = RATING_TEXT[lang];
  const shown = items.filter((i) => (i.state === 'open' || i.state === 'not_open_yet') && !done.includes(i.bookingId));
  if (shown.length === 0 && done.length === 0) return null;
  return (
    <section aria-labelledby="rate-title" dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rate-title" className="text-lg font-medium text-ink-primary">{x.title}</h2>
        <button type="button" className="text-sm font-medium underline" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{x.langName}</button>
      </div>
      <p className="text-sm text-ink-secondary">{x.hint}</p>
      {done.length > 0 ? <InlineAlert tone="success" title={x.thanks} /> : null}
      <ul className="space-y-3">{shown.map((i) => <RateCard key={i.bookingId} item={i} lang={lang} onDone={(id) => setDone((d) => [...d, id])} />)}</ul>
    </section>
  );
}
