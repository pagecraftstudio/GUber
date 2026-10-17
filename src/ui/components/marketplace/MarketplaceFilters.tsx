import React from 'react';
import { Company, MarketplaceSearchParams } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Filter, SlidersHorizontal, RotateCcw, X } from 'lucide-react';

interface MarketplaceFiltersProps {
  companies: Company[];
  params: MarketplaceSearchParams;
  onChange: (updated: Partial<MarketplaceSearchParams>) => void;
  onReset: () => void;
  totalResultsCount: number;
}

export const MarketplaceFilters: React.FC<MarketplaceFiltersProps> = ({
  companies,
  params,
  onChange,
  onReset,
  totalResultsCount,
}) => {
  const { locale, t } = useLocale();

  // Calculate active filter count
  let activeFilterCount = 0;
  if (params.companyId) activeFilterCount++;
  if (params.timeOfDay && params.timeOfDay !== 'all') activeFilterCount++;
  if (params.maxPrice && params.maxPrice < 300) activeFilterCount++;
  if (params.minAvailableSeats && params.minAvailableSeats > 1) activeFilterCount++;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-5">
      {/* Header with Active Filters Counter & Reset */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#3563E9]" />
          <span className="font-bold text-slate-900 text-sm">{t('filter')}</span>
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-50 text-[#3563E9] text-[10px] font-bold border border-blue-200">
              {activeFilterCount}
            </span>
          )}
          <span className="text-xs text-slate-400 font-normal">
            ({totalResultsCount} {t('results')})
          </span>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={onReset}
            className="text-xs text-[#3563E9] hover:underline flex items-center gap-1 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t('reset')}</span>
          </button>
        )}
      </div>

      {/* 1. Sort Order */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {t('sortBy')}
        </label>
        <select
          value={params.sortBy || 'time_asc'}
          onChange={(e) => onChange({ sortBy: e.target.value as any })}
          className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
        >
          <option value="time_asc">{t('timeEarliest')}</option>
          <option value="time_desc">{t('timeLatest')}</option>
          <option value="price_asc">{t('priceLowest')}</option>
          <option value="price_desc">{t('priceHighest')}</option>
        </select>
      </div>

      {/* 2. Filter by Company */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {t('filterByCompany')}
        </label>
        <select
          value={params.companyId || ''}
          onChange={(e) => onChange({ companyId: e.target.value || undefined })}
          className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
        >
          <option value="">{t('allOperators')}</option>
          {companies
            .filter((c) => c.status === 'active' && c.marketplaceListed)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {locale === 'ar' ? c.nameAr : c.nameEn}
              </option>
            ))}
        </select>
      </div>

      {/* 3. Filter by Time of Day */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {t('departureTimeOfDay')}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { id: 'all', label: t('allDay') },
            { id: 'morning', label: t('morning') },
            { id: 'afternoon', label: t('afternoon') },
            { id: 'evening', label: t('evening') },
          ].map((slot) => {
            const active = (params.timeOfDay || 'all') === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => onChange({ timeOfDay: slot.id as any })}
                className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-center ${
                  active
                    ? 'bg-[#14243A] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {slot.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Filter by Max Price */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <label className="font-bold text-slate-700">{t('priceRange')}</label>
          <span className="font-semibold text-slate-900 tabular-nums">
            {params.maxPrice && params.maxPrice < 300 ? `${params.maxPrice} ${t('egp')}` : t('anyPrice')}
          </span>
        </div>
        <input
          type="range"
          min="80"
          max="300"
          step="10"
          value={params.maxPrice || 300}
          onChange={(e) => onChange({ maxPrice: parseInt(e.target.value, 10) })}
          className="w-full accent-[#3563E9] cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 tabular-nums">
          <span>80 {t('egp')}</span>
          <span>300 {t('egp')}</span>
        </div>
      </div>

      {/* 5. Filter by Min Available Seats */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {t('minAvailableCapacity')}
        </label>
        <select
          value={params.minAvailableSeats || 1}
          onChange={(e) => onChange({ minAvailableSeats: parseInt(e.target.value, 10) })}
          className="w-full text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
        >
          <option value="1">{t('minSeats1')}</option>
          <option value="3">{t('minSeats3')}</option>
          <option value="5">{t('minSeats5')}</option>
          <option value="10">{t('minSeats10')}</option>
        </select>
      </div>
    </div>
  );
};
