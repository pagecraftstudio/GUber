import React from 'react';
import { Trip, Route, Bus, Driver, Booking } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  CalendarDays,
  Users,
  Percent,
  Coins,
  ArrowUpRight,
  Clock,
  Play,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface OverviewMetricsProps {
  trips: Trip[];
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  bookings: Booking[];
  onUpdateTripStatus: (tripId: string, status: Trip['status']) => void;
  onNavigateTab: (tab: any) => void;
}

export const OverviewMetrics: React.FC<OverviewMetricsProps> = ({
  trips,
  routes,
  buses,
  drivers,
  bookings,
  onUpdateTripStatus,
  onNavigateTab,
}) => {
  const { locale, t } = useLocale();

  // Metrics calculations
  const totalBuses = buses.length;
  const activeBuses = buses.filter((b) => b.status === 'active').length;
  const activeTripsCount = trips.filter((t) => t.status !== 'cancelled' && t.status !== 'completed').length;
  const totalBookedSeats = trips.reduce((acc, t) => acc + t.bookedSeats, 0);
  const totalCapacity = trips.reduce((acc, t) => acc + t.totalSeats, 0);
  const occupancyPercentage = totalCapacity > 0 ? Math.round((totalBookedSeats / totalCapacity) * 100) : 0;
  const totalRevenue = bookings.reduce((acc, b) => (b.status !== 'cancelled' ? acc + b.fareEgp : acc), 0) + 48200; // Realistic demo base

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Trips */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('activeTripsToday')}</span>
            <CalendarDays className="w-4 h-4 text-[#3563E9]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {activeTripsCount}
            </span>
            <span className="text-[11px] text-emerald-600 font-semibold flex items-center">
              <span>{t('peakTodayCount')}</span>
            </span>
          </div>
        </div>

        {/* Card 2: Passengers */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('totalPassengersThisMonth')}</span>
            <Users className="w-4 h-4 text-[#0F9D8A]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              1,248
            </span>
            <span className="text-[11px] text-slate-500">
              {t('studentsAndFaculty')}
            </span>
          </div>
        </div>

        {/* Card 3: Occupancy Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('occupancyRate')}</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {occupancyPercentage}%
            </span>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${occupancyPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Revenue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">{t('grossRevenue')}</span>
            <Coins className="w-4 h-4 text-[#14243A]" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {totalRevenue.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 font-semibold">{t('egp')}</span>
          </div>
        </div>
      </div>

      {/* Dispatch Operations Queue */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t('todayDispatches')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('liveDispatchQueueSubtitle')}
            </p>
          </div>
          <Button size="sm" onClick={() => onNavigateTab('trips')}>
            {t('createNewTrip')}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-4 text-start">{t('routeAndDate')}</th>
                <th className="py-2.5 px-4 text-start">{t('assignedCoach')}</th>
                <th className="py-2.5 px-4 text-start">{t('driver')}</th>
                <th className="py-2.5 px-4 text-start">{t('occupancy')}</th>
                <th className="py-2.5 px-4 text-start">{t('status')}</th>
                <th className="py-2.5 px-4 text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.slice(0, 5).map((trip) => {
                const route = routes.find((r) => r.id === trip.routeId);
                const bus = buses.find((b) => b.id === trip.busId);
                const driver = drivers.find((d) => d.id === trip.driverId);

                return (
                  <tr key={trip.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {locale === 'ar' ? route?.originCityAr : route?.originCityEn} →{' '}
                        {locale === 'ar' ? route?.destCityAr : route?.destCityEn}
                      </div>
                      <div className="text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span className="tabular-nums">
                          {trip.departureTime} - {trip.arrivalTime}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{bus?.model}</div>
                      <div className="text-slate-400 font-mono text-[11px]">{bus?.plateNumber}</div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-slate-800">
                        {locale === 'ar' ? driver?.fullNameAr : driver?.fullNameEn}
                      </div>
                      <div className="text-slate-400 tabular-nums text-[11px]" dir="ltr">
                        {driver?.phone}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-bold tabular-nums text-slate-900">
                        {trip.bookedSeats}
                      </span>
                      <span className="text-slate-400"> / {trip.totalSeats} {t('seats')}</span>
                    </td>

                    <td className="py-3 px-4">
                      <Badge status={trip.status} label={t(trip.status as any)} />
                    </td>

                    <td className="py-3 px-4 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        {trip.status === 'scheduled' && (
                          <button
                            onClick={() => onUpdateTripStatus(trip.id, 'boarding')}
                            className="px-2 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium text-[11px] transition-colors cursor-pointer"
                          >
                            {t('markBoarding')}
                          </button>
                        )}
                        {trip.status === 'boarding' && (
                          <button
                            onClick={() => onUpdateTripStatus(trip.id, 'in_transit')}
                            className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium text-[11px] transition-colors cursor-pointer"
                          >
                            {t('markDeparted')}
                          </button>
                        )}
                        {trip.status === 'in_transit' && (
                          <button
                            onClick={() => onUpdateTripStatus(trip.id, 'completed')}
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[11px] transition-colors cursor-pointer"
                          >
                            {t('markCompleted')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom 2-Column Split: Fleet Utilization + Recent Bookings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Availability */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">{t('busUtilization')}</h3>
          <p className="text-xs text-slate-500 mb-4">
            {activeBuses} / {totalBuses} {t('activeBusesDeployed')}
          </p>

          <div className="space-y-3">
            {buses.map((bus) => (
              <div
                key={bus.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900 block">{bus.model}</span>
                  <span className="font-mono text-slate-500 text-[11px]">{bus.plateNumber}</span>
                </div>
                <Badge status={bus.status as any} label={t(bus.status as any)} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Passenger Bookings */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{t('recentBookings')}</h3>
              <p className="text-xs text-slate-500">{t('liveStudentReservations')}</p>
            </div>
            <button
              onClick={() => onNavigateTab('bookings')}
              className="text-xs font-semibold text-[#3563E9] hover:underline cursor-pointer"
            >
              {t('viewAllBookings')}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="text-slate-500 font-semibold border-b border-slate-100">
                <tr>
                  <th className="pb-2 text-start">{t('bookingRefHeader')}</th>
                  <th className="pb-2 text-start">{t('passengerNameHeader')}</th>
                  <th className="pb-2 text-start">{t('studentIdHeader')}</th>
                  <th className="pb-2 text-start">{t('seatHeader')}</th>
                  <th className="pb-2 text-end">{t('fareHeader')}</th>
                  <th className="pb-2 text-end">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.slice(0, 5).map((b) => (
                  <tr key={b.id}>
                    <td className="py-2.5 font-mono font-medium text-slate-800">
                      {b.bookingReference}
                    </td>
                    <td className="py-2.5 font-semibold text-slate-900">{b.passengerName}</td>
                    <td className="py-2.5 font-mono text-slate-500">{b.studentId || '—'}</td>
                    <td className="py-2.5 tabular-nums font-bold text-[#3563E9]">#{b.passengerCount || 1} {t('seats')}</td>
                    <td className="py-2.5 text-end font-semibold tabular-nums text-slate-900">
                      {b.fareEgp} {t('egp')}
                    </td>
                    <td className="py-2.5 text-end">
                      <Badge status={b.status} label={t(b.status as any)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
