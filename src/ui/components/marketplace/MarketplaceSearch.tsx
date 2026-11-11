import React, { useState } from 'react';
import { CanonicalLocation } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Button } from '../common/Button';
import { MapPin, Calendar, Search, ArrowRightLeft, Info, Sparkles, Building2, Clock } from 'lucide-react';
import { isMockMode } from '../../lib/runtime';
import { demoDate, demoDestLocationId, quickDates } from '../../lib/demoDefaults';

interface MarketplaceSearchProps {
  locations: CanonicalLocation[];
  selectedOriginId: string;
  selectedDestId: string;
  selectedDate: string;
  onSearch: (originId: string, destId: string, date: string) => void;
}

export const MarketplaceSearch: React.FC<MarketplaceSearchProps> = ({
  locations,
  selectedOriginId,
  selectedDestId,
  selectedDate,
  onSearch,
}) => {
  const { locale, t } = useLocale();

  const [origin, setOrigin] = useState(selectedOriginId || '');
  const [dest, setDest] = useState(selectedDestId || demoDestLocationId());
  const [date, setDate] = useState(selectedDate || demoDate());

  const handleSwap = () => {
    const temp = origin;
    setOrigin(dest);
    setDest(temp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(origin, dest, date);
  };

  const handleQuickDate = (d: string) => {
    setDate(d);
    onSearch(origin, dest, d);
  };

  return (
    <section id="search-section" className="relative bg-[#14243A] text-white overflow-hidden py-12 sm:py-16">
      {/* Background Graphic with Contrast Scrim */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img
          src="/src/assets/images/galala_bus_hero_1791912383732.jpg"
          alt="Galala Transit Network"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#14243A]/90 via-[#14243A] to-[#14243A]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Simulated-data disclosure: development mock only */}
        {isMockMode() && (
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-slate-300 text-xs mb-6 backdrop-blur-xs">
          <Info className="w-3.5 h-3.5 shrink-0 text-[#3563E9]" />
          <span>{t('demoDisclaimer')}</span>
        </div>
        )}

        {/* Hero Title & Subtitle */}
        <div className="max-w-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {t('marketplaceHeroTitle')}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
            {t('marketplaceHeroSubtitle')}
          </p>
        </div>

        {/* Transportation Booking Search Card */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-100 text-slate-900 max-w-5xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end">
              {/* Origin Location */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#3563E9]" />
                  <span>{t('fromOrigin')}</span>
                </label>
                <select
                  aria-label={t('fromOrigin')}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
                >
                  <option value="">{t('allOriginCitiesOption')}</option>
                  {locations
                    .filter((loc) => !loc.isUniversityHub)
                    .map((loc) => (
                      <option key={`orig_${loc.id}`} value={loc.id}>
                        {locale === 'ar' ? loc.nameAr : loc.nameEn}
                      </option>
                    ))}
                </select>
              </div>

              {/* Swap Button */}
              <div className="hidden sm:flex sm:col-span-1 items-center justify-center pb-2">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="p-2 rounded-full border border-slate-200 text-slate-500 hover:text-[#3563E9] hover:bg-slate-50 transition-colors cursor-pointer"
                  title={t('swapDirection')}
                  aria-label={t('swapDirection')}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Destination Location */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0F9D8A]" />
                  <span>{t('toDestination')}</span>
                </label>
                <select
                  aria-label={t('toDestination')}
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
                >
                  <option value="">{t('allDestinationsOption')}</option>
                  {locations.map((loc) => (
                    <option key={`dest_${loc.id}`} value={loc.id}>
                      {locale === 'ar' ? loc.nameAr : loc.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Travel Date */}
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>{t('travelDate')}</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
                />
              </div>
            </div>

            {/* Quick Date Shortcuts & Search Action */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                  {locale === 'ar' ? 'مواعيد سريعة:' : 'Quick Dates:'}
                </span>
                {quickDates().map((q) => (
                  <button
                    key={q.iso}
                    type="button"
                    onClick={() => handleQuickDate(q.iso)}
                    className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                      date === q.iso
                        ? 'bg-[#14243A] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {locale === 'ar' ? q.label.ar : q.label.en}
                  </button>
                ))}
              </div>

              <Button
                type="submit"
                size="md"
                icon={<Search className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                {t('searchTrips')}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};
