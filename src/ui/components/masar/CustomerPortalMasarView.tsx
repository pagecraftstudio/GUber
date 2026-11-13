'use client';
import { LogOut, Plus, QrCode, Trash2 } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { Button, IconButton } from '@/ds/primitives/Button';
import { Field } from '@/ds/primitives/Field';
import { Input, Textarea } from '@/ds/primitives/Input';
import { Modal } from '@/ds/feedback/Dialog';
import { EmptyState, SkeletonCard } from '@/ds/feedback/States';
import { InlineAlert } from '@/ds/feedback/InlineAlert';
import { Tabs, MetricCard, KeyValue } from '@/ds/data/Layout';
import { StatusBadge } from '@/ds/data/StatusBadge';
import { RouteLine } from '@/ds/domain/RouteLine';
import { Identifier } from '@/ds/format/Identifier';
import { cx } from '@/ds/primitives/cx';
import { formatClock, formatDate, formatMoney, formatNumber } from '@/ds/format';
import { useLocale } from '../../context/LocaleContext';
import type { Booking, Company, Route, Stop, Trip } from '../../types';
import { J6C } from './text6c';

type TripFilter = 'all' | 'upcoming' | 'completed' | 'cancelled';

export interface PortalCompanion { id: string; name: string; phone: string; studentId?: string; relationship?: string }
export interface CustomerPortalMasarProps {
  user: { id: string; fullName: string; email: string; phone?: string; studentId?: string; createdAt?: string } | null;
  mock: boolean;
  stats: { trips: number; spent: number };
  filter: TripFilter; onFilter: (f: TripFilter) => void;
  bookings: Booking[]; trips: Trip[]; routes: Route[]; stops: Stop[]; loading: boolean;
  companyOf: (b: Booking) => Company | undefined;
  onBrowse: () => void;
  onViewTicket: (b: Booking, t: Trip) => void;
  onAskCancel: (b: Booking) => void;
  profile: { name: string; phone: string; studentId: string; university: string; saving: boolean; saved: boolean; onName: (v: string) => void; onPhone: (v: string) => void; onStudentId: (v: string) => void; onUniversity: (v: string) => void; onSubmit: (e: FormEvent) => void };
  companions: PortalCompanion[]; onRemoveCompanion: (id: string) => void; onOpenAddCompanion: () => void;
  onSignOut: () => void;
  cancel: { booking: Booking | null; reason: string; loading: boolean; error: string | null; onReason: (v: string) => void; onClose: () => void; onConfirm: () => void };
  add: { open: boolean; name: string; phone: string; studentId: string; relationship: string; saving: boolean; onName: (v: string) => void; onPhone: (v: string) => void; onStudentId: (v: string) => void; onRelationship: (v: string) => void; onClose: () => void; onSubmit: (e: FormEvent) => void };
}

/** Status of a booking. `cancellation_requested` and `boarded` are portal states with no entry in the booking map, so they borrow the nearest existing domain. */
function BookingStatus({ status }: { status: string }) {
  const { locale } = useLocale();
  if (status === 'boarded') return <StatusBadge domain="boarding" value="boarded" lang={locale} />;
  if (status === 'cancellation_requested') return <span className="inline-flex h-6 items-center rounded-ds-sm bg-status-warning-bg px-2 text-[13px] font-medium whitespace-nowrap text-status-warning-fg">{J6C[locale].requested}</span>;
  return <StatusBadge domain="booking" value={status} lang={locale} />;
}

