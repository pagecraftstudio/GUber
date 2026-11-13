'use client';
import { Briefcase, Wifi, Wind, Zap } from 'lucide-react';
import { Button } from '@/ds/primitives/Button';
import { Modal } from '@/ds/feedback/Dialog';
import { KeyValue } from '@/ds/data/Layout';
import { RouteLine } from '@/ds/domain/RouteLine';
import { formatClock, formatDuration, formatMoney } from '@/ds/format';
import { useLocale } from '../../context/LocaleContext';
import type { Bus, Driver, Route, Stop, Trip } from '../../types';
import { J6C } from './text6c';

export interface TripDetailsMasarViewProps {
  isOpen: boolean; onClose: () => void; trip: Trip;
  route?: Route; bus?: Bus; driver?: Driver; originStop?: Stop; destStop?: Stop;
  onBookNow: (t: Trip) => void;
}

/** Trip details in the MASAR dialog. Same data and the same single action as the old modal. */
export function TripDetailsMasarView(p: TripDetailsMasarViewProps) {
  const { locale, t } = useLocale();
  const ar = locale === 'ar';
  const x = J6C[locale];
  const { trip, route, bus, driver } = p;
  const nm = (s?: Stop) => (s ? (ar ? s.nameAr : s.nameEn) : '');
  const land = (s?: Stop) => (s ? (ar ? s.landmarkAr : s.landmarkEn) : undefined);
  const title = route ? `${ar ? route.originCityAr : route.originCityEn} ${ar ? '←' : '→'} ${ar ? route.destCityAr : route.destCityEn}` : t('tripDetails' as never);
  return (
    <Modal
      open={p.isOpen} onClose={p.onClose} title={title} subtitle={`${trip.departureDate} · ${formatClock(trip.departureTime, locale)}`} size="lg"
      footer={<>
        <p className="me-auto text-start"><span className="block text-[13px] text-ink-muted">{t('totalToPay')}</span><span className="text-lg font-medium tabular-nums">{formatMoney(trip.priceEgp, 'EGP', locale)}</span></p>
        <Button variant="secondary" onClick={p.onClose}>{t('cancel')}</Button>
        <Button onClick={() => { p.onClose(); p.onBookNow(trip); }}>{t('bookNow')}</Button>
      </>}
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="td-s">
          <h3 id="td-s" className="mb-3 text-base font-medium">{x.stopsHeading}</h3>
          <RouteLine stops={[
            { name: [nm(p.originStop) || (ar ? route?.originCityAr : route?.originCityEn), land(p.originStop)].filter(Boolean).join(' · '), time: formatClock(trip.departureTime, locale) },
            { name: [nm(p.destStop) || (ar ? route?.destCityAr : route?.destCityEn), land(p.destStop)].filter(Boolean).join(' · '), time: formatClock(trip.arrivalTime, locale) },
          ]} />
          {route ? <p className="mt-2 text-[13px] text-ink-muted">{t('estArrival')} · {formatDuration(route.durationMinutes, locale)}</p> : null}

        </section>
        <KeyValue items={[
          { label: x.coach, value: bus ? `${bus.model} · ${bus.plateNumber} · ${bus.capacity} ${t('seats')}` : '–' },
          { label: x.captain, value: driver ? (ar ? driver.fullNameAr : driver.fullNameEn) : '–' },
        ]} />
        <section aria-labelledby="td-a">
          <h3 id="td-a" className="mb-2 text-base font-medium">{t('amenitiesRules')}</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm text-ink-secondary">
            <li className="flex items-center gap-2"><Wifi size={16} strokeWidth={1.5} aria-hidden="true" />{t('highSpeedWifi')}</li>
            <li className="flex items-center gap-2"><Wind size={16} strokeWidth={1.5} aria-hidden="true" />{t('climateAc')}</li>
            <li className="flex items-center gap-2"><Zap size={16} strokeWidth={1.5} aria-hidden="true" />{t('usbPorts')}</li>
            <li className="flex items-center gap-2"><Briefcase size={16} strokeWidth={1.5} aria-hidden="true" />{t('luggagePolicy')}</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
