import React, { useState } from 'react';
import { Route, Stop } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Plus, MapPin, Clock, Route as RouteIcon, Building } from 'lucide-react';

interface RoutesAndStopsProps {
  routes: Route[];
  stops: Stop[];
  onRefresh: () => void;
}

export const RoutesAndStops: React.FC<RoutesAndStopsProps> = ({
  routes,
  stops,
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const [activeTab, setActiveTab] = useState<'routes' | 'stops'>('routes');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Route Form
  const [originStopId, setOriginStopId] = useState(stops[0]?.id || '');
  const [destStopId, setDestStopId] = useState(stops[1]?.id || '');
  const [distanceKm, setDistanceKm] = useState('120');
  const [durationMinutes, setDurationMinutes] = useState('90');
  const [baseFareEgp, setBaseFareEgp] = useState('130');

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    const orig = stops.find((s) => s.id === originStopId);
    const dest = stops.find((s) => s.id === destStopId);

    await transportService.createRoute({
      companyId: currentCompany.id,
      originLocationId: orig?.canonicalLocationId || 'loc_cairo_downtown',
      destLocationId: dest?.canonicalLocationId || 'loc_galala_univ',
      originStopId,
      destStopId,
      originCityEn: orig?.cityEn || 'City',
      originCityAr: orig?.cityAr || 'مدينة',
      destCityEn: dest?.cityEn || 'Galala',
      destCityAr: dest?.cityAr || 'الجلالة',
      distanceKm: parseFloat(distanceKm) || 100,
      durationMinutes: parseInt(durationMinutes) || 90,
      baseFareEgp: parseFloat(baseFareEgp) || 120,
      active: true,
    });
    setIsModalOpen(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {t('routesAndStops')}
          </h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar' ? 'مسارات وخطوط النقل ونقاط صعود ونزول ركاب جامعة الجلالة.' : 'Geographic transport corridors and pickup/drop-off transit points.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('routes')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'routes' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t('activeRoutes')} ({routes.length})
            </button>
            <button
              onClick={() => setActiveTab('stops')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'stops' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t('stopsAndStations')} ({stops.length})
            </button>
          </div>

          {activeTab === 'routes' && (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>
              {t('newRoute')}
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'routes' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4 text-start">{t('originCity')}</th>
                <th className="py-3 px-4 text-start">{t('destinationCity')}</th>
                <th className="py-3 px-4 text-start">{t('distanceLabel')}</th>
                <th className="py-3 px-4 text-start">{t('estDuration')}</th>
                <th className="py-3 px-4 text-start">{t('baseFare')}</th>
                <th className="py-3 px-4 text-end">{t('activeStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.map((route) => (
                <tr key={route.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {locale === 'ar' ? route.originCityAr : route.originCityEn}
                  </td>
                  <td className="py-3 px-4 font-bold text-[#0F9D8A]">
                    {locale === 'ar' ? route.destCityAr : route.destCityEn}
                  </td>
                  <td className="py-3 px-4 tabular-nums text-slate-600">
                    {route.distanceKm} km
                  </td>
                  <td className="py-3 px-4 tabular-nums text-slate-600">
                    {route.durationMinutes} {t('minDuration')}
                  </td>
                  <td className="py-3 px-4 font-bold tabular-nums text-slate-900">
                    {route.baseFareEgp} {t('egp')}
                  </td>
                  <td className="py-3 px-4 text-end">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                      {t('active')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stops.map((stop) => (
            <div
              key={stop.id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-md flex items-center justify-center ${
                      stop.isCampus
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {stop.isCampus ? <Building className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {locale === 'ar' ? stop.nameAr : stop.nameEn}
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      {locale === 'ar' ? stop.cityAr : stop.cityEn}
                    </span>
                  </div>
                </div>

                {stop.isCampus && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                    {t('campusGate')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 ps-9">
                {t('landmarkLabel')} {locale === 'ar' ? stop.landmarkAr : stop.landmarkEn}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* New Route Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('createNewRouteModal')}
        subtitle={t('createNewRouteDesc')}
      >
        <form onSubmit={handleCreateRoute} className="space-y-4">
          <Select
            label={t('originStationLabel')}
            value={originStopId}
            onChange={(e) => setOriginStopId(e.target.value)}
            options={stops.map((s) => ({ value: s.id, label: `${locale === 'ar' ? s.cityAr : s.cityEn} - ${locale === 'ar' ? s.nameAr : s.nameEn}` }))}
          />

          <Select
            label={t('destStationLabel')}
            value={destStopId}
            onChange={(e) => setDestStopId(e.target.value)}
            options={stops.map((s) => ({ value: s.id, label: `${locale === 'ar' ? s.cityAr : s.cityEn} - ${locale === 'ar' ? s.nameAr : s.nameEn}` }))}
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              label={t('distanceKmLabel')}
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              required
            />
            <Input
              type="number"
              label={t('durationMinLabel')}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              required
            />
            <Input
              type="number"
              label={t('baseFareLabel')}
              value={baseFareEgp}
              onChange={(e) => setBaseFareEgp(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('saveRouteBtn')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
