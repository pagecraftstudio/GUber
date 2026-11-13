'use client';
import { ArrowLeftRight, Clock, LogOut, Mail, MapPin, Menu, Moon, Phone, Search, Shield, Sun, Ticket, User, Wifi } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { tenantAccent } from '@/ds/contrast';
import { Button, IconButton } from '@/ds/primitives/Button';
import { cx, FOCUS } from '@/ds/primitives/cx';
import { Field } from '@/ds/primitives/Field';
import { DatePicker, Select } from '@/ds/primitives/Input';
import { Drawer } from '@/ds/feedback/Dialog';
import { EmptyState } from '@/ds/feedback/States';
import { Identifier } from '@/ds/format/Identifier';
import { formatClock, formatMoney, formatNumber, formatYear } from '@/ds/format';
import { TripCard } from '@/ds/domain/Trip';
import { AccountMenu, MenuAction } from '@/ds/shell/AccountMenu';
import { QuietFooter } from '@/ds/shell/MarketplaceHeaderMasar';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { Bus, Company, Route, Stop, Trip } from '../../types';
import { J6C } from './text6c';

const linkCls = cx('inline-flex h-9 items-center rounded-ds-sm px-2 text-sm whitespace-nowrap text-ink-secondary hover:text-ink-primary', FOCUS);

/** The company mark: initials on the tenant colour when it is readable (D5), the MASAR action colour otherwise. */
function CompanyMark({ company, size = 'md' }: { company: Company; size?: 'md' | 'lg' }) {
  const tint = tenantAccent(company.primaryColor);
  return (
    <span aria-hidden="true" className={cx('flex shrink-0 items-center justify-center rounded-ds-sm font-medium', size === 'lg' ? 'size-10 text-sm' : 'size-8 text-[13px]')} style={{ background: tint?.accent ?? 'var(--ds-action-primary)', color: tint?.onAccent ?? 'var(--ds-action-primary-fg, #fff)' }}>
      {(company.logoText || company.nameEn).slice(0, 2).toUpperCase()}
    </span>
  );
}

