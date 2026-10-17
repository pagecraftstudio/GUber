import React, { useState } from 'react';
import { RecurringSchedule, Route, Bus, Driver } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Select } from '../common/Select';
import { Input } from '../common/Input';
import { Plus, Clock, Calendar, Check, Repeat } from 'lucide-react';

interface RecurringSchedulesProps {
  schedules: RecurringSchedule[];
  routes: Route[];
  buses: Bus[];
  drivers: Driver[];
  onRefresh: () => void;
}

export const RecurringSchedules: React.FC<RecurringSchedulesProps> = ({
  schedules,
  routes,
  buses,
  drivers,
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [routeId, setRouteId] = useState(routes[0]?.id || '');
  const [departureTime, setDepartureTime] = useState('07:00');
  const [busId, setBusId] = useState(buses[0]?.id || '');
  const [driverId, setDriverId] = useState(drivers[0]?.id || '');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4]); // Sun-Thu

  const daysLabels = [t('sun'), t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat')];

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter((d) => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort());
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await transportService.createRecurringSchedule({
      companyId: currentCompany.id,
      routeId: routeId || routes[0]?.id || '',
      departureTime,
      daysOfWeek: selectedDays,
      busId: busId || buses[0]?.id || '',
      driverId: driverId || drivers[0]?.id || '',
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
            {t('recurringSchedules')}
          </h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar' ? 'تحديد مواعيد الرحلات الدورية الآلية لطلاب الجامعة للفصل الدراسي.' : 'Define recurring automated timetable rules for semester university commuters.'}
          </p>
        </div>

        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsModalOpen(true)}>
          {t('createRecurringScheduleTitle')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {schedules.map((sched) => {
          const route = routes.find((r) => r.id === sched.routeId);
          const bus = buses.find((b) => b.id === sched.busId);
          const driver = drivers.find((d) => d.id === sched.driverId);

          return (
            <div
              key={sched.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {locale === 'ar' ? route?.originCityAr : route?.originCityEn} →{' '}
                      {locale === 'ar' ? route?.destCityAr : route?.destCityEn}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#3563E9] font-semibold mt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{t('dailyDepartureAt')} {sched.departureTime}</span>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Check className="w-3 h-3" />
                    {t('activeRule')}
                  </span>
                </div>

                {/* Days of week chips */}
                <div className="flex items-center gap-1.5 mb-4">
                  {daysLabels.map((dayLabel, idx) => {
                    const isSelected = sched.daysOfWeek.includes(idx);
                    return (
                      <span
                        key={dayLabel}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isSelected
                            ? 'bg-[#14243A] text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {dayLabel}
                      </span>
                    );
                  })}
                </div>

                <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
                  <div>{t('assignedBusLabel')} <span className="font-medium text-slate-800">{bus?.model}</span></div>
                  <div>{t('driverLabel')} <span className="font-medium text-slate-800">{locale === 'ar' ? driver?.fullNameAr : driver?.fullNameEn}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t('createRecurringScheduleTitle')}
        subtitle={t('createRecurringScheduleDesc')}
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label={t('selectRoute')}
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            options={routes.map((r) => ({
              value: r.id,
              label: `${locale === 'ar' ? `${r.originCityAr} ← ${r.destCityAr}` : `${r.originCityEn} → ${r.destCityEn}`}`,
            }))}
          />

          <Input
            type="time"
            label={t('departureTime')}
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {t('operatingDays')}
            </label>
            <div className="flex items-center gap-1.5">
              {daysLabels.map((dayLabel, idx) => {
                const active = selectedDays.includes(idx);
                return (
                  <button
                    key={dayLabel}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#3563E9] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label={t('assignedCoach')}
              value={busId}
              onChange={(e) => setBusId(e.target.value)}
              options={buses.map((b) => ({ value: b.id, label: b.model }))}
            />
            <Select
              label={t('driver')}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              options={drivers.map((d) => ({ value: d.id, label: locale === 'ar' ? d.fullNameAr : d.fullNameEn }))}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
