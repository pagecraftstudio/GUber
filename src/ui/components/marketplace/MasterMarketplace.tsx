import React, { useState, useEffect } from 'react';
import {
  CanonicalLocation,
  Company,
  MarketplaceTripItem,
  MarketplaceSearchParams,
  Trip,
  Booking,
  Route,
  Bus,
  Stop,
} from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { MarketplaceHeader } from './MarketplaceHeader';
import { MarketplaceSearch } from './MarketplaceSearch';
import { MarketplaceFilters } from './MarketplaceFilters';
import { MarketplaceTripCard } from './MarketplaceTripCard';
import { CompanyProfileModal } from './CompanyProfileModal';
import { BookingFlowModal } from '../public/BookingFlowModal';
import { isMockMode } from '../../lib/runtime';
import { DigitalTicketView } from '../public/DigitalTicketView';
import { Button } from '../common/Button';
import { Pagination } from '../common/Pagination';
import { ToastContainer, ToastMessage } from '../common/Toast';
import { ArrowUpDown, SlidersHorizontal, Info, Store, Building2, MapPin, X, RotateCcw } from 'lucide-react';
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
      <div className="min-h-screen bg-[#F5F7FA]">
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
  const paginatedTrips = trips.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Active filter count
  let activeFilterCount = 0;
  if (searchParams.companyId) activeFilterCount++;
  if (searchParams.timeOfDay && searchParams.timeOfDay !== 'all') activeFilterCount++;
  if (searchParams.maxPrice && searchParams.maxPrice < 300) activeFilterCount++;
  if (searchParams.minAvailableSeats && searchParams.minAvailableSeats > 1) activeFilterCount++;

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between">
      <div>
        <MarketplaceHeader onBrowseOperators={() => setSelectedCompanyId(companies[0]?.id || null)} />

        {/* Hero Search Section */}
        <MarketplaceSearch
          locations={locations}
          selectedOriginId={searchParams.originLocationId || ''}
          selectedDestId={searchParams.destLocationId || ''}
          selectedDate={searchParams.date || demoDate()}
          onSearch={handleSearch}
        />

        {/* Main Results & Filters Grid */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Mobile Filter Button */}
          <div className="lg:hidden mb-4 flex items-center justify-between gap-3">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 shadow-xs cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#3563E9]" />
              <span>{t('filter')}</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#3563E9] text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <span className="text-xs text-slate-500 font-medium">
              {totalResults} {t('departures')}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Desktop Filters Sidebar */}
            <div className="hidden lg:block lg:col-span-4 space-y-4">
              <MarketplaceFilters
                companies={companies}
                params={searchParams}
                onChange={handleFilterChange}
                onReset={handleResetFilters}
                totalResultsCount={totalResults}
              />

              {/* Participating Companies Quick Directory */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#3563E9]" />
                  <span>{t('participatingOperators')}</span>
                </h4>
                <div className="space-y-2">
                  {companies
                    .filter((c) => c.status === 'active' && c.marketplaceListed)
                    .map((comp) => (
                      <button
                        key={comp.id}
                        onClick={() => setSelectedCompanyId(comp.id)}
                        className="w-full text-start p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-white text-[10px] font-bold"
                            style={{ backgroundColor: comp.primaryColor }}
                          >
                            {comp.logoText.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-slate-900 block leading-tight">
                              {locale === 'ar' ? comp.nameAr : comp.nameEn}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {locale === 'ar' ? 'مشغل معتمد' : 'Licensed'}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] text-[#3563E9] font-medium">{t('view')}</span>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* Trip Cards Feed */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    {t('compareTripsFound')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {locale === 'ar'
                      ? 'مواعيد حافلات مباشرة ومحدثة حسب السعة الشاغرة.'
                      : 'Live departures filtered across active Egyptian coach operators.'}
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {t('showing')} <strong className="text-slate-900 font-bold tabular-nums">{totalResults}</strong> {t('departures')}
                </span>
              </div>

              {loading ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center text-slate-500 text-xs">
                  <span className="w-5 h-5 border-2 border-[#3563E9] border-t-transparent rounded-full animate-spin inline-block mb-3" />
                  <p>{t('searchingAcrossOperators')}</p>
                </div>
              ) : trips.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                    <Info className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">
                    {t('noTripsFound')}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mb-5 leading-relaxed">
                    {t('tryDifferentDate')}
                  </p>
                  <Button size="sm" variant="outline" onClick={handleResetFilters} icon={<RotateCcw className="w-3.5 h-3.5" />}>
                    {t('resetSearchFilters')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedTrips.map((trip) => (
                    <MarketplaceTripCard
                      key={trip.id}
                      trip={trip}
                      onViewOperator={(cid) => setSelectedCompanyId(cid)}
                      onBookTrip={handleStartBooking}
                    />
                  ))}

                  {/* Pagination */}
                  <Pagination
                    currentPage={currentPage}
                    totalItems={totalResults}
                    pageSize={pageSize}
                    onPageChange={(p) => setCurrentPage(p)}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Filters Slide-over / Modal */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">{t('filter')}</h3>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <MarketplaceFilters
              companies={companies}
              params={searchParams}
              onChange={handleFilterChange}
              onReset={handleResetFilters}
              totalResultsCount={totalResults}
            />

            <Button
              size="md"
              className="w-full"
              onClick={() => setMobileFiltersOpen(false)}
            >
              {locale === 'ar' ? `عرض النتائج (${totalResults})` : `Show Results (${totalResults})`}
            </Button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-[#14243A] text-slate-400 py-8 border-t border-slate-800 text-xs mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} {t('platformName')} — {t('marketplaceView')}. {t('allRightsReserved')}</p>
          <p className="text-[11px] text-slate-500">
            {isMockMode() ? `${t('demoDataNotice')} ` : ''}{t('poweredByMalaky')}
          </p>
        </div>
      </footer>

      {/* Company Profile Modal */}
      <CompanyProfileModal
        isOpen={!!selectedCompanyId}
        onClose={() => setSelectedCompanyId(null)}
        company={selectedCompanyObj}
        companyTrips={companyTrips}
        onBookTrip={handleStartBooking}
      />

      {/* Booking Flow Modal */}
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
          addToast('success', isMockMode() ? t('ticketIssuedSuccess') : (locale === 'ar' ? 'تم تأكيد الحجز' : 'Booking confirmed'), `${booking.passengerName} (Ref: ${booking.bookingReference})`);
          fetchMarketplaceTrips();
        }}
      />

      {/* Operational Toasts */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
