'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, formatNumber } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';
import { bookSubscriberAction, loadDayAction, loadReturnOptionsAction } from '../actions';
import type { DayState, MySubscription, TripOption } from '../types';
import { MT } from './text';
import { useMemberAction } from './useMemberAction';

const Err = ({ text }: { text: string | null }) => (text ? <p role="alert" className="mt-1 text-sm font-medium text-status-error-fg">{text}</p> : null);

function TripSelect({ lang, label, trips, value, onChange }: { lang: 'en' | 'ar'; label: string; trips: TripOption[]; value: string; onChange: (v: string) => void }) {
  const t = MT[lang];
  return (
    <label className="block text-sm font-medium">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${controlClass(false)} mt-1`}>
        <option value="">{t.pick}</option>
        {trips.map((x) => <option key={x.tripId} value={x.tripId}>{formatDateTime(x.departureAt, lang)} · {t.seatsLeft(formatNumber(x.seatsAvailable, lang))}</option>)}
      </select>
    </label>
  );
}

export function BookView({ lang, sub, today }: { lang: 'en' | 'ar'; sub: MySubscription; today: string }) {
  const t = MT[lang];
  const [day, setDay] = useState(today);
  const [trips, setTrips] = useState<TripOption[] | null>(null);
  const [state, setState] = useState<DayState>({ goBooked: false, returnBooked: false });
  const [go, setGo] = useState('');
  const [returning, setReturning] = useState<boolean | null>(null);
  const [rets, setRets] = useState<TripOption[] | null>(null);
  const [ret, setRet] = useState('');
  const [done, setDone] = useState(false);
  const load = useMemberAction(lang);
  const retLoad = useMemberAction(lang);
  const book = useMemberAction(lang);

  const reset = () => { setGo(''); setReturning(null); setRets(null); setRet(''); setDone(false); };
  const findTrips = () => { reset(); setTrips(null); load.run(() => loadDayAction(sub.id, day), (r) => { setTrips(r.data.trips); setState(r.data.state); }); };
  const pickGo = (id: string) => { setGo(id); setReturning(null); setRets(null); setRet(''); };
  const chooseReturn = (yes: boolean) => {
    setReturning(yes); setRet(''); setRets(null);
    if (yes && go) retLoad.run(() => loadReturnOptionsAction(sub.id, go), (r) => setRets(r.data));
  };
  const needReturn = returning === true;
  const canConfirm = go !== '' && returning !== null && (!needReturn || ret !== '') && !book.pending;
  const confirm = () => book.run(() => bookSubscriberAction(sub.id, go, needReturn ? ret : null), () => { setDone(true); });

  if (done) {
    return (
      <section className="rounded-2xl border border-line-default bg-surface-card p-6 text-center" role="status">
        <h1 className="text-xl font-semibold">{t.booked}</h1>
        <p className="mt-1 text-sm text-ink-secondary">{t.bookedText}</p>
        <Link href="/my-subscriptions" className={`${buttonClass('primary', 'md')} mt-4 inline-flex`}>{t.title}</Link>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-semibold">{t.bookTitle}</h1><p className="text-sm text-ink-secondary">{t.bookFor(`${sub.planName} · ${sub.companyName}`)} · {sub.originName} → {sub.destinationName}</p></div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line-default bg-surface-card p-5">
        <label className="text-sm font-medium">{t.day}
          <input type="date" dir="ltr" value={day} min={sub.validFrom ?? undefined} max={sub.validTo ?? undefined} onChange={(e) => setDay(e.target.value)} className={`${controlClass(false)} mt-1`} />
        </label>
        <Button onClick={findTrips} disabled={load.pending || day === ''}>{load.pending ? t.loading : t.findTrips}</Button>
        <Err text={load.error} />
      </div>
      {trips !== null ? (
        <div className="space-y-4 rounded-2xl border border-line-default bg-surface-card p-5">
          {state.goBooked && state.returnBooked ? <p role="status" className="text-sm font-medium">{t.dayFull}</p>
            : state.goBooked ? <p role="status" className="text-sm font-medium">{t.goBooked}</p>
            : trips.length === 0 ? <p className="text-sm text-ink-secondary">{t.noGoTrips}</p> : (<>
              <TripSelect lang={lang} label={t.goTrip} trips={trips} value={go} onChange={pickGo} />
              {go ? (
                <fieldset>
                  <legend className="text-sm font-medium">{t.returning}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant={returning === true ? 'primary' : 'secondary'} aria-pressed={returning === true} onClick={() => chooseReturn(true)}>{t.yes}</Button>
                    <Button variant={returning === false ? 'primary' : 'secondary'} aria-pressed={returning === false} onClick={() => chooseReturn(false)}>{t.no}</Button>
                  </div>
                  <Err text={retLoad.error} />
                </fieldset>
              ) : null}
              {needReturn && rets !== null ? (rets.length === 0 ? <p className="text-sm text-ink-secondary">{t.noReturn}</p> : <TripSelect lang={lang} label={t.returnTrip} trips={rets} value={ret} onChange={setRet} />) : null}
              <Err text={book.error} />
              <Button onClick={confirm} disabled={!canConfirm}>{t.confirm}</Button>
            </>)}
        </div>
      ) : null}
    </div>
  );
}
