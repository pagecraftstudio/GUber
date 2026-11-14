import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Route, Trip, Bus, Driver, Stop, Booking } from '../../types';
import { TripDetailsModal } from './TripDetailsModal';
import { BookingFlowModal } from './BookingFlowModal';
import { DigitalTicketView } from './DigitalTicketView';
import { demoDate } from '../../lib/demoDefaults';
import { PublicHeaderMasar, PublicFooterMasar, PublicSiteMasarView } from '../masar/PublicSiteMasarView';

export const PublicWebsite: React.FC = () => {
  const { currentCompany } = useTenant();
  const { locale, t } = useLocale();

  const [routes, setRoutes] = useState<Route[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);

  // Search state
  const [selectedOrigin, setSelectedOrigin] = useState('');
  const [selectedDest, setSelectedDest] = useState('');
  const [selectedDate, setSelectedDate] = useState(demoDate());

  // Modals state
  const [inspectTrip, setInspectTrip] = useState<Trip | null>(null);
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [activeTicket, setActiveTicket] = useState<{ booking: Booking; trip: Trip } | null>(null);

  const loadData = async () => {
    const [r, tr, b, d, s] = await Promise.all([
      transportService.getRoutes(currentCompany.id),
      transportService.getTrips(currentCompany.id),
      transportService.getBuses(currentCompany.id),
      transportService.getDrivers(currentCompany.id),
      transportService.getStops(currentCompany.id),
    ]);
    setRoutes(r);
    setTrips(tr);
    setBuses(b);
    setDrivers(d);
    setStops(s);
  };

  useEffect(() => {
    loadData();
  }, [currentCompany.id]);

  const handleSearch = (originId: string, destId: string, date: string) => {
    setSelectedOrigin(originId);
    setSelectedDest(destId);
    setSelectedDate(date);
  };

  // Filter trips based on origin, destination, selected date, and exclude cancelled or unpublished
  const displayedTrips = trips.filter((t) => {
    if (!t.published) return false;
    if (t.status === 'cancelled') return false;

    if (selectedDate && t.departureDate !== selectedDate) return false;

    if (selectedOrigin && selectedDest) {
      const route = routes.find((r) => r.id === t.routeId);
      if (!route) return false;
      const originMatch =
        route.originStopId === selectedOrigin || route.originLocationId === selectedOrigin;
      const destMatch =
        route.destStopId === selectedDest || route.destLocationId === selectedDest;
      if (!originMatch || !destMatch) return false;
    }
    return true;
  });

  if (activeTicket) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-surface-page">
        <PublicHeaderMasar onBook={() => setActiveTicket(null)} />
        <main className="flex-1">
          <DigitalTicketView
            booking={activeTicket.booking}
            trip={activeTicket.trip}
            routes={routes}
            buses={buses}
            onDone={() => setActiveTicket(null)}
          />
        </main>
        <PublicFooterMasar />
      </div>
    );
  }

  const openFirst = () => {
    if (displayedTrips.length > 0) setBookingTrip(displayedTrips[0] ?? null);
    else if (trips.length > 0) setBookingTrip(trips[0] ?? null);
  };

  const modals = (
    <>
      <TripDetailsModal
        isOpen={!!inspectTrip}
        onClose={() => setInspectTrip(null)}
        trip={inspectTrip}
        routes={routes}
        buses={buses}
        drivers={drivers}
        stops={stops}
        onBookNow={(trip) => setBookingTrip(trip)}
      />
      <BookingFlowModal
        isOpen={!!bookingTrip}
        onClose={() => setBookingTrip(null)}
        trip={bookingTrip}
        routes={routes}
        buses={buses}
        stops={stops}
        onBookingSuccess={(booking, trip) => {
          setBookingTrip(null);
          setActiveTicket({ booking, trip });
          loadData();
        }}
      />
    </>
  );

  return (
    <div className="flex min-h-screen flex-col justify-between bg-surface-page">
      <div>
        <PublicHeaderMasar onBook={openFirst} />
        <PublicSiteMasarView
          routes={routes} trips={displayedTrips} buses={buses} stops={stops}
          origin={selectedOrigin} dest={selectedDest} date={selectedDate}
          onSearch={handleSearch} onSelectTrip={(trip) => setBookingTrip(trip)} onViewDetails={(trip) => setInspectTrip(trip)}
        />
      </div>
      <PublicFooterMasar />
      {modals}
    </div>
  );
};
