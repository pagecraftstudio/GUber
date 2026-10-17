import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { isMockMode } from '../../lib/runtime';
import { Trip, Route, Driver, Booking } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  QrCode,
  Scan,
  CheckCircle2,
  AlertTriangle,
  User,
  ShieldCheck,
  Clock,
  Sparkles,
  Bus as BusIcon,
} from 'lucide-react';

interface DriverScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips: Trip[];
  drivers: Driver[];
  routes: Route[];
  onBoardingSuccess?: () => void;
}

export const DriverScannerModal: React.FC<DriverScannerModalProps> = ({
  isOpen,
  onClose,
  trips,
  drivers,
  routes,
  onBoardingSuccess,
}) => {
  const { locale, t } = useLocale();
  const { currentCompany } = useTenant();

  const [selectedTripId, setSelectedTripId] = useState<string>(trips[0]?.id || '');
  const [ticketToken, setTicketToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    passengerName?: string;
    ticketIndex?: number;
    boardedAt?: string;
  } | null>(null);

  const selectedTrip = trips.find((t) => t.id === selectedTripId) || trips[0];
  const route = routes.find((r) => r.id === selectedTrip?.routeId);
  const driver = drivers.find((d) => d.id === selectedTrip?.driverId) || drivers[0];

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketToken.trim()) return;

    setLoading(true);
    setScanResult(null);

    try {
      const res = await transportService.verifyAndBoardPassengerTicket({
        ticketToken: ticketToken.trim(),
        tripId: selectedTrip?.id,
        operatorId: currentCompany.id,
        driverId: driver?.id,
      });

      setLoading(false);
      setScanResult({
        success: true,
        message: res.message,
        passengerName: res.ticket.passengerName,
        ticketIndex: res.ticket.ticketIndex,
        boardedAt: res.ticket.boardedAt,
      });

      if (onBoardingSuccess) {
        onBoardingSuccess();
      }
    } catch (err: any) {
      setLoading(false);
      setScanResult({
        success: false,
        message: err.message || 'Validation error during ticket scanning.',
      });
    }
  };

  // Demo-only helper. The tokens live in a mock module that is imported behind a build-time constant, so production bundles omit them.
  const showSampleScans = process.env.NODE_ENV !== 'production' && isMockMode();
  const handleSimulateSampleScan = (mode: 'valid' | 'duplicate') => {
    if (process.env.NODE_ENV === 'production') return;
    void import('../../lib/mock/sampleScanTokens').then((m) => {
      setTicketToken(m.SAMPLE_SCAN_TOKENS[mode]);
      setScanResult(null);
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('driverScannerTitle')}
      subtitle={
        locale === 'ar'
          ? `التحقق الأمني من تذاكر الصعود للحافلة ومنع المحاولات المكررة (${currentCompany.nameEn})`
          : `Atomic boarding verification and duplicate-scan protection for ${currentCompany.nameEn}`
      }
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Driver & Trip Manifest Context (Correction #6: derive driver identity from session) */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#3563E9]" />
              <span>
                {locale === 'ar' ? 'السائق المعتمد:' : 'Authenticated Driver:'}{' '}
                {locale === 'ar' ? driver?.fullNameAr : driver?.fullNameEn}
              </span>
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
              {locale === 'ar' ? 'جلسة نشطة' : 'On-Duty'}
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/80">
            <span>
              {t('trip')}: {locale === 'ar' ? route?.originCityAr : route?.originCityEn} →{' '}
              {locale === 'ar' ? route?.destCityAr : route?.destCityEn}
            </span>
            <span className="font-mono font-semibold">{selectedTrip?.departureTime}</span>
          </div>
        </div>

        {showSampleScans && (
        <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
            <Sparkles className="w-3.5 h-3.5 text-[#3563E9]" />
            <span>{locale === 'ar' ? 'اختبار المسح السريع للمعاينة' : 'Quick Test Scan Simulator'}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleSimulateSampleScan('valid')}
              className="px-2.5 py-1.5 bg-white border border-blue-200 hover:border-blue-400 rounded-lg text-xs font-semibold text-slate-800 hover:bg-blue-50/50 transition-colors cursor-pointer"
            >
              ✓ {locale === 'ar' ? 'رمز تذكرة صالحة (كريم السيد)' : 'Scan Valid Ticket (Karim)'}
            </button>
            <button
              type="button"
              onClick={() => handleSimulateSampleScan('duplicate')}
              className="px-2.5 py-1.5 bg-white border border-red-200 hover:border-red-400 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50/50 transition-colors cursor-pointer"
            >
              ⚠️ {locale === 'ar' ? 'محاكاة مسح مكرر (تذكرة صعدت مسبقاً)' : 'Simulate Duplicate Scan'}
            </button>
          </div>
        </div>
        )}

        {/* Scan Token Input Form */}
        <form onSubmit={handleScanSubmit} className="space-y-4">
          <Input
            label={t('scanOrEnterToken')}
            icon={<Scan className="w-4 h-4 text-[#3563E9]" />}
            placeholder="malaky_sec_tk_..."
            value={ticketToken}
            onChange={(e) => setTicketToken(e.target.value)}
            helperText={
              locale === 'ar'
                ? 'رمز الأمان الرقمي المولد من الخادم والمشفر في رمز QR'
                : 'Cryptographically opaque random token generated by backend'
            }
            required
          />

          <Button type="submit" loading={loading} className="w-full" icon={<Scan className="w-4 h-4" />}>
            {t('verifyAndBoardAction')}
          </Button>
        </form>

        {/* Scan Result Feedback */}
        {scanResult && (
          <div
            className={`p-4 rounded-xl border space-y-2 text-xs ${
              scanResult.success
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {scanResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <strong className="block text-sm font-bold">
                  {scanResult.success
                    ? locale === 'ar'
                      ? 'تم تأكيد الصعود بنجاح'
                      : 'Boarding Approved'
                    : locale === 'ar'
                    ? 'فشل التحقق من الصعود'
                    : 'Boarding Rejected'}
                </strong>
                <p className="leading-relaxed">{scanResult.message}</p>
                {scanResult.boardedAt && (
                  <span className="block text-[11px] font-mono text-emerald-700">
                    {t('timestamp')}: {new Date(scanResult.boardedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
