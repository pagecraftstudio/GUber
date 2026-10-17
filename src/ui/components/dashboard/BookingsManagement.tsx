import React, { useState } from 'react';
import { Booking, Trip, Route, Driver } from '../../types';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { Pagination } from '../common/Pagination';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DriverScannerModal } from './DriverScannerModal';
import { Search, ArrowUpDown, CheckCircle2, XCircle, Scan, AlertCircle, Info } from 'lucide-react';

interface BookingsManagementProps {
  bookings: Booking[];
  trips: Trip[];
  routes: Route[];
  drivers?: Driver[];
  onRefresh: () => void;
}

export const BookingsManagement: React.FC<BookingsManagementProps> = ({
  bookings,
  trips,
  routes,
  drivers = [],
  onRefresh,
}) => {
  const { locale, t } = useLocale();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'ref' | 'fare' | 'passenger'>('ref');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const pageSize = 8;

  // Scanner modal state
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Cancellation confirm dialog
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  let filteredBookings = bookings.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      b.bookingReference.toLowerCase().includes(q) ||
      b.passengerName.toLowerCase().includes(q) ||
      b.passengerPhone.includes(q) ||
      (b.studentId || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  filteredBookings.sort((a, b) => {
    let diff = 0;
    if (sortBy === 'ref') {
      diff = a.bookingReference.localeCompare(b.bookingReference);
    } else if (sortBy === 'fare') {
      diff = a.fareEgp - b.fareEgp;
    } else if (sortBy === 'passenger') {
      diff = a.passengerName.localeCompare(b.passengerName);
    }
    return sortOrder === 'asc' ? diff : -diff;
  });

  const totalItems = filteredBookings.length;
  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const toggleSort = (field: 'ref' | 'fare' | 'passenger') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const handleUpdateStatus = async (bookingId: string, status: Booking['status']) => {
    await transportService.updateBookingStatus(bookingId, status);
    onRefresh();
  };

  const handleApproveCancellation = async (bookingId: string) => {
    await transportService.approveBookingCancellation(bookingId);
    onRefresh();
  };

  const handleRejectCancellation = async (bookingId: string) => {
    await transportService.rejectBookingCancellation(bookingId);
    onRefresh();
  };

  const handleConfirmCancel = async () => {
    if (!bookingToCancel) return;
    setCancelLoading(true);
    try {
      await transportService.updateBookingStatus(bookingToCancel.id, 'cancelled');
      setCancelLoading(false);
      setBookingToCancel(null);
      onRefresh();
    } catch {
      setCancelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t('bookings')}</h2>
          <p className="text-xs text-slate-500">
            {locale === 'ar'
              ? 'تدقيق بيانات الركاب والتحقق من كارنيه الطالب ومراجعة طلبات الإلغاء وتسجيل الصعود.'
              : 'Audit passenger manifests, review cancellation requests, and record boardings with atomic duplicate-scan protection.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Driver Boarding Scanner Trigger Button (Correction #6) */}
          <Button
            size="sm"
            onClick={() => setIsScannerOpen(true)}
            icon={<Scan className="w-3.5 h-3.5" />}
          >
            {t('driverScannerTitle')}
          </Button>

          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {t('totalManifestText')} <strong className="text-slate-900">{bookings.length}</strong> {t('passengersText')}
          </span>
        </div>
      </div>

      {/* Filters & Search - Correction #8: Clearly distinguish cancellation requests */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: t('all') },
            { id: 'confirmed', label: t('confirmed') },
            { id: 'cancellation_requested', label: t('cancellationRequested') },
            { id: 'boarded', label: t('boarded') },
            { id: 'cancelled', label: t('cancelled') },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setStatusFilter(item.id);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === item.id
                  ? 'bg-[#14243A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder={t('searchRefOrName')}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            icon={<Search className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-start font-semibold">
                <th
                  onClick={() => toggleSort('ref')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('bookingRef')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('passenger')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('passenger')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">{t('phone')}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t('studentId')}</th>
                <th className="py-3 px-4 whitespace-nowrap">{t('seats')}</th>
                <th
                  onClick={() => toggleSort('fare')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    <span>{t('fare')}</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">{t('status')}</th>
                <th className="py-3 px-4 text-end whitespace-nowrap">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <p className="font-semibold">{t('noBookingsMatchFilter')}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {locale === 'ar'
                        ? 'لا توجد حجوزات تطابق الفلتر أو كلمة البحث.'
                        : 'No passenger records match your current filters.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedBookings.map((b) => {
                  const isCancellationRequested = b.status === 'cancellation_requested';

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {b.bookingReference}
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block">{b.passengerName}</span>
                        {b.passengers && b.passengers.length > 1 && (
                          <span className="text-[10px] text-slate-400 block">
                            +{b.passengers.length - 1} guests
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono tabular-nums text-slate-600" dir="ltr">
                        {b.passengerPhone}
                      </td>

                      <td className="py-3 px-4">
                        {b.studentId ? (
                          <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] font-medium">
                            {b.studentId}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t('regularStudent')}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-bold text-[#3563E9] tabular-nums">
                        {b.passengerCount || 1} {t('seats')}
                      </td>

                      <td className="py-3 px-4 font-bold tabular-nums text-slate-900">
                        {b.fareEgp} {t('egp')}
                      </td>

                      {/* Status column - Correction #8: Clearly distinguish cancellation requests from confirmed cancellations */}
                      <td className="py-3 px-4">
                        {isCancellationRequested ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              <AlertCircle className="w-3 h-3" />
                              <span>{t('cancellationRequested')}</span>
                            </span>
                            {b.cancellationReason && (
                              <span className="block text-[10px] text-amber-700 max-w-[180px] truncate" title={b.cancellationReason}>
                                {b.cancellationReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge status={b.status} label={t(b.status as any)} />
                        )}
                      </td>

                      {/* Actions column */}
                      <td className="py-3 px-4 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* If cancellation requested: Approve or Reject */}
                          {isCancellationRequested && (
                            <>
                              <button
                                onClick={() => handleApproveCancellation(b.id)}
                                className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-bold text-[11px] transition-colors cursor-pointer"
                                title="Approve cancellation and restore seats"
                              >
                                {locale === 'ar' ? 'قبول الإلغاء' : 'Approve Cancel'}
                              </button>
                              <button
                                onClick={() => handleRejectCancellation(b.id)}
                                className="px-2 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium text-[11px] transition-colors cursor-pointer"
                                title="Reject cancellation and keep booking confirmed"
                              >
                                {locale === 'ar' ? 'رفض' : 'Reject'}
                              </button>
                            </>
                          )}

                          {b.status === 'confirmed' && (
                            <button
                              onClick={() => handleUpdateStatus(b.id, 'boarded')}
                              className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              {t('markBoarded')}
                            </button>
                          )}

                          {b.status !== 'cancelled' && !isCancellationRequested && (
                            <button
                              onClick={() => setBookingToCancel(b)}
                              className="px-2 py-1 rounded text-red-600 hover:bg-red-50 text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              {t('cancelAction')}
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

      {/* Confirmation Dialog for Cancellation */}
      <ConfirmDialog
        isOpen={!!bookingToCancel}
        onClose={() => setBookingToCancel(null)}
        onConfirm={handleConfirmCancel}
        title={t('cancelAction')}
        message={
          locale === 'ar'
            ? `هل أنت متأكد من رغبتك في إلغاء حجز ${bookingToCancel?.passengerName} (مرجع: ${bookingToCancel?.bookingReference})؟ سيتم إعادة المقاعد إلى السعة المتاحة للرحلة.`
            : `Are you sure you want to cancel the reservation for ${bookingToCancel?.passengerName} (Ref: ${bookingToCancel?.bookingReference})? Reserved seats will be released back to the trip capacity.`
        }
        confirmLabel={t('cancelAction')}
        variant="danger"
        loading={cancelLoading}
      />

      {/* Driver Scanner Modal (Correction #6) */}
      <DriverScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        trips={trips}
        drivers={drivers}
        routes={routes}
        onBoardingSuccess={onRefresh}
      />
    </div>
  );
};
