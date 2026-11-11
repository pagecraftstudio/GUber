import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Route, Trip, Bus, Driver, Stop, Booking } from '../../types';
import { PublicHeader } from './PublicHeader';
import { HeroTripSearch } from './HeroTripSearch';
import { RouteCardGrid } from './RouteCardGrid';
import { TripDetailsModal } from './TripDetailsModal';
import { BookingFlowModal } from './BookingFlowModal';
import { DigitalTicketView } from './DigitalTicketView';
import { PublicFooter } from './PublicFooter';
import { CheckCircle2, HelpCircle, PhoneCall, Shield, Wifi, Clock, ArrowRight } from 'lucide-react';
import { demoDate } from '../../lib/demoDefaults';

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
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between">
        <PublicHeader onBookClick={() => setActiveTicket(null)} />
        <main className="flex-1">
          <DigitalTicketView
            booking={activeTicket.booking}
            trip={activeTicket.trip}
            routes={routes}
            buses={buses}
            onDone={() => setActiveTicket(null)}
          />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const publishedConfig = currentCompany.publishedWebsiteConfig || currentCompany.websiteConfig;
  const perks = publishedConfig.perks;
  const faqs = publishedConfig.faqs;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between">
      <PublicHeader
        onBookClick={() => {
          if (displayedTrips.length > 0) setBookingTrip(displayedTrips[0] ?? null);
          else if (trips.length > 0) setBookingTrip(trips[0] ?? null);
        }}
      />

      <main className="flex-1">
        {/* Hero & Trip Search */}
        <HeroTripSearch
          stops={stops}
          onSearch={handleSearch}
          selectedOrigin={selectedOrigin}
          selectedDest={selectedDest}
          selectedDate={selectedDate}
        />

        {/* Trips & Popular Routes */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RouteCardGrid
            routes={routes}
            trips={displayedTrips}
            buses={buses}
            onSelectTrip={(trip) => setBookingTrip(trip)}
            onViewDetails={(trip) => setInspectTrip(trip)}
          />
        </div>

        {/* How It Works Section */}
        <section id="how-to-book" className="py-16 bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {t('howToBook')}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {t('howToBookSubtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-[#14243A] text-white flex items-center justify-center font-bold text-sm mb-4">
                  01
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{t('step1SelectRoute')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('howToBookStep1')}
                </p>
              </div>

              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-[#3563E9] text-white flex items-center justify-center font-bold text-sm mb-4">
                  02
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{t('step2EnterDetails')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('howToBookStep2')}
                </p>
              </div>

              <div className="p-6 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-10 h-10 rounded-lg bg-[#0F9D8A] text-white flex items-center justify-center font-bold text-sm mb-4">
                  03
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{t('step3BoardingPass')}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t('howToBookStep3')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Perks Section (if configured) */}
        {perks && perks.length > 0 && (
          <section className="py-16 bg-[#F5F7FA]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {perks.map((p: any) => (
                  <div key={p.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#3563E9] flex items-center justify-center mb-4">
                      {p.icon === 'wifi' ? (
                        <Wifi className="w-5 h-5" />
                      ) : p.icon === 'shield' ? (
                        <Shield className="w-5 h-5" />
                      ) : (
                        <Clock className="w-5 h-5" />
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1.5">
                      {locale === 'ar' ? p.titleAr : p.titleEn}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {locale === 'ar' ? p.descAr : p.descEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQs */}
        {faqs && faqs.length > 0 && (
          <section id="faqs" className="py-16 bg-white border-t border-slate-200">
            <div className="max-w-4xl mx-auto px-4 sm:px-6">
              <h2 className="text-2xl font-bold text-slate-900 text-center tracking-tight mb-8">
                {t('faqsTitle')}
              </h2>
              <div className="space-y-4">
                {faqs.map((faq: any) => (
                  <div
                    key={faq.id}
                    className="p-5 rounded-xl border border-slate-200 bg-slate-50/60"
                  >
                    <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#3563E9] shrink-0" />
                      <span>{locale === 'ar' ? faq.qAr : faq.qEn}</span>
                    </h3>
                    <p className="text-xs text-slate-600 ps-6 leading-relaxed">
                      {locale === 'ar' ? faq.aAr : faq.aEn}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <PublicFooter />

      {/* Modals */}
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
    </div>
  );
};
