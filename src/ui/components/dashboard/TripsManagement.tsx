import React, { useState } from 'react';
import { Trip, Route, Bus, Driver } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Pagination } from '../common/Pagination';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Plus, Search, Clock, ArrowUpDown, AlertCircle } from 'lucide-react';

interface TripsManagementProps {
  trips: Trip[];
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  onRefresh: () => void;
}

export const TripsManagement: React.FC<TripsManagementProps> = ({
  trips,
  routes,
  buses,
  drivers,
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'fare' | 'booked'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // New Trip Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRouteId, setNewRouteId] = useState(routes[0]?.id || '');
  const [newBusId, setNewBusId] = useState(buses[0]?.id || '');
  const [newDriverId, setNewDriverId] = useState(drivers[0]?.id || '');
  const [departureDate, setDepartureDate] = useState('2026-10-14');
  const [departureTime, setDepartureTime] = useState('08:00');
  const [arrivalTime, setArrivalTime] = useState('09:45');
  const [priceEgp, setPriceEgp] = useState('140');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cancel Confirmation
  const [tripToCancel, setTripToCancel] = useState<Trip | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Filter & Search
  let processedTrips = trips.filter((trip) => {
    const route = routes.find((r) => r.id === trip.routeId);
    const matchesStatus = filterStatus === 'all' || trip.status === filterStatus;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (route?.originCityEn || '').toLowerCase().includes(q) ||
      (route?.originCityAr || '').includes(q) ||
      (route?.destCityEn || '').toLowerCase().includes(q) ||
      (route?.destCityAr || '').includes(q) ||
      trip.departureTime.includes(q) ||
      trip.departureDate.includes(q);
    return matchesStatus && matchesSearch;
  });

  // Sort
  processedTrips.sort((a, b) => {
    let diff = 0;
    if (sortBy === 'time') {
      diff = a.departureTime.localeCompare(b.departureTime);
    } else if (sortBy === 'fare') {
      diff = a.priceEgp - b.priceEgp;
    } else if (sortBy === 'booked') {
      diff = a.bookedSeats - b.bookedSeats;
    }
    return sortOrder === 'asc' ? diff : -diff;
  });

  const totalItems = processedTrips.length;
  const paginatedTrips = processedTrips.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: 'time' | 'fare' | 'booked') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!departureDate || !departureTime || !arrivalTime) {
      setFormError(locale === 'ar' ? 'يرجى استكمال كافة المواعيد' : 'Please provide all schedule timestamps');
      return;
    }

    setLoading(true);
    const selectedBus = buses.find((b) => b.id === newBusId);

    try {
      await transportService.createTrip({
        companyId: currentCompany.id,
        routeId: newRouteId || routes[0]?.id || '',
        busId: newBusId || buses[0]?.id || '',
        driverId: newDriverId || drivers[0]?.id || '',
        departureDate,
        departureTime,
        arrivalTime,
        priceEgp: parseFloat(priceEgp) || 140,
        totalSeats: selectedBus?.capacity || 50,
        status: 'scheduled',
        published: true,
      });
      setLoading(false);
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setLoading(false);
      setFormError(err.message || 'Error scheduling trip');
    }
  };

  const handleStatusChange = async (tripId: string, status: Trip['status']) => {
    await transportService.updateTripStatus(tripId, status);
    onRefresh();
  };

  const handleConfirmCancel = async () => {
    if (!tripToCancel) return;
    setCancelLoading(true);
    try {
      await transportService.updateTripStatus(tripToCancel.id, 'cancelled');
      setCancelLoading(false);
      setTripToCancel(null);
      onRefresh();
    } catch {
      setCancelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('trips')}</h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar' ? 'تشغيل وجدولة ومتابعة رحلات الحافلات بين المدن.' : 'Dispatch, monitor, and manage passenger coach departures.'}
          </p>
        </div>

        <Button
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
        >
          {t('createNewTrip')}
        </Button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status segmented buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'scheduled', 'boarding', 'in_transit', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setFilterStatus(st);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filterStatus === st
                  ? 'bg-[#14243A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {st === 'all' ? t('all') : t(st as any)}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="w-full sm:w-64">
          <Input
            placeholder={t('searchRouteOrTime')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Trips Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">{t('routeAndDate')}</th>
                <th className="py-3 px-4 text-start">
                  <button
                    onClick={() => toggleSort('time')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>{t('times')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </button>
                </th>
                <th className="py-3 px-4 text-start">{t('assignedCoach')}</th>
                <th className="py-3 px-4 text-start">{t('captain')}</th>
                <th className="py-3 px-4 text-start">
                  <button
                    onClick={() => toggleSort('booked')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>{t('occupancy')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </button>
                </th>
                <th className="py-3 px-4 text-start">
                  <button
                    onClick={() => toggleSort('fare')}
                    className="flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>{t('fare')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </button>
                </th>
                <th className="py-3 px-4 text-start">{t('status')}</th>
                <th className="py-3 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTrips.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-semibold">{t('noTripsMatchFilter')}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {locale === 'ar' ? 'حاول تغيير معايير البحث أو تصفية الحالة.' : 'Try adjusting your search query or status filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedTrips.map((trip) => {
                  const route = routes.find((r) => r.id === trip.routeId);
                  const bus = buses.find((b) => b.id === trip.busId);
                  const driver = drivers.find((d) => d.id === trip.driverId);

                  return (
                    <tr key={trip.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {locale === 'ar' ? route?.originCityAr : route?.originCityEn} →{' '}
                          {locale === 'ar' ? route?.destCityAr : route?.destCityEn}
                        </div>
                        <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                          {trip.departureDate}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-semibold tabular-nums text-slate-800">
                        {trip.departureTime} - {trip.arrivalTime}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{bus?.model}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{bus?.plateNumber}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-800 font-medium">
                          {locale === 'ar' ? driver?.fullNameAr : driver?.fullNameEn}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold tabular-nums text-slate-900">
                          {trip.bookedSeats}
                        </span>
                        <span className="text-slate-400"> / {trip.totalSeats}</span>
                      </td>

                      <td className="py-3 px-4 font-bold tabular-nums text-slate-900">
                        {trip.priceEgp} {t('egp')}
                      </td>

                      <td className="py-3 px-4">
                        <Badge status={trip.status} label={t(trip.status as any)} />
                      </td>

                      <td className="py-3 px-4 text-end">
                        <div className="flex items-center justify-end gap-1">
                          {trip.status === 'scheduled' && (
                            <button
                              onClick={() => handleStatusChange(trip.id, 'boarding')}
                              className="px-2 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium text-[11px] cursor-pointer"
                            >
                              {t('markBoarding')}
                            </button>
                          )}
                          {trip.status === 'boarding' && (
                            <button
                              onClick={() => handleStatusChange(trip.id, 'in_transit')}
                              className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-[11px] cursor-pointer"
                            >
                              {t('markDeparted')}
                            </button>
                          )}
                          {trip.status === 'in_transit' && (
                            <button
                              onClick={() => handleStatusChange(trip.id, 'completed')}
                              className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[11px] cursor-pointer"
                            >
                              {t('markCompleted')}
                            </button>
                          )}
                          {trip.status !== 'completed' && trip.status !== 'cancelled' && (
                            <button
                              onClick={() => setTripToCancel(trip)}
                              className="px-2 py-1 rounded text-red-600 hover:bg-red-50 font-medium text-[11px] cursor-pointer"
                            >
                              {t('cancelTrip')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>

      {/* Schedule Trip Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('createNewTrip')}
        subtitle={locale === 'ar' ? 'جدولة رحلة حافلة لنقل المسافرين والطلاب بين المدن.' : 'Schedule an intercity coach run for passenger reservations.'}
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTrip} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <Select
            label={t('selectRoute')}
            value={newRouteId}
            onChange={(e) => setNewRouteId(e.target.value)}
            options={routes.map((r) => ({
              value: r.id,
              label: `${locale === 'ar' ? `${r.originCityAr} ← ${r.destCityAr}` : `${r.originCityEn} → ${r.destCityEn}`} (${r.durationMinutes} ${t('minDuration')})`,
            }))}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('selectBus')}
              value={newBusId}
              onChange={(e) => setNewBusId(e.target.value)}
              options={buses.map((b) => ({
                value: b.id,
                label: `${b.model} (${b.capacity} ${t('seats')})`,
              }))}
            />

            <Select
              label={t('selectDriver')}
              value={newDriverId}
              onChange={(e) => setNewDriverId(e.target.value)}
              options={drivers.map((d) => ({
                value: d.id,
                label: locale === 'ar' ? d.fullNameAr : d.fullNameEn,
              }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              type="date"
              label={t('travelDate')}
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              required
            />
            <Input
              type="time"
              label={t('departureTime')}
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              required
            />
            <Input
              type="time"
              label={t('arrivalTime')}
              value={arrivalTime}
              onChange={(e) => setArrivalTime(e.target.value)}
              required
            />
          </div>

          <Input
            type="number"
            label={t('baseFareLabel')}
            value={priceEgp}
            onChange={(e) => setPriceEgp(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              {t('scheduleTripBtn')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Destructive Action Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!tripToCancel}
        onClose={() => setTripToCancel(null)}
        onConfirm={handleConfirmCancel}
        title={t('cancelTrip')}
        message={
          locale === 'ar'
            ? `هل أنت متأكد من رغبتك في إلغاء هذه الرحلة (${tripToCancel?.departureDate} - ${tripToCancel?.departureTime})؟ سيتم إيقاف الحجز وإشعار الركاب.`
            : `Are you sure you want to cancel this scheduled trip (${tripToCancel?.departureDate} at ${tripToCancel?.departureTime})? Bookings will be closed and capacity reset.`
        }
        confirmLabel={t('cancelTrip')}
        variant="danger"
        loading={cancelLoading}
      />
    </div>
  );
};
