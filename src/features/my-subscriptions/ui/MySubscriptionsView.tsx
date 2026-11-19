'use client';
import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { formatDateTime, formatDay, formatMoney } from '@/ds/format';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { controlClass } from '@/ds/primitives/Input';
import { cancelSubscriberBookingAction, cancelSubscriptionAction, markNoticesReadAction, requestPlanAction, savePhoneAction } from '../actions';
import type { MemberNotice, MemberProfile, MySubscription, SubscriberBooking } from '../types';
import { MT } from './text';
import { useMemberAction } from './useMemberAction';

const Err = ({ text }: { text: string | null }) => (text ? <p role="alert" className="mt-1 text-sm font-medium text-status-error-fg">{text}</p> : null);

function MasarIdCard({ lang, id }: { lang: 'en' | 'ar'; id: string }) {
  const t = MT[lang];
  const [done, setDone] = useState(false);
  return (
    <section aria-labelledby="masar-id" className="rounded-2xl border border-line-default bg-surface-card p-5">
      <h2 id="masar-id" className="text-sm font-medium text-ink-secondary">{t.masarId}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <p dir="ltr" className="font-mono text-2xl font-semibold tracking-wider tabular-nums">{id}</p>
        <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(id).then(() => setDone(true), () => undefined); }} className="!h-8 !px-3 text-[13px]">{done ? t.copied : t.copy}</Button>
      </div>
      <p className="mt-1 text-sm text-ink-secondary">{t.masarHint}</p>
    </section>
  );
}

function PhoneForm({ lang }: { lang: 'en' | 'ar' }) {
  const t = MT[lang];
  const [phone, setPhone] = useState('');
  const { pending, error, run } = useMemberAction(lang);
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => savePhoneAction(phone)); }} className="rounded-2xl border border-line-default bg-surface-card p-5">
      <h2 className="font-semibold">{t.phoneTitle}</h2>
      <p className="mt-1 text-sm text-ink-secondary">{t.phoneText}</p>
      <label className="mt-3 block text-sm font-medium">{t.phone}
        <input dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={`${controlClass(!!error)} mt-1`} />
      </label>
      <Err text={error} />
      <Button type="submit" disabled={pending || phone.trim() === ''} className="mt-3">{t.savePhone}</Button>
    </form>
  );
}

function TripRow({ lang, b, timeZone }: { lang: 'en' | 'ar'; b: SubscriberBooking; timeZone: string }) {
  const t = MT[lang];
  const { pending, error, run } = useMemberAction(lang);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line-default py-2 first:border-t-0">
      <div>
        <p className="text-sm font-medium">
          <span className="me-2 rounded-ds-sm bg-surface-muted px-1.5 py-0.5 text-[12px]">{b.direction === 'go' ? t.go : t.ret}</span>
          {b.originName} → {b.destinationName}
          {b.scanned ? <span className="ms-2 text-[12px] text-status-success-fg">{t.scanned}</span> : null}
        </p>
        <p className="text-[13px] text-ink-secondary"><span dir="ltr">{formatDateTime(b.departureAt, lang, { timeZone })}</span> · <span dir="ltr">{b.reference}</span></p>
        <Err text={error} />
      </div>
      {!b.scanned ? <Button variant="ghost" disabled={pending} onClick={() => run(() => cancelSubscriberBookingAction(b.bookingId))} aria-label={`${t.cancelTrip} ${b.reference}`} className="!h-8 !px-2 text-[13px]">{t.cancelTrip}</Button> : null}
    </li>
  );
}

