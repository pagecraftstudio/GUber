import React, { useState, useEffect } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { transportService } from '../../lib/transportService';
import { Trip, Route, Bus, Driver, RecurringSchedule, Booking, Customer } from '../../types';
import { DashboardLayout, DashboardTab } from './DashboardLayout';
import { OverviewMetrics } from './OverviewMetrics';
import { TripsManagement } from './TripsManagement';
import { RecurringSchedules } from './RecurringSchedules';
import { RoutesAndStops } from './RoutesAndStops';
import { BusesAndDrivers } from './BusesAndDrivers';
import { BookingsManagement } from './BookingsManagement';
import { CustomersList } from './CustomersList';
import { WebsiteCustomizer } from './WebsiteCustomizer';
import { ReportsView } from './ReportsView';
import { ToastContainer, ToastMessage } from '../common/Toast';

export const CompanyDashboard: React.FC = () => {
  const { currentCompany } = useTenant();
  const { locale, t } = useLocale();
  const [currentTab, setCurrentTab] = useState<DashboardTab>('overview');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
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

  const loadAllData = async () => {
    const [tr, r, s, b, d, sc, bk, cs] = await Promise.all([
      transportService.getTrips(currentCompany.id),
      transportService.getRoutes(currentCompany.id),
      transportService.getStops(currentCompany.id),
      transportService.getBuses(currentCompany.id),
      transportService.getDrivers(currentCompany.id),
      transportService.getRecurringSchedules(currentCompany.id),
      transportService.getBookings(currentCompany.id),
      transportService.getCustomers(currentCompany.id),
    ]);
    setTrips(tr);
    setRoutes(r);
    setStops(s);
    setBuses(b);
    setDrivers(d);
    setSchedules(sc);
    setBookings(bk);
    setCustomers(cs);
  };

  useEffect(() => {
    loadAllData();
  }, [currentCompany.id]);

  const handleUpdateTripStatus = async (tripId: string, status: Trip['status']) => {
    await transportService.updateTripStatus(tripId, status);
    addToast('info', t('status'), `${t(status as any)}`);
    loadAllData();
  };

  return (
    <DashboardLayout currentTab={currentTab} onTabChange={(tab) => setCurrentTab(tab)}>
      {currentTab === 'overview' && (
        <OverviewMetrics
          trips={trips}
          routes={routes}
          buses={buses}
          drivers={drivers}
          bookings={bookings}
          onUpdateTripStatus={handleUpdateTripStatus}
          onNavigateTab={(tab) => setCurrentTab(tab)}
        />
      )}

      {currentTab === 'trips' && (
        <TripsManagement
          trips={trips}
          routes={routes}
          buses={buses}
          drivers={drivers}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم تحديث جدول الرحلات' : 'Trips roster updated');
          }}
        />
      )}

      {currentTab === 'schedules' && (
        <RecurringSchedules
          schedules={schedules}
          routes={routes}
          buses={buses}
          drivers={drivers}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم تحديث الجداول الدورية' : 'Recurring schedule updated');
          }}
        />
      )}

      {currentTab === 'routes' && (
        <RoutesAndStops
          routes={routes}
          stops={stops}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم حفظ خط السير' : 'Route network updated');
          }}
        />
      )}

      {currentTab === 'buses' && (
        <BusesAndDrivers
          buses={buses}
          drivers={drivers}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم تحديث الأسطول' : 'Fleet updated');
          }}
        />
      )}

      {currentTab === 'drivers' && (
        <BusesAndDrivers
          buses={buses}
          drivers={drivers}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم تحديث الكباتن' : 'Driver roster updated');
          }}
        />
      )}

      {currentTab === 'bookings' && (
        <BookingsManagement
          bookings={bookings}
          trips={trips}
          routes={routes}
          drivers={drivers}
          onRefresh={() => {
            loadAllData();
            addToast('success', locale === 'ar' ? 'تم تحديث سجل الحجوزات' : 'Bookings updated');
          }}
        />
      )}

      {currentTab === 'customers' && (
        <CustomersList customers={customers} />
      )}

      {currentTab === 'website' && (
        <WebsiteCustomizer />
      )}

      {currentTab === 'reports' && (
        <ReportsView
          routes={routes}
          trips={trips}
          bookings={bookings}
        />
      )}

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </DashboardLayout>
  );
};
