import React from 'react';
import { Company, MarketplaceTripItem } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Phone, Mail, MapPin, Star, ShieldCheck, Bus, ExternalLink, Calendar } from 'lucide-react';

interface CompanyProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company | null;
  companyTrips: MarketplaceTripItem[];
  onBookTrip: (trip: MarketplaceTripItem) => void;
}

export const CompanyProfileModal: React.FC<CompanyProfileModalProps> = ({
  isOpen,
  onClose,
  company,
  companyTrips,
  onBookTrip,
}) => {
  const { locale, t } = useLocale();
  const { navigateToCompanyPublicSite } = useTenant();

  if (!company) return null;

  const brandName = locale === 'ar' ? company.nameAr : company.nameEn;
  const tagline = locale === 'ar' ? company.taglineAr : company.taglineEn;
  const address = locale === 'ar' ? company.supportAddressAr : company.supportAddressEn;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={brandName}
      subtitle={tagline}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            icon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => {
              onClose();
              navigateToCompanyPublicSite(company.id);
            }}
          >
            {t('viewCompanyPortal')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('close')}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Company Header Card */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-base font-bold shadow-xs shrink-0"
              style={{ backgroundColor: company.primaryColor }}
            >
              <Bus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">{brandName}</h4>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{company.rating || 4.8}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{company.email}</p>
            </div>
          </div>

          <div className="text-xs text-slate-600 space-y-1 sm:text-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
            <div className="flex sm:justify-end items-center gap-1.5">
              <Phone className="w-3 h-3 text-slate-400" />
              <span dir="ltr" className="font-mono tabular-nums">{company.phone}</span>
            </div>
            <div className="flex sm:justify-end items-center gap-1.5 text-slate-500 text-[11px]">
              <MapPin className="w-3 h-3 text-slate-400" />
              <span>{address}</span>
            </div>
          </div>
        </div>

        {/* Operating Departures */}
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            {t('publishedDepartures')} ({companyTrips.length})
          </h4>

          {companyTrips.length === 0 ? (
            <p className="text-xs text-slate-500 p-4 text-center bg-white rounded-lg border border-slate-200">
              {t('noActiveDepartures')}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pe-1">
              {companyTrips.map((tr) => (
                <div
                  key={tr.id}
                  className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs hover:border-slate-300"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {locale === 'ar' ? tr.originLocationNameAr : tr.originLocationNameEn} →{' '}
                      {locale === 'ar' ? tr.destLocationNameAr : tr.destLocationNameEn}
                    </div>
                    <div className="text-slate-500 text-[11px] mt-0.5 flex items-center gap-1.5">
                      <span>{tr.departureTime} - {tr.arrivalTime}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{tr.availableSeats} {t('seatsLeft')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 tabular-nums">
                      {tr.priceEgp} {t('egp')}
                    </span>
                    <Button
                      size="sm"
                      disabled={tr.isFullyBooked}
                      onClick={() => {
                        onClose();
                        onBookTrip(tr);
                      }}
                    >
                      {tr.isFullyBooked ? t('fullyBooked') : t('bookNow')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
