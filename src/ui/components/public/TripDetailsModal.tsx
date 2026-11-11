import React from 'react';
import { Trip, Route, Bus, Driver, Stop } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Clock, MapPin, ShieldCheck, Bus as BusIcon, Wifi, Wind, Zap, Briefcase } from 'lucide-react';

interface TripDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip | null;
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  stops: Stop[];
  onBookNow: (trip: Trip) => void;
}

export const TripDetailsModal: React.FC<TripDetailsModalProps> = ({
  isOpen,
  onClose,
  trip,
  routes,
  buses,
  drivers,
  stops,
  onBookNow,
}) => {
  const { locale, t } = useLocale();

  if (!trip) return null;

  const route = routes.find((r) => r.id === trip.routeId);
  const bus = buses.find((b) => b.id === trip.busId);
  const driver = drivers.find((d) => d.id === trip.driverId);
  const originStop = stops.find((s) => s.id === route?.originStopId);
  const destStop = stops.find((s) => s.id === route?.destStopId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={locale === 'ar' ? `${route?.originCityAr} ← ${route?.destCityAr}` : `${route?.originCityEn} → ${route?.destCityEn}`}
      subtitle={`${trip.departureDate} · ${trip.departureTime}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            <span className="text-xs text-slate-500 block">{t('totalToPay')}</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">
              {trip.priceEgp} {t('egp')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onClose();
                onBookNow(trip);
              }}
            >
              {t('bookNow')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Route Stops Timeline */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            {t('routeTimeline')}
          </h4>

          <div className="space-y-4 relative before:absolute before:top-2 before:bottom-2 before:start-2.5 before:w-0.5 before:bg-slate-300">
            {/* Origin Stop */}
            <div className="flex items-start gap-3 relative">
              <div className="w-5 h-5 rounded-full bg-[#3563E9] text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10">
                A
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {locale === 'ar' ? originStop?.nameAr : originStop?.nameEn}
                </div>
                <div className="text-[11px] text-slate-500">
                  {locale === 'ar' ? originStop?.landmarkAr : originStop?.landmarkEn}
                </div>
                <div className="text-[11px] text-[#3563E9] font-medium mt-0.5">
                  {t('departureLabel')}: {trip.departureTime}
                </div>
              </div>
            </div>

            {/* Destination Stop */}
            <div className="flex items-start gap-3 relative">
              <div className="w-5 h-5 rounded-full bg-[#0F9D8A] text-white flex items-center justify-center text-[10px] font-bold shrink-0 z-10">
                B
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  {locale === 'ar' ? destStop?.nameAr : destStop?.nameEn}
                </div>
                <div className="text-[11px] text-slate-500">
                  {locale === 'ar' ? destStop?.landmarkAr : destStop?.landmarkEn}
                </div>
                <div className="text-[11px] text-[#0F9D8A] font-medium mt-0.5">
                  {t('estArrival')}: {trip.arrivalTime} ({route?.durationMinutes} {t('minDuration')})
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coach & Driver Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
              <BusIcon className="w-4 h-4 text-slate-500" />
              <span>{t('assignedCoach')}</span>
            </div>
            <p className="text-xs font-medium text-slate-900">{bus?.model}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
              {t('licensePlateLabel')} {bus?.plateNumber} · {bus?.capacity} {t('seats')}
            </p>
          </div>

          <div className="p-3.5 bg-white rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-1">
              <ShieldCheck className="w-4 h-4 text-[#0F9D8A]" />
              <span>{t('vettedCaptain')}</span>
            </div>
            <p className="text-xs font-medium text-slate-900">
              {locale === 'ar' ? driver?.fullNameAr : driver?.fullNameEn}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ★ {driver?.rating} · {t('galalaCertified')}
            </p>
          </div>
        </div>

        {/* Coach Amenities & Baggage Policy */}
        <div className="border-t border-slate-200 pt-3">
          <h4 className="text-xs font-bold text-slate-700 mb-2">{t('amenitiesRules')}</h4>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-[#3563E9]" />
              {t('highSpeedWifi')}
            </span>
            <span className="flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-slate-500" />
              {t('climateAc')}
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              {t('usbPorts')}
            </span>
            <span className="flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-slate-500" />
              {t('luggagePolicy')}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
