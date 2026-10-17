import React from 'react';
import { MarketplaceTripItem } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Button } from '../common/Button';
import { Clock, Users, Wifi, Wind, Zap, Building2, MapPin, AlertCircle } from 'lucide-react';
import { isMockMode } from '../../lib/runtime';

interface MarketplaceTripCardProps {
  trip: MarketplaceTripItem;
  onViewOperator: (companyId: string) => void;
  onBookTrip: (trip: MarketplaceTripItem) => void;
}

export const MarketplaceTripCard: React.FC<MarketplaceTripCardProps> = ({
  trip,
  onViewOperator,
  onBookTrip,
}) => {
  const { locale, t } = useLocale();

  const isLowCapacity = trip.availableSeats > 0 && trip.availableSeats <= 6;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-4">
      <div>
        {/* Operator Header Strip */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-xs"
              style={{ backgroundColor: trip.companyPrimaryColor }}
            >
              {trip.companyLogoText.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <button
                onClick={() => onViewOperator(trip.companyId)}
                className="text-xs font-bold text-slate-900 hover:text-[#3563E9] truncate text-start cursor-pointer transition-colors block"
              >
                {locale === 'ar' ? trip.companyNameAr : trip.companyNameEn}
              </button>
              {isMockMode() && process.env.NODE_ENV !== 'production' && (
                <span className="text-[10px] text-slate-400 font-medium block">
                  {locale === 'ar' ? 'مشغل معتمد (تجريبي)' : 'Licensed Partner (Demo)'}
                </span>
              )}
            </div>
          </div>

          <div className="text-end shrink-0">
            <span className="text-2xl font-black text-[#14243A] tabular-nums">
              {trip.priceEgp}
            </span>
            <span className="text-xs text-slate-500 ms-1 font-semibold">{t('egp')}</span>
          </div>
        </div>

        {/* Route Details & Timing */}
        <div className="pt-3.5 space-y-3.5">
          <div className="flex items-start justify-between gap-4">
            {/* Origin */}
            <div className="min-w-0 flex-1">
              <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
                {t('departureLabel')}
              </span>
              <div className="text-lg font-bold text-slate-900 tabular-nums leading-snug">
                {trip.departureTime}
              </div>
              <span className="text-xs font-semibold text-slate-800 block truncate mt-0.5">
                {locale === 'ar' ? trip.originLocationNameAr : trip.originLocationNameEn}
              </span>
              <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">{locale === 'ar' ? trip.originStopNameAr : trip.originStopNameEn}</span>
              </span>
            </div>

            {/* Travel Line Indicator */}
            <div className="flex flex-col items-center justify-center px-2 shrink-0 pt-2">
              <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                {trip.durationMinutes} {t('minDuration')}
              </span>
              <div className="w-16 h-0.5 bg-slate-200 my-1.5 relative">
                <div className="w-2 h-2 rounded-full bg-[#3563E9] absolute -top-0.75 end-0" />
              </div>
              <span className="text-[10px] text-[#0F9D8A] font-semibold">{t('direct')}</span>
            </div>

            {/* Destination */}
            <div className="min-w-0 flex-1 text-end">
              <span className="text-xs text-slate-400 uppercase tracking-wider block font-medium">
                {t('estArrival')}
              </span>
              <div className="text-lg font-bold text-slate-900 tabular-nums leading-snug">
                {trip.arrivalTime}
              </div>
              <span className="text-xs font-semibold text-[#0F9D8A] block truncate mt-0.5">
                {locale === 'ar' ? trip.destLocationNameAr : trip.destLocationNameEn}
              </span>
              <span className="text-[11px] text-slate-500 flex items-center justify-end gap-1 mt-0.5 truncate">
                <span className="truncate">{locale === 'ar' ? trip.destStopNameAr : trip.destStopNameEn}</span>
                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              </span>
            </div>
          </div>

          {/* Unboxed Metadata (Zero-pill discipline) */}
          <div className="bg-slate-50/90 rounded-lg p-3 border border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="truncate font-medium">{trip.busModel}</span>

            <div className="flex items-center gap-3">
              {trip.isFullyBooked ? (
                <span className="font-bold text-red-600 flex items-center gap-1 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{t('soldOut')}</span>
                </span>
              ) : (
                <span
                  className={`tabular-nums font-semibold ${
                    isLowCapacity ? 'text-amber-600' : 'text-emerald-700'
                  }`}
                >
                  {trip.availableSeats} {t('seatsAvailable')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => onViewOperator(trip.companyId)}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
        >
          {t('operatorProfile')}
        </button>

        <Button
          size="md"
          disabled={trip.isFullyBooked}
          onClick={() => onBookTrip(trip)}
          style={
            !trip.isFullyBooked && trip.companyAccentColor
              ? { backgroundColor: trip.companyAccentColor }
              : undefined
          }
          className="px-5 font-semibold"
        >
          {trip.isFullyBooked ? t('fullyBooked') : t('bookNow')}
        </Button>
      </div>
    </div>
  );
};
