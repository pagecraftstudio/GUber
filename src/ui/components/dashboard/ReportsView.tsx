import React from 'react';
import { Route, Trip, Booking } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { Button } from '../common/Button';
import { BarChart3, TrendingUp, Download, Calendar, DollarSign, Users } from 'lucide-react';

interface ReportsViewProps {
  routes: Route[];
  trips: Trip[];
  bookings: Booking[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({ routes, trips, bookings }) => {
  const { locale, t } = useLocale();

  const routePerformance = routes.map((route) => {
    const routeTrips = trips.filter((t) => t.routeId === route.id);
    const tripsCount = routeTrips.length;
    const passengers = routeTrips.reduce((acc, t) => acc + t.bookedSeats, 0);
    const revenue = passengers * route.baseFareEgp;
    return {
      id: route.id,
      name: locale === 'ar' ? `${route.originCityAr} ← ${route.destCityAr}` : `${route.originCityEn} → ${route.destCityEn}`,
      tripsCount,
      passengers,
      revenue,
      fare: route.baseFareEgp,
    };
  });

  const totalRevenue = routePerformance.reduce((acc, r) => acc + r.revenue, 0);
  const totalPassengers = routePerformance.reduce((acc, r) => acc + r.passengers, 0);

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Route,Trips,Passengers,Base Fare (EGP),Total Revenue (EGP)']
        .concat(routePerformance.map((r) => `"${r.name}",${r.tripsCount},${r.passengers},${r.fare},${r.revenue}`))
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `malaky_transport_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('reports')}</h2>
          <p className="text-xs text-slate-500">
            {t('monthlyCommuteRevenueDesc')}
          </p>
        </div>

        <Button size="sm" variant="outline" icon={<Download className="w-3.5 h-3.5" />} onClick={handleExportCsv}>
          {t('exportCsv')}
        </Button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">{t('monthlyCommuteRevenue')}</span>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {totalRevenue.toLocaleString()} {t('egp')}
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
            {t('monthRevenueComp')}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">{t('totalTransportedStudents')}</span>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {totalPassengers} {t('passengersText')}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {t('onTimeArrivals')}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs text-slate-500 font-medium block">{t('highestYieldRoute')}</span>
          <div className="text-base font-bold text-[#3563E9] mt-1 truncate">
            {locale === 'ar' ? 'القاهرة (مدينة نصر) ↔ الجلالة' : 'Cairo (Nasr City) ↔ Galala'}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {t('highestYieldRouteStats')}
          </span>
        </div>
      </div>

      {/* Route Performance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{t('routeProfitabilityMatrix')}</h3>
          <span className="text-xs text-slate-400">{t('currentSemester')}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">{t('corridorRoute')}</th>
                <th className="py-3 px-4 text-start">{t('scheduledTrips')}</th>
                <th className="py-3 px-4 text-start">{t('passengerVolume')}</th>
                <th className="py-3 px-4 text-start">{t('baseFare')}</th>
                <th className="py-3 px-4 text-end">{t('totalGrossRevenue')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routePerformance.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-bold text-slate-900">{item.name}</td>
                  <td className="py-3 px-4 tabular-nums text-slate-600">{item.tripsCount} {t('runsCount')}</td>
                  <td className="py-3 px-4 tabular-nums font-semibold text-slate-800">
                    {item.passengers} {t('bookedSeatsCount')}
                  </td>
                  <td className="py-3 px-4 tabular-nums text-slate-600">
                    {item.fare} {t('egp')}
                  </td>
                  <td className="py-3 px-4 text-end font-bold tabular-nums text-slate-900 text-sm">
                    {item.revenue.toLocaleString()} {t('egp')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
