import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { Stop } from '../../types';
import { Button } from '../common/Button';
import { MapPin, Calendar, Search, ArrowRightLeft, ShieldCheck, Wifi, Award } from 'lucide-react';
import { demoDate, demoDestStopId } from '../../lib/demoDefaults';

interface HeroTripSearchProps {
  stops: Stop[];
  onSearch: (originId: string, destId: string, date: string) => void;
  selectedOrigin: string;
  selectedDest: string;
  selectedDate: string;
}

export const HeroTripSearch: React.FC<HeroTripSearchProps> = ({
  stops,
  onSearch,
  selectedOrigin,
  selectedDest,
  selectedDate,
}) => {
  const { currentCompany } = useTenant();
  const { locale, t } = useLocale();

  const [origin, setOrigin] = useState(selectedOrigin || 'stop_gc_cairo_nasr_city');
  const [dest, setDest] = useState(selectedDest || demoDestStopId());
  const [date, setDate] = useState(selectedDate || demoDate());

  const config = currentCompany.publishedWebsiteConfig || currentCompany.websiteConfig;
  const heroTitle = locale === 'ar' ? config.heroTitleAr : config.heroTitleEn;
  const heroSubtitle = locale === 'ar' ? config.heroSubtitleAr : config.heroSubtitleEn;
  const heroNotice = locale === 'ar' ? config.heroNoticeAr : config.heroNoticeEn;

  const handleSwap = () => {
    const temp = origin;
    setOrigin(dest);
    setDest(temp);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(origin, dest, date);
  };

  return (
    <section id="hero" className="relative bg-[#14243A] text-white overflow-hidden">
      {/* Background Media with Contrast Scrim */}
      <div className="absolute inset-0 z-0">
        <img
          src="/src/assets/images/galala_bus_hero_1791912383732.jpg"
          alt="Galala University Coach Bus"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-102"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#14243A]/95 via-[#14243A]/85 to-[#14243A]/60" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Top Announcement / Notice */}
        {heroNotice && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs text-white/95 mb-6">
            <Award className="w-3.5 h-3.5 text-amber-300" />
            <span className="font-medium">{heroNotice}</span>
          </div>
        )}

        {/* Hero Title & Subtitle */}
        <div className="max-w-3xl mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white text-balance leading-tight">
            {heroTitle}
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200 text-pretty leading-relaxed">
            {heroSubtitle}
          </p>
        </div>

        {/* Trip Search Card */}
        <div id="search" className="bg-white rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-100 text-slate-900 max-w-4xl">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-end">
            {/* Origin Stop */}
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
                {stops.map((s) => (
                  <option key={`orig_${s.id}`} value={s.id}>
                    {locale === 'ar' ? s.nameAr : s.nameEn}
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

            {/* Destination Stop */}
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#0F9D8A]" />
                <span>{t('toDestination')}</span>
              </label>
              <select
                aria-label={t('toDestination')}
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3563E9] cursor-pointer"
              >
                {stops.map((s) => (
                  <option key={`dest_${s.id}`} value={s.id}>
                    {locale === 'ar' ? s.nameAr : s.nameEn}
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

            {/* Submit Button */}
            <div className="sm:col-span-12 flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0F9D8A]" />
                  <span>{t('licensedCoachFleet')}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5 text-[#3563E9]" />
                  <span>{t('freeStudentWifi')}</span>
                </span>
                <span aria-hidden="true">·</span>
                <span>{t('payOnBoarding')}</span>
              </div>

              <Button
                type="submit"
                size="md"
                icon={<Search className="w-4 h-4" />}
                className="w-full sm:w-auto"
                style={{ backgroundColor: currentCompany.accentColor || '#3563E9' }}
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
