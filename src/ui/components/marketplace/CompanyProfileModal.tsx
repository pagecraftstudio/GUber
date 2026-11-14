'use client';
import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { Button } from '@/ds/primitives/Button';
import { Modal } from '@/ds/feedback/Dialog';
import { EmptyState } from '@/ds/feedback/States';
import { formatMoney, formatNumber } from '@/ds/format';
import { tenantAccent } from '@/ds/contrast';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import type { Company, MarketplaceTripItem } from '../../types';

interface CompanyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  companyTrips: MarketplaceTripItem[];
  onBookTrip: (trip: MarketplaceTripItem) => void;
}

/** A company's card on the marketplace: contact details and its published departures. */
export function CompanyProfileModal({ isOpen, onClose, company, companyTrips, onBookTrip }: CompanyProfileModalProps) {
  const { locale, t } = useLocale();
  const { navigateToCompanyPublicSite } = useTenant();
  if (!company) return null;
  const ar = locale === 'ar';
  const brand = ar ? company.nameAr : company.nameEn;
  const tint = tenantAccent(company.primaryColor);
  const initials = (company.logoText || company.nameEn).slice(0, 2).toUpperCase();
  return (
    <Modal
      open={isOpen} onClose={onClose} title={brand} subtitle={ar ? company.taglineAr : company.taglineEn} size="lg"
      footer={<>
        <Button variant="secondary" iconStart={<ExternalLink size={16} strokeWidth={1.5} />} onClick={() => { onClose(); navigateToCompanyPublicSite(company.id); }}>{t('viewCompanyPortal')}</Button>
        <Button onClick={onClose}>{t('close')}</Button>
      </>}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-ds-md border border-line-default bg-surface-sunken p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-ds-sm text-sm font-medium" style={{ background: tint?.accent ?? 'var(--ds-action-primary)', color: tint?.onAccent ?? 'var(--ds-action-on-primary)' }}>{initials}</span>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{brand}</p><p className="truncate text-[13px] text-ink-secondary" dir="ltr">{company.email}</p></div>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-ink-secondary">
            <li className="flex items-center gap-2"><Phone size={14} strokeWidth={1.5} aria-hidden="true" /><span dir="ltr" className="tabular-nums">{company.phone}</span></li>
            <li className="flex items-center gap-2"><MapPin size={14} strokeWidth={1.5} aria-hidden="true" /><span>{ar ? company.supportAddressAr : company.supportAddressEn}</span></li>
          </ul>
        </div>
        <section aria-labelledby="cp-d">
          <h3 id="cp-d" className="mb-3 text-base font-medium">{t('publishedDepartures')} ({formatNumber(companyTrips.length, locale)})</h3>
          {companyTrips.length === 0 ? (
            <EmptyState title={t('noActiveDepartures')} />
          ) : (
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {companyTrips.map((tr) => (
                <li key={tr.id} className="flex flex-wrap items-center justify-between gap-3 rounded-ds-md border border-line-default p-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{ar ? tr.originLocationNameAr : tr.originLocationNameEn} {ar ? '←' : '→'} {ar ? tr.destLocationNameAr : tr.destLocationNameEn}</p>
                    <p className="text-[13px] text-ink-secondary tabular-nums">{tr.departureTime} – {tr.arrivalTime} · {formatNumber(tr.availableSeats, locale)} {t('seatsLeft')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">{formatMoney(tr.priceEgp, 'EGP', locale)}</span>
                    <Button disabled={tr.isFullyBooked} onClick={() => { onClose(); onBookTrip(tr); }}>{tr.isFullyBooked ? t('fullyBooked') : t('bookNow')}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
