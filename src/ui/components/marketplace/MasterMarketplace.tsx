import React, { useState, useEffect } from 'react';
import { CanonicalLocation, MarketplaceTripItem, MarketplaceSearchParams, Trip, Booking, Route, Bus, Stop } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { MarketplaceHeader } from './MarketplaceHeader';

import { CompanyProfileModal } from './CompanyProfileModal';
import { BookingFlowModal } from '../public/BookingFlowModal';
import { isMockMode } from '../../lib/runtime';
import { QuietFooter } from '@/ds/shell/MarketplaceHeaderMasar';
import { SHELL_TEXT } from '@/ds/shell/text';
import { formatYear } from '@/ds/format';
import { DigitalTicketView } from '../public/DigitalTicketView';
import { MarketplaceMasarView } from '../masar/MarketplaceMasarView';

import { ToastContainer, ToastMessage } from '../common/Toast';
import { demoDate, demoDestLocationId } from '../../lib/demoDefaults';

/** Real mode starts unfiltered; demo values come from lib/demoDefaults and exist only in the development mock. */
const initialSearchParams = (): MarketplaceSearchParams => ({
  originLocationId: '', destLocationId: demoDestLocationId(), date: demoDate(), sortBy: 'time_asc', timeOfDay: 'all',
});

export const MasterMarketplace: React.FC = () => {
  const { locale, t } = useLocale();
  const { companies, selectCompany, setActiveView } = useTenant();

  const [locations, setLocations] = useState<CanonicalLocation[]>([]);
  const [trips, setTrips] = useState<MarketplaceTripItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Search & Filter State
  const [searchParams, setSearchParams] = useState<MarketplaceSearchParams>(initialSearchParams);

  // Mobile Filter Drawer
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Modal States
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [activeTicket, setActiveTicket] = useState<{ booking: Booking; trip: Trip } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `toast_${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Contextual data for booking flow
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);

  // Load initial static datasets
  useEffect(() => {
    const init = async () => {
      const [locs, r, b, s] = await Promise.all([
        transportService.getCanonicalLocations(),
        transportService.getRoutes(),
        transportService.getBuses(),
        transportService.getStops(),
      ]);
      setLocations(locs);
      setRoutes(r);
      setBuses(b);
      setStops(s);
    };
    init();
  }, []);

  // Fetch search results whenever searchParams change
  const fetchMarketplaceTrips = async () => {
    setLoading(true);
    const results = await transportService.searchMarketplaceTrips(searchParams);
    setTrips(results);
    // real mode derives routes/stops from rows the database returned: refresh them after every search
    const [r, s] = await Promise.all([transportService.getRoutes(), transportService.getStops()]);
    setRoutes(r);
    setStops(s);
    setLoading(false);
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchMarketplaceTrips();
  }, [searchParams]);

  const handleSearch = (originId: string, destId: string, date: string) => {
    setSearchParams((prev) => ({
      ...prev,
      originLocationId: originId || undefined,
      destLocationId: destId || undefined,
      date,
    }));
  };

  const handleFilterChange = (updated: Partial<MarketplaceSearchParams>) => {
    setSearchParams((prev) => ({ ...prev, ...updated }));
  };

  const handleResetFilters = () => {
    setSearchParams(initialSearchParams());
  };

  const handleStartBooking = async (marketTrip: MarketplaceTripItem) => {
    const fullTrip = await transportService.getTripById(marketTrip.id);
    if (fullTrip) {
      // getTripById also loads this trip's pickup/drop-off stops (real mode): refresh the lists the modal reads
      const [r, s] = await Promise.all([transportService.getRoutes(), transportService.getStops()]);
      setRoutes(r);
      setStops(s);
      setBookingTrip(fullTrip);
    }
  };

  if (activeTicket) {
    return (
      <div className="min-h-screen bg-surface-page">
        <MarketplaceHeader onBrowseOperators={() => setSelectedCompanyId(companies[0]?.id || null)} />
        <main className="py-8">
          <DigitalTicketView
            booking={activeTicket.booking}
            trip={activeTicket.trip}
            routes={routes}
            buses={buses}
            onDone={() => setActiveTicket(null)}
          />
        </main>
      </div>
    );
  }

  const selectedCompanyObj = companies.find((c) => c.id === selectedCompanyId) || null;
  const companyTrips = selectedCompanyId
    ? trips.filter((t) => t.companyId === selectedCompanyId)
    : [];

  const totalResults = trips.length;

  // Active filter count
  let activeFilterCount = 0;
  if (searchParams.companyId) activeFilterCount++;
  if (searchParams.timeOfDay && searchParams.timeOfDay !== 'all') activeFilterCount++;
  if (searchParams.maxPrice && searchParams.maxPrice < 300) activeFilterCount++;
  if (searchParams.minAvailableSeats && searchParams.minAvailableSeats > 1) activeFilterCount++;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-surface-page">
      <div>
        <MarketplaceHeader onBrowseOperators={() => setSelectedCompanyId(companies[0]?.id || null)} />
        <MarketplaceMasarView
          locations={locations} companies={companies} params={searchParams} trips={trips} total={totalResults} loading={loading}
          page={currentPage} pageSize={pageSize} onPage={setCurrentPage}
          onSearch={handleSearch} onFilter={handleFilterChange} onReset={handleResetFilters}
          onBook={handleStartBooking} onOperator={(cid) => setSelectedCompanyId(cid)}
        />
      </div>
      <QuietFooter credit={SHELL_TEXT[locale].poweredBy}>© {formatYear(new Date(), locale)} {SHELL_TEXT[locale].productName}{isMockMode() ? ' · ' : ''}{isMockMode() ? t('demoDataNotice') : ''}</QuietFooter>
      <CompanyProfileModal isOpen={!!selectedCompanyId} onClose={() => setSelectedCompanyId(null)} company={selectedCompanyObj} companyTrips={companyTrips} onBookTrip={handleStartBooking} />
      <BookingFlowModal
        isOpen={!!bookingTrip} onClose={() => setBookingTrip(null)} trip={bookingTrip} routes={routes} buses={buses} stops={stops}
        onBookingSuccess={(booking, trip) => {
          setBookingTrip(null); setActiveTicket({ booking, trip });
          addToast('success', isMockMode() ? t('ticketIssuedSuccess') : (locale === 'ar' ? 'تم تأكيد الحجز' : 'Booking confirmed'), `${booking.passengerName} (Ref: ${booking.bookingReference})`);
          fetchMarketplaceTrips();
        }}
      />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
