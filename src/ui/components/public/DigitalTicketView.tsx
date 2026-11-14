import React, { useEffect, useState } from 'react';
import { Booking, Trip, Route, Bus, PassengerTicket } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';

import { isMockMode } from '../../lib/runtime';
import { transportService } from '../../lib/transportService';
import { describeBackendError } from '../../lib/real/customerBackend';
import { TicketQrImage } from './TicketQrImage';
import { TicketMasarView } from '../masar/TicketMasarView';

interface DigitalTicketViewProps {
  booking: Booking;
  trip: Trip;
  routes: Route[];
  buses: Bus[];
  onDone: () => void;
}

export const DigitalTicketView: React.FC<DigitalTicketViewProps> = ({
  booking,
  trip,
  routes,
  buses,
  onDone,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const route = routes.find((r) => r.id === trip.routeId);
  const bus = buses.find((b) => b.id === trip.busId);

  // Real mode: tickets come from the backend (one per seat, fresh QR payload per fetch; the database keeps only hashes).
  // Mock mode (dev only): the booking's own passengers. Nothing is fabricated in real mode.
  const mock = isMockMode();
  const [live, setLive] = useState<PassengerTicket[] | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (mock) return;
    let on = true;
    setLive(null); setTicketsError(null);
    transportService.getBookingTickets(booking.id)
      .then((t) => { if (on) setLive(t); })
      .catch((e) => { if (on) setTicketsError(describeBackendError(e, locale)); });
    return () => { on = false; };
  }, [mock, booking.id, reloadKey, locale]);

  const passengers: PassengerTicket[] = mock
    ? booking.passengers && booking.passengers.length > 0
      ? booking.passengers
      : [{ id: `pt_${booking.id}_1`, bookingId: booking.id, ticketIndex: 1, passengerName: booking.passengerName, status: 'valid', qrOpaqueToken: booking.qrTicketToken }]
    : live ?? [];

  const [selectedPassengerIdx, setSelectedPassengerIdx] = useState(0);
  const activePassenger: PassengerTicket | undefined = passengers[selectedPassengerIdx] ?? passengers[0];

  const handlePrint = () => {
    window.print();
  };

  const qrNode = !mock && activePassenger?.qrOpaqueToken && activePassenger.status !== 'boarded'
    ? <TicketQrImage payload={activePassenger.qrOpaqueToken} label={locale === 'ar' ? 'رمز QR للتذكرة' : 'Ticket QR code'} />
    : null;
  return (
    <TicketMasarView
      booking={booking} trip={trip} route={route} bus={bus} company={currentCompany}
      passengers={passengers} activeIdx={selectedPassengerIdx} setActiveIdx={setSelectedPassengerIdx}
      loading={!mock && !live && !ticketsError} error={ticketsError} onRetry={() => setReloadKey((k) => k + 1)}
      qr={qrNode} onDone={onDone} onPrint={handlePrint}
    />
  );
};
