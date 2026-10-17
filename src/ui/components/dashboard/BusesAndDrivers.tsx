import React, { useState } from 'react';
import { Bus, Driver } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Plus, Bus as BusIcon, Users, Wrench, ShieldCheck, Phone } from 'lucide-react';

interface BusesAndDriversProps {
  buses: Bus[];
  drivers: Driver[];
  onRefresh: () => void;
}

export const BusesAndDrivers: React.FC<BusesAndDriversProps> = ({
  buses,
  drivers,
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const [activeTab, setActiveTab] = useState<'buses' | 'drivers'>('buses');
  const [isBusModalOpen, setIsBusModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);

  // New Bus form
  const [plateNumber, setPlateNumber] = useState('ط ر ج ٥٥٢٠');
  const [model, setModel] = useState('Mercedes-Benz Tourismo (50 Seats)');
  const [capacity, setCapacity] = useState('50');
  const [year, setYear] = useState('2024');

  // New Driver form
  const [fullNameEn, setFullNameEn] = useState('Captain Mahmoud Abdel Aal');
  const [fullNameAr, setFullNameAr] = useState('كابتن محمود عبد العال');
  const [driverPhone, setDriverPhone] = useState('+20 100 449 8812');
  const [licenseNumber, setLicenseNumber] = useState('LIC-CAI-78192');

  const handleCreateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    await transportService.createBus({
      companyId: currentCompany.id,
      plateNumber,
      model,
      capacity: parseInt(capacity) || 50,
      status: 'active',
      features: ['wifi', 'ac', 'usb'],
      year: parseInt(year) || 2024,
    });
    setIsBusModalOpen(false);
    onRefresh();
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    await transportService.createDriver({
      companyId: currentCompany.id,
      fullNameEn,
      fullNameAr,
      phone: driverPhone,
      licenseNumber,
      status: 'active',
    });
    setIsDriverModalOpen(false);
    onRefresh();
  };

  const handleBusStatusToggle = async (busId: string, currentStatus: Bus['status']) => {
    const nextStatus = currentStatus === 'active' ? 'maintenance' : 'active';
    await transportService.updateBusStatus(busId, nextStatus);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {activeTab === 'buses' ? t('buses') : t('drivers')}
          </h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar' ? 'إدارة جاهزية الحافلات، والتراخيص الميدانية، واعتماد كباتن الرحلات.' : 'Maintain fleet readiness, vehicle compliance, and licensed driver dispatch.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('buses')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'buses' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t('fleetBuses')} ({buses.length})
            </button>
            <button
              onClick={() => setActiveTab('drivers')}
              className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'drivers' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t('captains')} ({drivers.length})
            </button>
          </div>

          {activeTab === 'buses' ? (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsBusModalOpen(true)}>
              {t('addCoach')}
            </Button>
          ) : (
            <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setIsDriverModalOpen(true)}>
              {t('addDriver')}
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'buses' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map((bus) => (
            <div
              key={bus.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{bus.model}</h3>
                    <div className="font-mono text-xs font-semibold text-slate-600 mt-0.5">
                      {bus.plateNumber}
                    </div>
                  </div>
                  <Badge status={bus.status as any} label={t(bus.status as any)} />
                </div>

                <div className="text-xs text-slate-500 space-y-1.5 mt-3">
                  <div className="flex justify-between">
                    <span>{t('passengerCapacity')}:</span>
                    <strong className="text-slate-900 tabular-nums">{bus.capacity} {t('seats')}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('modelYear')}:</span>
                    <span className="text-slate-900 tabular-nums">{bus.year}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('installedAmenities')}:</span>
                    <span className="text-slate-700 capitalize">{bus.features.join(' · ')}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{t('gpsMonitored')}</span>
                <button
                  onClick={() => handleBusStatusToggle(bus.id, bus.status)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  {bus.status === 'active' ? t('markInMaintenance') : t('markActive')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((driver) => (
            <div
              key={driver.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {locale === 'ar' ? driver.fullNameAr : driver.fullNameEn}
                    </h3>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                      {driver.licenseNumber}
                    </div>
                  </div>
                  <Badge status={driver.status as any} label={t(driver.status as any)} />
                </div>

                <div className="text-xs text-slate-500 space-y-1.5 mt-3">
                  <div className="flex justify-between">
                    <span>{t('phoneContact')}</span>
                    <span dir="ltr" className="text-slate-900 font-mono tabular-nums">{driver.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('passengerRating')}</span>
                    <strong className="text-amber-600 tabular-nums">★ {driver.rating} / 5.0</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('routeVerification')}</span>
                    <span className="text-emerald-700 font-medium">{t('galalaCertified')}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Bus Modal */}
      <Modal
        isOpen={isBusModalOpen}
        onClose={() => setIsBusModalOpen(false)}
        title={t('registerCoachModal')}
        subtitle={t('registerCoachDesc')}
      >
        <form onSubmit={handleCreateBus} className="space-y-4">
          <Input
            label={t('coachModelSpec')}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            required
          />
          <Input
            label={t('egyptianLicensePlate')}
            value={plateNumber}
            onChange={(e) => setPlateNumber(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              label={t('seatCapacityLabel')}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
            <Input
              type="number"
              label={t('manufactureYearLabel')}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsBusModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('registerCoach')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Driver Modal */}
      <Modal
        isOpen={isDriverModalOpen}
        onClose={() => setIsDriverModalOpen(false)}
        title={t('registerDriverModal')}
        subtitle={t('registerDriverDesc')}
      >
        <form onSubmit={handleCreateDriver} className="space-y-4">
          <Input
            label={t('driverFullNameEn')}
            value={fullNameEn}
            onChange={(e) => setFullNameEn(e.target.value)}
            required
          />
          <Input
            label={t('driverFullNameAr')}
            value={fullNameAr}
            onChange={(e) => setFullNameAr(e.target.value)}
            required
          />
          <Input
            label={t('driverPhoneLabel')}
            value={driverPhone}
            onChange={(e) => setDriverPhone(e.target.value)}
            required
          />
          <Input
            label={t('driverLicenseLabel')}
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDriverModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm">
              {t('registerDriver')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