export function PublicHeaderMasar({ onBook }: { onBook: () => void }) {
  const { currentCompany: c, setActiveView } = useTenant();
  const { locale, toggleLocale, t } = useLocale();
  const { user, isAuthenticated, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [menu, setMenu] = useState(false);
  const x = J6C[locale];
  const links = [
    { href: '#search', label: t('findRoute') }, { href: '#routes', label: t('popularRoutes') },
    { href: '#how-to-book', label: t('howToBook') }, { href: '#faqs', label: t('faqsTitle') },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line-default bg-surface-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#hero" className={cx('flex min-w-0 items-center gap-3 rounded-ds-sm', FOCUS)}>
          <CompanyMark company={c} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink-primary">{locale === 'ar' ? c.nameAr : c.nameEn}</span>
            <span className="block truncate text-[13px] text-ink-muted max-sm:hidden">{locale === 'ar' ? c.taglineAr : c.taglineEn}</span>
          </span>
        </a>
        <nav aria-label={x.nav} className="hidden items-center gap-1 xl:flex">{links.map((l) => <a key={l.href} href={l.href} className={linkCls}>{l.label}</a>)}</nav>
        <div className="flex items-center gap-2">
          <a href={`tel:${c.phone}`} className={cx(linkCls, 'max-2xl:hidden')}><Phone size={14} strokeWidth={1.5} className="me-2" /><span dir="ltr" className="tabular-nums">{c.phone}</span></a>
          <span className="max-sm:hidden"><Button variant="ghost" onClick={toggleLocale}>{t('langToggle')}</Button></span>
          <IconButton label={x.theme} icon={resolvedTheme === 'dark' ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />} onClick={toggleTheme} />
          {isAuthenticated && user ? (
            <AccountMenu label={x.account} name={user.fullName} detail={user.studentId ? <Identifier value={user.studentId} /> : user.email}>
              <MenuAction icon={<Ticket size={16} strokeWidth={1.5} />} onClick={() => setActiveView('customer')}>{t('myBookings')}</MenuAction>
              <MenuAction icon={<User size={16} strokeWidth={1.5} />} onClick={() => setActiveView('customer')}>{t('customerPortal')}</MenuAction>
              <MenuAction tone="destructive" icon={<LogOut size={16} strokeWidth={1.5} />} onClick={() => { void signOut(); }}>{t('signOut')}</MenuAction>
            </AccountMenu>
          ) : (
            <a href="/login" className={cx(linkCls, 'max-sm:hidden text-ink-primary')}>{t('logIn')}</a>
          )}
          <span className="max-sm:hidden"><Button onClick={onBook}>{t('bookYourSeat')}</Button></span>
          <span className="xl:hidden"><IconButton label={x.menu} aria-expanded={menu} icon={<Menu size={18} strokeWidth={1.5} />} onClick={() => setMenu(true)} /></span>
        </div>
      </div>
      <Drawer open={menu} onClose={() => setMenu(false)} title={x.menu} side={locale === 'ar' ? 'start' : 'end'}>
        <div className="flex flex-col gap-1">
          {links.map((l) => <a key={l.href} href={l.href} onClick={() => setMenu(false)} className={linkCls}>{l.label}</a>)}
          <div className="my-2 border-t border-line-default" />
          <Button variant="ghost" onClick={() => { toggleLocale(); setMenu(false); }} className="!justify-start">{t('langToggle')}</Button>
          {!isAuthenticated ? <><a href="/login" className={cx(linkCls, 'text-ink-primary')}>{t('logIn')}</a><a href="/register" className={cx(linkCls, 'text-ink-primary')}>{t('register')}</a></> : null}
          <Button fullWidth onClick={() => { onBook(); setMenu(false); }}>{t('bookYourSeat')}</Button>
        </div>
      </Drawer>
    </header>
  );
}

function SectionTitle({ id, title, text }: { id?: string; title: string; text?: string }) {
  return <div className="mb-6"><h2 id={id} className="text-2xl font-medium text-ink-primary">{title}</h2>{text ? <p className="mt-1 max-w-2xl text-ink-secondary">{text}</p> : null}</div>;
}

export interface PublicSiteMasarViewProps {
  routes: Route[]; trips: Trip[]; buses: Bus[]; stops: Stop[];
  origin: string; dest: string; date: string;
  onSearch: (originId: string, destId: string, date: string) => void;
  onSelectTrip: (t: Trip) => void; onViewDetails: (t: Trip) => void;
  children?: ReactNode;
}

/** The company's public page in the MASAR look. Loading, filtering and booking stay in PublicWebsite; this only draws. */
export function PublicSiteMasarView(p: PublicSiteMasarViewProps) {
  const { currentCompany: c } = useTenant();
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const x = J6C[locale];
  const [origin, setOrigin] = useState(p.origin || p.stops[0]?.id || '');
  const [dest, setDest] = useState(p.dest || p.stops[1]?.id || '');
  const [date, setDate] = useState(p.date);
  const cfg = c.publishedWebsiteConfig || c.websiteConfig;
  const pick = (en?: string, a?: string) => (ar ? a : en);
  const stopName = (s: Stop) => (ar ? s.nameAr : s.nameEn);
  const steps = [[t('step1SelectRoute'), t('howToBookStep1')], [t('step2EnterDetails'), t('howToBookStep2')], [t('step3BoardingPass'), t('howToBookStep3')]];
  const perkIcon = (i: string) => (i === 'wifi' ? <Wifi size={18} strokeWidth={1.5} /> : i === 'shield' ? <Shield size={18} strokeWidth={1.5} /> : <Clock size={18} strokeWidth={1.5} />);
  const tile = tenantAccent(c.primaryColor);
  return (
    <main className="bg-surface-page text-ink-primary">
      <section id="hero" aria-labelledby="ps-h" className="border-b border-line-default bg-surface-card">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {pick(cfg.heroNoticeEn, cfg.heroNoticeAr) ? <p className="mb-3 text-sm text-ink-secondary">{pick(cfg.heroNoticeEn, cfg.heroNoticeAr)}</p> : null}
          <h1 id="ps-h" className="max-w-3xl text-3xl font-medium sm:text-4xl">{pick(cfg.heroTitleEn, cfg.heroTitleAr)}</h1>
          <p className="mt-2 max-w-2xl text-ink-secondary">{pick(cfg.heroSubtitleEn, cfg.heroSubtitleAr)}</p>
          <form id="search" role="search" onSubmit={(e) => { e.preventDefault(); p.onSearch(origin, dest, date); }} className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_1fr_auto_auto] sm:items-end">
            <Field label={t('fromOrigin')}><Select size="lg" value={origin} onChange={(e) => setOrigin(e.target.value)}>{p.stops.map((s) => <option key={`o${s.id}`} value={s.id}>{stopName(s)}</option>)}</Select></Field>
            <span className="hidden sm:block"><Button variant="ghost" size="lg" aria-label={t('swapDirection')} onClick={() => { setOrigin(dest); setDest(origin); }} iconStart={<ArrowLeftRight size={16} strokeWidth={1.5} />} /></span>
            <Field label={t('toDestination')}><Select size="lg" value={dest} onChange={(e) => setDest(e.target.value)}>{p.stops.map((s) => <option key={`d${s.id}`} value={s.id}>{stopName(s)}</option>)}</Select></Field>
            <Field label={t('travelDate')}><DatePicker size="lg" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Button type="submit" size="lg" iconStart={<Search size={16} strokeWidth={1.5} />}>{t('searchTrips')}</Button>
          </form>
          <p className="mt-4 text-[13px] text-ink-muted">{t('licensedCoachFleet')} · {t('freeStudentWifi')} · {t('payOnBoarding')}</p>
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
        <section aria-labelledby="ps-t">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
            <div><h2 id="ps-t" className="text-2xl font-medium">{t('upcomingDepartures')}</h2><p className="mt-1 text-ink-secondary">{t('popularRoutesDesc')}</p></div>
            <p className="text-sm text-ink-secondary" aria-live="polite">{formatNumber(p.trips.length, locale)} {t('departures')}</p>
          </div>
          {p.trips.length === 0 ? (
            <EmptyState title={t('noTripsFound')} description={t('tryDifferentDate')} />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {p.trips.map((trip) => {
                const route = p.routes.find((r) => r.id === trip.routeId);
                const bus = p.buses.find((b) => b.id === trip.busId);
                const left = trip.totalSeats - trip.bookedSeats;
                return (
                  <li key={trip.id} className="min-w-0">
                    <TripCard
                      lang={locale}
                      operator={{ name: ar ? c.nameAr : c.nameEn, tile: tile ? { text: (c.logoText || c.nameEn).slice(0, 2).toUpperCase(), accent: tile.accent, onAccent: tile.onAccent } : undefined }}
                      departureText={formatClock(trip.departureTime, locale)}
                      arrivalText={formatClock(trip.arrivalTime, locale)}
                      durationMinutes={route?.durationMinutes}
                      seatsLeft={left}
                      lowSeats={left > 0 && left <= 8}
                      price={{ amount: trip.priceEgp, currency: 'EGP' }}
                      stops={route ? [{ name: ar ? route.originCityAr : route.originCityEn }, { name: ar ? route.destCityAr : route.destCityEn }] : undefined}
                      note={bus?.model}
                      seatsLeftLabel={(n) => `${n} ${t('seatsLeft')}`}
                      soldOutLabel={t('fullyBooked')}
                      action={<div className="flex gap-2"><Button variant="ghost" onClick={() => p.onViewDetails(trip)}>{t('viewDetails')}</Button><Button disabled={left <= 0} onClick={() => p.onSelectTrip(trip)}>{left <= 0 ? t('fullyBooked') : t('bookNow')}</Button></div>}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="routes" aria-labelledby="ps-r">
          <SectionTitle id="ps-r" title={t('popularRoutes')} text={`${t('dailyScheduledDirectLinks')} ${ar ? c.nameAr : c.nameEn}`} />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.routes.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-ds-md border border-line-default bg-surface-card p-4">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{ar ? r.originCityAr : r.originCityEn}</p><p className="truncate text-[13px] text-ink-secondary">{ar ? r.destCityAr : r.destCityEn} · {formatNumber(r.durationMinutes, locale)} {t('minDuration')}</p></div>
                <div className="shrink-0 text-end"><p className="text-[13px] text-ink-muted">{t('startingFrom')}</p><p className="text-base font-medium tabular-nums">{formatMoney(r.baseFareEgp, 'EGP', locale)}</p></div>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-to-book" aria-labelledby="ps-b">
          <SectionTitle id="ps-b" title={t('howToBook')} text={t('howToBookSubtitle')} />
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map(([title, text]) => (
              <li key={title} className="rounded-ds-md border border-line-default bg-surface-card p-5">
                <h3 className="mt-1 text-base font-medium">{title}</h3><p className="mt-1 text-sm text-ink-secondary">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {cfg.perks && cfg.perks.length > 0 ? (
          <section aria-labelledby="ps-p">
            <SectionTitle id="ps-p" title={x.perks} />
            <ul className="grid gap-4 md:grid-cols-3">
              {cfg.perks.map((k) => (
                <li key={k.id} className="rounded-ds-md border border-line-default bg-surface-card p-5">
                  <span aria-hidden="true" className="mb-3 flex size-9 items-center justify-center rounded-ds-sm bg-surface-sunken text-ink-secondary">{perkIcon(k.icon)}</span>
                  <h3 className="text-base font-medium">{pick(k.titleEn, k.titleAr)}</h3><p className="mt-1 text-sm text-ink-secondary">{pick(k.descEn, k.descAr)}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {cfg.faqs && cfg.faqs.length > 0 ? (
          <section id="faqs" aria-labelledby="ps-f" className="max-w-3xl">
            <SectionTitle id="ps-f" title={t('faqsTitle')} />
            <div className="divide-y divide-line-default rounded-ds-md border border-line-default bg-surface-card">
              {cfg.faqs.map((f) => (
                <details key={f.id} className="group p-4">
                  <summary className={cx('flex cursor-pointer list-none items-center justify-between gap-3 rounded-ds-sm text-sm font-medium', FOCUS)}>{pick(f.qEn, f.qAr)}<span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-45">+</span></summary>
                  <p className="mt-2 text-sm text-ink-secondary">{pick(f.aEn, f.aAr)}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      {p.children}
    </main>
  );
}

export function PublicFooterMasar() {
  const { currentCompany: c } = useTenant();
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const x = J6C[locale];
  const line = (icon: ReactNode, text: ReactNode) => <li className="flex items-start gap-2">{icon}<span className="min-w-0 break-words">{text}</span></li>;
  return (
    <>
      <section aria-label={x.contact} className="border-t border-line-default bg-surface-card">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3 lg:px-8">
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-base font-medium"><CompanyMark company={c} />{ar ? c.nameAr : c.nameEn}</p>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-secondary">
              {line(<MapPin size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />, ar ? c.supportAddressAr : c.supportAddressEn)}
              {line(<Phone size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />, <span dir="ltr" className="tabular-nums">{c.phone}</span>)}
              {line(<Mail size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />, c.email)}
            </ul>
          </div>
          <div><h2 className="text-sm font-medium">{x.routesHeading}</h2><ul className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary"><li>{t('cairoGalala')}</li><li>{t('newCairoGalala')}</li><li>{t('suezGalala')}</li><li>{t('ismailiaGalala')}</li><li>{t('alexGalala')}</li></ul></div>
          <div><h2 className="text-sm font-medium">{x.policies}</h2><ul className="mt-3 flex flex-col gap-2 text-sm text-ink-secondary"><li>{t('studentDiscount15')}</li><li>{t('freeLuggage25kg')}</li><li>{t('cancellation3hrs')}</li><li>{t('cashAndPosPayments')}</li></ul></div>
        </div>
      </section>
      <QuietFooter credit={x.poweredBy}>© {formatYear(new Date(), locale)} {ar ? c.nameAr : c.nameEn}. {t('allRightsReserved')}</QuietFooter>
    </>
  );
}
