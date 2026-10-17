import React from 'react';
import { Route, Trip, Bus } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { Button } from '../common/Button';
import { Clock, Users, ArrowRight, CheckCircle2, Wifi, Wind, Zap } from 'lucide-react';

interface RouteCardGridProps {
  routes: Route[];
  trips: Trip[];
  buses: Bus[];
  onSelectTrip: (trip: Trip) => void;
  onViewDetails: (trip: Trip) => void;
}

export const RouteCardGrid: React.FC<RouteCardGridProps> = ({
  routes,
  trips,
  buses,
  onSelectTrip,
  onViewDetails,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  return (
    <div className="space-y-12 py-12">
      {/* 1. Scheduled Trips Available for Booking */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {t('upcomingDepartures')}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {t('popularRoutesDesc')}
            </p>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            {t('showing')} <strong className="text-slate-900">{trips.length}</strong> {t('departures')}
          </span>
        </div>

        {trips.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
            <p className="text-sm font-semibold text-slate-800">{t('noTripsFound')}</p>
            <p className="text-xs text-slate-500 mt-1">{t('tryDifferentDate')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {trips.map((trip) => {
              const route = routes.find((r) => r.id === trip.routeId);
              const bus = buses.find((b) => b.id === trip.busId);
              const availableSeats = trip.totalSeats - trip.bookedSeats;
              const almostFull = availableSeats > 0 && availableSeats <= 8;

              return (
                <div
                  key={trip.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Top origin/destination & price */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="text-xs text-slate-500 font-medium">
                          {locale === 'ar' ? route?.originCityAr : route?.originCityEn}
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                          <span>{locale === 'ar' ? route?.destCityAr : route?.destCityEn}</span>
                        </div>
                      </div>

                      <div className="text-end">
                        <span className="text-xl font-bold text-[#14243A] tabular-nums">
                          {trip.priceEgp}
                        </span>
                        <span className="text-xs text-slate-500 ms-1">{t('egp')}</span>
                      </div>
                    </div>

                    {/* Timeline & departure */}
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-4">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <Clock className="w-3.5 h-3.5 text-[#3563E9]" />
                          <span className="tabular-nums">{trip.departureTime}</span>
                          <span className="text-slate-400 font-normal">{locale === 'ar' ? '←' : '→'}</span>
                          <span className="tabular-nums">{trip.arrivalTime}</span>
                        </div>
                        <span className="text-slate-500 tabular-nums font-medium">
                          {route?.durationMinutes} {t('minDuration')}
                        </span>
                      </div>

                      {/* Unboxed Metadata (Zero-pill discipline) */}
                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate max-w-[140px]">{bus?.model || 'Coach 50'}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`tabular-nums font-medium ${almostFull ? 'text-amber-600' : 'text-slate-600'}`}>
                          {availableSeats} {t('seatsLeft')}
                        </span>
                      </div>
                    </div>

                    {/* Amenities subtle text */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3 text-slate-400" />
                        Wi-Fi
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="flex items-center gap-1">
                        <Wind className="w-3 h-3 text-slate-400" />
                        AC
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-slate-400" />
                        USB
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 mt-4">
                    <button
                      onClick={() => onViewDetails(trip)}
                      className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {t('viewDetails')}
                    </button>
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={availableSeats <= 0}
                      onClick={() => onSelectTrip(trip)}
                      style={availableSeats > 0 && currentCompany.accentColor ? { backgroundColor: currentCompany.accentColor } : undefined}
                    >
                      {availableSeats <= 0 ? t('fullyBooked') : t('bookNow')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Popular Routes Showcase */}
      <div id="routes" className="pt-6 border-t border-slate-200">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {t('popularRoutes')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mb-6">
          {t('dailyScheduledDirectLinks')} {locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn}.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes.slice(0, 6).map((route) => (
            <div
              key={route.id}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-xs transition-shadow flex items-center justify-between"
            >
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {locale === 'ar' ? route.originCityAr : route.originCityEn}
                </h4>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <span>{locale === 'ar' ? route.destCityAr : route.destCityEn}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{route.durationMinutes} {t('minDuration')}</span>
                </div>
              </div>

              <div className="text-end ps-3">
                <span className="text-xs text-slate-400 block">{t('startingFrom')}</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {route.baseFareEgp} {t('egp')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
