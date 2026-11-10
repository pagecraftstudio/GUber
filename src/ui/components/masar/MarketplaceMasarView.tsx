'use client';
import { ArrowLeftRight, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/ds/primitives/Button';
import { Field, useFieldControl } from '@/ds/primitives/Field';
import { DatePicker, Select } from '@/ds/primitives/Input';
import { RadioGroup } from '@/ds/primitives/Choice';
import { EmptyState, SkeletonCard } from '@/ds/feedback/States';
import { Modal } from '@/ds/feedback/Dialog';
import { TripCard } from '@/ds/domain/Trip';
import { formatClock, formatNumber, formatMoney } from '@/ds/format';
import { tenantAccent } from '@/ds/contrast';
import { useLocale } from '../../context/LocaleContext';
import { quickDates } from '../../lib/demoDefaults';
import type { CanonicalLocation, Company, MarketplaceSearchParams, MarketplaceTripItem } from '../../types';

export interface MarketplaceMasarViewProps {
  locations: CanonicalLocation[];
  companies: Company[];
  params: MarketplaceSearchParams;
  trips: MarketplaceTripItem[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onSearch: (originId: string, destId: string, date: string) => void;
  onFilter: (u: Partial<MarketplaceSearchParams>) => void;
  onReset: () => void;
  onBook: (t: MarketplaceTripItem) => void;
  onOperator: (companyId: string) => void;
}

/** Native slider wired to its <Field> so the label, hint and focus behave like every other control. */
function PriceRange({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { id, 'aria-describedby': describedBy } = useFieldControl({});
  return <input id={id} aria-describedby={describedBy} type="range" min={80} max={300} step={10} value={value} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="h-9 w-full accent-[var(--ds-action-primary)]" />;
}

const SORTS = ['time_asc', 'time_desc', 'price_asc', 'price_desc'] as const;

/** Search, filters and results in the MASAR look. State and data loading stay in MasterMarketplace; this only draws. */
export function MarketplaceMasarView(p: MarketplaceMasarViewProps) {
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const [origin, setOrigin] = useState(p.params.originLocationId ?? '');
  const [dest, setDest] = useState(p.params.destLocationId ?? '');
  const [date, setDate] = useState(p.params.date ?? '');
  const [drawer, setDrawer] = useState(false);

  const active = [p.params.companyId, p.params.timeOfDay && p.params.timeOfDay !== 'all', p.params.maxPrice && p.params.maxPrice < 300, p.params.minAvailableSeats && p.params.minAvailableSeats > 1].filter(Boolean).length;
  const name = (en: string, a: string) => (ar ? a : en);
  const listed = p.companies.filter((c) => c.status === 'active' && c.marketplaceListed);
  const pageTrips = p.trips.slice((p.page - 1) * p.pageSize, p.page * p.pageSize);
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));

  const filters = (
    <div className="flex flex-col gap-5">
      <Field label={t('sortBy')}>
        <Select value={p.params.sortBy ?? 'time_asc'} onChange={(e) => p.onFilter({ sortBy: e.target.value as MarketplaceSearchParams['sortBy'] })}>
          {SORTS.map((s) => <option key={s} value={s}>{t(({ time_asc: 'timeEarliest', time_desc: 'timeLatest', price_asc: 'priceLowest', price_desc: 'priceHighest' } as const)[s])}</option>)}
        </Select>
      </Field>
      <Field label={t('filterByCompany')}>
        <Select value={p.params.companyId ?? ''} onChange={(e) => p.onFilter({ companyId: e.target.value || undefined })}>
          <option value="">{t('allOperators')}</option>
          {listed.map((c) => <option key={c.id} value={c.id}>{name(c.nameEn, c.nameAr)}</option>)}
        </Select>
      </Field>
      <RadioGroup legend={t('departureTimeOfDay')} name="timeOfDay" value={p.params.timeOfDay ?? 'all'} onChange={(v) => p.onFilter({ timeOfDay: v as MarketplaceSearchParams['timeOfDay'] })}
        options={[{ value: 'all', label: t('allDay') }, { value: 'morning', label: t('morning') }, { value: 'afternoon', label: t('afternoon') }, { value: 'evening', label: t('evening') }]} />
      <Field label={t('priceRange')} hint={p.params.maxPrice && p.params.maxPrice < 300 ? formatMoney(p.params.maxPrice, 'EGP', locale) : t('anyPrice')}>
        <PriceRange value={p.params.maxPrice ?? 300} onChange={(v) => p.onFilter({ maxPrice: v })} />
      </Field>
      <Field label={t('minAvailableCapacity')}>
        <Select value={String(p.params.minAvailableSeats ?? 1)} onChange={(e) => p.onFilter({ minAvailableSeats: parseInt(e.target.value, 10) })}>
          <option value="1">{t('minSeats1')}</option><option value="3">{t('minSeats3')}</option><option value="5">{t('minSeats5')}</option><option value="10">{t('minSeats10')}</option>
        </Select>
      </Field>
      {active > 0 ? <Button variant="ghost" onClick={p.onReset}>{t('reset')}</Button> : null}
    </div>
  );

  return (
    <main className="bg-surface-page text-ink-primary">
      <section aria-labelledby="mk-h" className="border-b border-line-default bg-surface-card">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 id="mk-h" className="max-w-3xl text-3xl font-medium sm:text-4xl">{t('marketplaceHeroTitle')}</h1>
          <p className="mt-2 max-w-2xl text-ink-secondary">{t('marketplaceHeroSubtitle')}</p>
          <form role="search" onSubmit={(e) => { e.preventDefault(); p.onSearch(origin, dest, date); }} className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_auto] sm:items-end">
            <Field label={t('fromOrigin')}>
              <Select size="lg" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">{t('allOriginCitiesOption')}</option>
                {p.locations.filter((l) => !l.isUniversityHub).map((l) => <option key={l.id} value={l.id}>{name(l.nameEn, l.nameAr)}</option>)}
              </Select>
            </Field>
            <span className="hidden sm:block"><Button variant="ghost" size="lg" aria-label={t('swapDirection')} onClick={() => { setOrigin(dest); setDest(origin); }} iconStart={<ArrowLeftRight size={16} strokeWidth={1.5} />} /></span>
            <Field label={t('toDestination')}>
              <Select size="lg" value={dest} onChange={(e) => setDest(e.target.value)}>
                <option value="">{t('allDestinationsOption')}</option>
                {p.locations.map((l) => <option key={l.id} value={l.id}>{name(l.nameEn, l.nameAr)}</option>)}
              </Select>
            </Field>
            <Field label={t('travelDate')}><DatePicker size="lg" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Button type="submit" size="lg" iconStart={<Search size={16} strokeWidth={1.5} />}>{t('searchTrips')}</Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={ar ? 'مواعيد سريعة' : 'Quick dates'}>
            {quickDates().map((q) => (
              <Button key={q.iso} variant={date === q.iso ? 'primary' : 'secondary'} onClick={() => { setDate(q.iso); p.onSearch(origin, dest, q.iso); }} aria-pressed={date === q.iso}>{ar ? q.label.ar : q.label.en}</Button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_1fr] lg:px-8">
        <aside aria-label={t('filter')} className="hidden self-start rounded-ds-md border border-line-default bg-surface-card p-5 lg:block">
          <h2 className="mb-4 text-base font-medium">{t('filter')}</h2>
          {filters}
        </aside>
        <section aria-labelledby="mk-r" className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mk-r" className="text-xl font-medium">{t('compareTripsFound')}</h2>
            <p className="text-sm text-ink-secondary" aria-live="polite">{formatNumber(p.total, locale)} {t('departures')}</p>
          </div>
          <div className="lg:hidden">
            <Button variant="secondary" onClick={() => setDrawer(true)} iconStart={<SlidersHorizontal size={16} strokeWidth={1.5} />}>{t('filter')}{active ? ` (${formatNumber(active, locale)})` : ''}</Button>
          </div>
          {p.loading ? (
            <div role="status" aria-label={t('searchingAcrossOperators')} className="flex flex-col gap-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
          ) : p.trips.length === 0 ? (
            <EmptyState title={t('noTripsFound')} description={t('tryDifferentDate')} action={<Button variant="secondary" onClick={p.onReset}>{t('resetSearchFilters')}</Button>} />
          ) : (
            <>
              <ul className="flex flex-col gap-4">
                {pageTrips.map((trip) => {
                  const tint = tenantAccent(trip.companyPrimaryColor);
                  return (
                    <li key={trip.id}>
                      <TripCard
                        lang={locale}
                        operator={{ name: name(trip.companyNameEn, trip.companyNameAr), onClick: () => p.onOperator(trip.companyId), tile: { text: trip.companyLogoText.slice(0, 2).toUpperCase(), accent: tint?.accent ?? 'var(--ds-action-primary)', onAccent: tint?.onAccent ?? 'var(--ds-action-on-primary)' } }}
                        departureText={formatClock(trip.departureTime, locale)}
                        arrivalText={formatClock(trip.arrivalTime, locale)}
                        durationMinutes={trip.durationMinutes}
                        seatsLeft={trip.availableSeats}
                        lowSeats={trip.availableSeats > 0 && trip.availableSeats <= 6}
                        price={{ amount: trip.priceEgp, currency: 'EGP' }}
                        priceNote={trip.roundTripPriceEgp !== undefined ? `${ar ? 'ذهاب وعودة' : 'Go & return'}: ${formatMoney(trip.roundTripPriceEgp, 'EGP', locale)}` : undefined}
                        stops={[{ name: name(trip.originStopNameEn, trip.originStopNameAr) }, { name: name(trip.destStopNameEn, trip.destStopNameAr) }]}
                        note={trip.busModel}
                        seatsLeftLabel={(n) => `${n} ${t('seatsAvailable')}`}
                        soldOutLabel={t('soldOut')}
                        action={<Button disabled={trip.isFullyBooked} onClick={() => p.onBook(trip)}>{trip.isFullyBooked ? t('fullyBooked') : t('bookNow')}</Button>}
                      />
                    </li>
                  );
                })}
              </ul>
              {pages > 1 ? (
                <nav aria-label={ar ? 'التنقل بين الصفحات' : 'Pagination'} className="flex items-center justify-between">
                  <Button variant="secondary" disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)}>{ar ? 'السابق' : 'Previous'}</Button>
                  <span className="text-sm text-ink-secondary">{formatNumber(p.page, locale)} / {formatNumber(pages, locale)}</span>
                  <Button variant="secondary" disabled={p.page >= pages} onClick={() => p.onPage(p.page + 1)}>{ar ? 'التالي' : 'Next'}</Button>
                </nav>
              ) : null}
            </>
          )}
        </section>
      </div>
      <Modal open={drawer} onClose={() => setDrawer(false)} title={t('filter')} footer={<Button onClick={() => setDrawer(false)}>{ar ? `عرض النتائج (${formatNumber(p.total, locale)})` : `Show results (${p.total})`}</Button>}>{filters}</Modal>
    </main>
  );
}
