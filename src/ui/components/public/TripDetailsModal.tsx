import React from 'react';
import { Trip, Route, Bus, Driver, Stop } from '../../types';
import { useLocale } from '../../context/LocaleContext';

import { TripDetailsMasarView } from '../masar/TripDetailsMasarView';

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

  return <TripDetailsMasarView isOpen={isOpen} onClose={onClose} trip={trip} route={route} bus={bus} driver={driver} originStop={originStop} destStop={destStop} onBookNow={onBookNow} />;
};