function Panel({ title, text, action, children }: { title: string; text?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-ds-md border border-line-default bg-surface-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="text-lg font-medium">{title}</h2>{text ? <p className="mt-1 max-w-xl text-sm text-ink-secondary">{text}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Passenger portal in the MASAR look. All state, loading and service calls stay in CustomerPortal; this only draws. */
export function CustomerPortalMasarView(p: CustomerPortalMasarProps) {
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const x = J6C[locale];
  const filters: { id: TripFilter; label: string }[] = [
    { id: 'upcoming', label: x.upcoming }, { id: 'completed', label: x.past },
    { id: 'cancelled', label: p.mock ? x.cancelledReq : x.cancelledTab }, { id: 'all', label: x.all },
  ];

  const bookingsPanel = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={x.tabTrips} className="flex flex-wrap gap-2">
          {filters.map((f) => <Button key={f.id} variant={p.filter === f.id ? 'primary' : 'secondary'} aria-pressed={p.filter === f.id} onClick={() => p.onFilter(f.id)}>{f.label}</Button>)}
        </div>
        <Button variant="secondary" onClick={p.onBrowse} iconStart={<Plus size={16} strokeWidth={1.5} />}>{x.bookTrip}</Button>
      </div>
      {p.loading ? (
        <div role="status" aria-label={x.tabTrips} className="flex flex-col gap-4"><SkeletonCard /><SkeletonCard /></div>
      ) : p.bookings.length === 0 ? (
        <EmptyState title={x.noBookings} description={x.noBookingsText} action={<Button onClick={p.onBrowse}>{x.browse}</Button>} />
      ) : (
        <ul className="flex flex-col gap-4">
          {p.bookings.map((b) => {
            const trip = p.trips.find((tr) => tr.id === b.tripId);
            const route = p.routes.find((r) => r.id === trip?.routeId);
            const company = p.companyOf(b);
            const from = p.stops.find((s) => s.id === b.pickupStopId || s.id === route?.originStopId);
            const to = p.stops.find((s) => s.id === b.dropoffStopId || s.id === route?.destStopId);
            const confirmed = b.status === 'confirmed';
            const requested = b.status === 'cancellation_requested';
            const sn = (s?: Stop) => (s ? (ar ? s.nameAr : s.nameEn) : undefined);
            const origin = sn(from) ?? (ar ? route?.originCityAr : route?.originCityEn);
            const dest = sn(to) ?? (ar ? route?.destCityAr : route?.destCityEn);
            return (
              <li key={b.id} className="flex flex-col gap-4 rounded-ds-md border border-line-default bg-surface-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 text-sm"><span className="font-medium">{ar ? company?.nameAr : company?.nameEn}</span><span className="text-ink-muted"> · </span><Identifier value={b.bookingReference} /></p>
                  <BookingStatus status={b.status} />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-start">
                  {origin && dest ? <RouteLine stops={[{ name: origin }, { name: dest }]} /> : <span />}
                  <div className="text-sm"><p className="text-[13px] text-ink-muted">{t('departure')}</p><p className="font-medium tabular-nums">{trip ? formatDate(trip.departureDate, locale) : '–'}</p><p className="text-ink-secondary tabular-nums">{trip ? `${formatClock(trip.departureTime, locale)} – ${formatClock(trip.arrivalTime, locale)}` : ''}</p></div>
                  <div className="text-sm sm:text-end"><p className="text-[13px] text-ink-muted">{t('seats')} · {t('fare')}</p><p className="font-medium tabular-nums">{formatNumber(b.passengerCount || 1, locale)} {t('seats')}</p><p className="text-ink-secondary tabular-nums">{formatMoney(b.fareEgp, 'EGP', locale)}</p></div>
                </div>
                {b.passengers && b.passengers.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-secondary"><span className="font-medium text-ink-primary">{x.passengers}</span>
                    {b.passengers.map((q) => <span key={q.id}>{q.passengerName}{q.status === 'boarded' ? ` · ${x.boarded}` : ''}</span>)}</p>
                ) : null}
                {requested ? <InlineAlert tone="warning" title={x.requested}>{b.cancellationReason ? <>{b.cancellationReason}. </> : null}{x.reviewing}</InlineAlert> : null}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-default pt-3">
                  <p className="min-w-0 truncate text-[13px] text-ink-muted" dir="ltr">{b.qrTicketToken ? `${x.ticketToken}: ${b.qrTicketToken.substring(0, 16)}…` : ''}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmed && (p.mock || b.canCancel) ? <Button variant="secondary" onClick={() => p.onAskCancel(b)}>{p.mock ? x.requestCancel : x.cancelBooking}</Button> : null}
                    {confirmed && !p.mock && !b.canCancel ? <span className="text-[13px] text-ink-muted">{x.cancelEnded}</span> : null}
                    {trip && (p.mock ? !!b.qrTicketToken : confirmed) ? <Button onClick={() => p.onViewTicket(b, trip)} iconStart={<QrCode size={16} strokeWidth={1.5} />}>{x.boardingPass}</Button> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const pf = p.profile;
  const profilePanel = (
    <Panel title={x.profileTitle} text={x.profileText}>
      {pf.saved ? <div className="mb-4"><InlineAlert tone="success">{x.saved}</InlineAlert></div> : null}
      <form onSubmit={pf.onSubmit} className="flex max-w-xl flex-col gap-4">
        <Field label={t('fullNameLabel')} required><Input value={pf.name} onChange={(e) => pf.onName(e.target.value)} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('emailLabel')} hint={x.emailManaged}><Input type="email" dir="ltr" value={p.user?.email ?? ''} disabled readOnly /></Field>
          <Field label={t('phoneLabel')} required><Input type="tel" dir="ltr" value={pf.phone} onChange={(e) => pf.onPhone(e.target.value)} required /></Field>
        </div>
        <fieldset className="flex flex-col gap-4 rounded-ds-md border border-line-default bg-surface-sunken p-4">
          <legend className="px-1 text-sm font-medium">{x.studentSection}</legend>
          <p className="text-[13px] text-ink-secondary">{t('studentDiscountApplied')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('optionalStudentId')} hint={t('studentIdHint')}><Input dir="ltr" value={pf.studentId} onChange={(e) => pf.onStudentId(e.target.value)} /></Field>
            <Field label={x.faculty}><Input value={pf.university} onChange={(e) => pf.onUniversity(e.target.value)} /></Field>
          </div>
        </fieldset>
        <div><Button type="submit" loading={pf.saving}>{x.save}</Button></div>
      </form>
    </Panel>
  );

  const companionsPanel = (
    <Panel title={x.companionsTitle} text={x.companionsText} action={p.mock ? <Button variant="secondary" onClick={p.onOpenAddCompanion} iconStart={<Plus size={16} strokeWidth={1.5} />}>{x.addCompanion}</Button> : undefined}>
      {p.companions.length === 0 ? (
        <EmptyState title={x.noCompanions} description={x.noCompanionsText} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {p.companions.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-ds-md border border-line-default p-4">
              <div className="min-w-0 text-sm"><p className="truncate font-medium">{c.name}</p><p className="text-ink-secondary tabular-nums" dir="ltr">{c.phone}</p>{c.studentId ? <Identifier value={c.studentId} /> : null}{c.relationship ? <p className="text-[13px] text-ink-muted">{c.relationship}</p> : null}</div>
              <IconButton label={`${x.remove}: ${c.name}`} icon={<Trash2 size={16} strokeWidth={1.5} />} onClick={() => p.onRemoveCompanion(c.id)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );

  const securityPanel = (
    <Panel title={x.securityTitle} text={x.securityText}>
      <div className="flex max-w-xl flex-col gap-4">
        <InlineAlert tone="success" title={x.sessionActive}>{x.sessionText}</InlineAlert>
        <KeyValue items={[
          { label: x.userId, value: <span dir="ltr" className="break-all font-mono text-[13px]">{p.user?.id}</span> },
          { label: x.registeredEmail, value: <span dir="ltr">{p.user?.email}</span> },
          { label: x.created, value: p.user?.createdAt ? formatDate(p.user.createdAt, locale) : '–' },
        ]} />
        <div><Button variant="secondary" onClick={p.onSignOut} iconStart={<LogOut size={16} strokeWidth={1.5} />}>{x.signOut}</Button></div>
      </div>
    </Panel>
  );

  const cb = p.cancel.booking;
  const ad = p.add;
  return (
    <main className="bg-surface-page text-ink-primary">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-6 rounded-ds-md border border-line-default bg-surface-card p-5 sm:p-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium">{p.user?.fullName}</h1>
            <p className="mt-1 text-sm text-ink-secondary">{p.user?.studentId ? <>{x.student} · <Identifier value={p.user.studentId} /></> : x.regular}</p>
            <p className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-ink-muted"><span dir="ltr">{p.user?.email}</span>{p.user?.phone ? <span dir="ltr" className="tabular-nums">{p.user.phone}</span> : null}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-72">
            <MetricCard label={x.tripsCount} value={formatNumber(p.stats.trips, locale)} />
            <MetricCard label={x.spent} value={formatMoney(p.stats.spent, 'EGP', locale)} />
          </div>
        </header>
        <Tabs label={x.tabs} dir={ar ? 'rtl' : 'ltr'} tabs={[
          { id: 'trips', label: x.tabTrips, panel: bookingsPanel }, { id: 'profile', label: x.tabProfile, panel: profilePanel },
          { id: 'companions', label: x.tabCompanions, panel: companionsPanel }, { id: 'security', label: x.tabSecurity, panel: securityPanel },
        ]} />
      </div>

      <Modal open={!!cb} onClose={p.cancel.onClose} title={p.mock ? x.cancelRequestTitle : x.cancelTitle} subtitle={cb ? x.reservation(cb.bookingReference) : undefined}
        footer={<><Button variant="secondary" onClick={p.cancel.onClose}>{p.mock ? x.cancel : x.keep}</Button><Button variant="destructive" loading={p.cancel.loading} disabled={p.mock && !p.cancel.reason.trim()} onClick={p.cancel.onConfirm}>{p.mock ? x.submitRequest : x.cancelNow}</Button></>}>
        <div className="flex flex-col gap-4">
          <InlineAlert tone="warning" title={p.mock ? x.cancelPolicy : x.cancelImmediate}>{p.mock ? x.cancelPolicyText : x.cancelImmediateText}</InlineAlert>
          <Field label={p.mock ? x.reasonRequired : x.reasonOptional} required={p.mock} error={p.cancel.error ?? undefined}>
            <Textarea rows={3} value={p.cancel.reason} placeholder={t('cancellationReasonPlaceholder')} onChange={(e) => p.cancel.onReason(e.target.value)} required={p.mock} />
          </Field>
        </div>
      </Modal>

      <Modal open={ad.open} onClose={ad.onClose} title={x.addCompanion}
        footer={<><Button variant="secondary" onClick={ad.onClose}>{x.cancel}</Button><Button type="submit" form="add-companion" loading={ad.saving}>{x.save}</Button></>}>
        <form id="add-companion" onSubmit={ad.onSubmit} className={cx('flex flex-col gap-4')}>
          <Field label={x.name} required><Input value={ad.name} onChange={(e) => ad.onName(e.target.value)} required /></Field>
          <Field label={x.phone} required><Input type="tel" dir="ltr" value={ad.phone} onChange={(e) => ad.onPhone(e.target.value)} required /></Field>
          <Field label={t('optionalStudentId')}><Input dir="ltr" value={ad.studentId} onChange={(e) => ad.onStudentId(e.target.value)} /></Field>
          <Field label={x.relationship}><Input value={ad.relationship} onChange={(e) => ad.onRelationship(e.target.value)} /></Field>
        </form>
      </Modal>
    </main>
  );
}