function NoticesCard({ lang, notices }: { lang: 'en' | 'ar'; notices: MemberNotice[] }) {
  const t = MT[lang];
  const { pending, error, run } = useMemberAction(lang);
  const unread = notices.filter((n) => !n.isRead).length;
  if (notices.length === 0) return null;
  return (
    <section aria-labelledby="notices" className="rounded-2xl border border-line-default bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notices" className="font-semibold">{t.notices}</h2>
        {unread > 0 ? <Button variant="ghost" disabled={pending} onClick={() => run(() => markNoticesReadAction())} className="!h-8 !px-2 text-[13px]">{t.markRead}</Button> : null}
      </div>
      <Err text={error} />
      <ul className="mt-2">
        {notices.map((n) => (
          <li key={n.id} className="border-t border-line-default py-2 first:border-t-0">
            <p className="text-sm font-medium">{n.isRead ? null : <span className="me-2 rounded-ds-sm bg-status-warning-bg px-1.5 py-0.5 text-[12px] text-status-warning-fg">{t.newNotice}</span>}{n.subject}</p>
            <p className="text-sm text-ink-secondary">{n.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubscriptionCard({ lang, s, bookings, renewalPending }: { lang: 'en' | 'ar'; s: MySubscription; bookings: SubscriberBooking[]; renewalPending: boolean }) {
  const t = MT[lang];
  const { pending, error, run } = useMemberAction(lang);
  const open = s.status === 'pending' || s.status === 'active';
  return (
    <article className="rounded-2xl border border-line-default bg-surface-card p-5" aria-label={`${s.planName} ${s.companyName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{s.planName}</h3>
          <p className="text-sm text-ink-secondary">{s.companyName} · {s.originName} → {s.destinationName}</p>
        </div>
        <StatusBadge domain="riderSubscription" value={s.status} />
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        {formatMoney(s.price, s.currency, lang)}
        {s.validFrom && s.validTo ? <> · {t.validity(formatDay(s.validFrom, lang, 'numeric'), formatDay(s.validTo, lang, 'numeric'))}</> : null}
        {s.status === 'pending' ? <> · {t.pendingText}</> : null}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {s.status === 'active' ? <Link href={`/my-subscriptions/${s.id}/book`} className={buttonClass('primary', 'md')}>{t.book}</Link> : null}
        {s.status === 'expired' ? <Button disabled={pending} onClick={() => run(() => requestPlanAction(s.planId))}>{t.renew}</Button> : null}
        {s.renewable ? <Button variant="secondary" disabled={pending} onClick={() => run(() => requestPlanAction(s.planId))}>{t.renewNow}</Button> : null}
        {s.status === 'revoked' ? <p className="text-sm text-ink-secondary">{t.revokedText}</p> : null}
        {open ? <Button variant="secondary" disabled={pending} onClick={() => run(() => cancelSubscriptionAction(s.id))}>{s.status === 'pending' ? t.cancel : t.cancelSub}</Button> : null}
      </div>
      {s.renewable ? <p className="mt-1 text-[12px] text-ink-muted">{t.renewNote}</p> : null}
      {renewalPending ? <p className="mt-1 text-sm text-ink-secondary">{t.renewPending}</p> : null}
      <Err text={error} />
      {s.status === 'active' ? (
        <div className="mt-4">
          <h4 className="text-sm font-medium">{t.upcoming}</h4>
          {bookings.length === 0 ? <p className="mt-1 text-sm text-ink-secondary">{t.noTrips}</p> : (<>
            <ul className="mt-1">{bookings.map((b) => <TripRow key={b.bookingId} lang={lang} b={b} timeZone={s.timeZone} />)}</ul>
            <p className="mt-1 text-[12px] text-ink-muted">{t.cancelTripNote}</p>
          </>)}
        </div>
      ) : null}
    </article>
  );
}

export function MySubscriptionsView({ lang, profile, subs, bookings, notices = [] }: { lang: 'en' | 'ar'; profile: MemberProfile; subs: MySubscription[]; bookings: Record<string, SubscriberBooking[]>; notices?: MemberNotice[] }) {
  const t = MT[lang];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <Link href="/my-subscriptions/plans" className={buttonClass('primary', 'md')}>{t.plansLink}</Link>
      </div>
      <MasarIdCard lang={lang} id={profile.masarId} />
      <NoticesCard lang={lang} notices={notices} />
      {profile.phone ? null : <PhoneForm lang={lang} />}
      {subs.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-line-default p-8 text-center"><h2 className="font-semibold">{t.none}</h2><p className="mt-1 text-sm text-ink-secondary">{t.noneText}</p></section>
      ) : <div className="grid gap-4 md:grid-cols-2">{subs.map((s) => <SubscriptionCard key={s.id} lang={lang} s={s} bookings={bookings[s.id] ?? []} renewalPending={s.status === 'active' && subs.some((o) => o.planId === s.planId && o.status === 'pending')} />)}</div>}
    </div>
  );
}
