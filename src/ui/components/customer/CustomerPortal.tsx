import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { isMockMode } from '../../lib/runtime';
import { describeBackendError } from '../../lib/real/customerBackend';
import { Booking, Trip, Route, Bus, Stop } from '../../types';

import { DigitalTicketView } from '../public/DigitalTicketView';
import { authService } from '../../lib/authService';
import { EmptyState } from '@/ds/feedback/States';
import { Button as DsButton } from '@/ds/primitives/Button';
import { CustomerPortalMasarView } from '../masar/CustomerPortalMasarView';
import { J6C } from '../masar/text6c';

export const CustomerPortal: React.FC = () => {
  const { user, profile, isAuthenticated, signOut, updateProfile, openAuthModal } = useAuth();
  const { locale, t } = useLocale();
  const { companies, setActiveView } = useTenant();

  const [activeTab, setActiveTab] = useState<'trips' | 'profile' | 'companions' | 'security'>('trips');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);

  // Trips filter: 'all' | 'upcoming' | 'completed' | 'cancellation_requested'
  const [tripFilter, setTripFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('upcoming');

  // Modal states
  const [viewTicketBooking, setViewTicketBooking] = useState<{ booking: Booking; trip: Trip } | null>(null);
  const [cancelModalBooking, setCancelModalBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Profile edit state
  const [editFullName, setEditFullName] = useState(profile?.fullName || user?.fullName || '');
  const [editPhone, setEditPhone] = useState(profile?.phone || user?.phone || '');
  const [editStudentId, setEditStudentId] = useState(profile?.studentId || user?.studentId || '');
  const [editUniversity, setEditUniversity] = useState(profile?.university || user?.university || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Add Companion modal state
  const [isAddCompanionOpen, setIsAddCompanionOpen] = useState(false);
  const [compName, setCompName] = useState('');
  const [compPhone, setCompPhone] = useState('');
  const [compStudentId, setCompStudentId] = useState('');
  const [compRelationship, setCompRelationship] = useState('');
  const [companionSaving, setCompanionSaving] = useState(false);

  // Load customer bookings & contextual data
  const loadCustomerData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // bookings first: in real mode the trip/route catalogue is derived from the rows the database returns for them
      const userBookings = await transportService.getCustomerBookings(user.id);
      const [allTrips, allRoutes, allBuses, allStops] = await Promise.all([
        transportService.getTrips(),
        transportService.getRoutes(),
        transportService.getBuses(),
        transportService.getStops(),
      ]);
      setTrips(allTrips);
      setRoutes(allRoutes);
      setBuses(allBuses);
      setStops(allStops);
      setBookings(userBookings);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadCustomerData();
      if (profile) {
        setEditFullName(profile.fullName || user?.fullName || '');
        setEditPhone(profile.phone || user?.phone || '');
        setEditStudentId(profile.studentId || user?.studentId || '');
        setEditUniversity(profile.university || user?.university || '');
      }
    }
  }, [user?.id, isAuthenticated, profile]);

  if (!isAuthenticated) {
    const x = J6C[locale];
    return (
      <main className="mx-auto max-w-md px-4 py-20">
        <EmptyState title={x.signInTitle} description={x.signInText} action={<div className="flex flex-wrap justify-center gap-2"><DsButton onClick={() => openAuthModal('login')}>{t('signIn')}</DsButton><DsButton variant="secondary" onClick={() => openAuthModal('register')}>{t('signUp')}</DsButton></div>} />
      </main>
    );
  }

  // Correction #8: Customer statistics derived from authorized backend data
  const nonCancelledBookings = bookings.filter((b) => b.status !== 'cancelled');
  const totalTripsCount = nonCancelledBookings.length;
  const totalSpentEgp = nonCancelledBookings.reduce((sum, b) => sum + b.fareEgp, 0);

  // Filter bookings for display
  const filteredBookings = bookings.filter((b) => {
    if (tripFilter === 'upcoming') {
      return b.status === 'confirmed' || b.status === 'cancellation_requested';
    }
    if (tripFilter === 'completed') {
      return b.status === 'boarded';
    }
    if (tripFilter === 'cancelled') {
      return b.status === 'cancelled' || b.status === 'cancellation_requested';
    }
    return true;
  });

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await updateProfile({
        fullName: editFullName.trim(),
        phone: editPhone.trim(),
        studentId: editStudentId.trim() || undefined,
        university: editUniversity.trim() || undefined,
      });
      setProfileSaving(false);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileSaving(false);
    }
  };

  const handleRequestCancellation = async () => {
    if (!cancelModalBooking || (isMockMode() && !cancelReason.trim())) return;
    setCancelLoading(true);
    try {
      await transportService.requestBookingCancellation(cancelModalBooking.id, cancelReason);
      setCancelLoading(false);
      setCancelModalBooking(null);
      setCancelReason('');
      await loadCustomerData();
    } catch (err) {
      setCancelLoading(false);
      setCancelError(describeBackendError(err, locale));
    }
  };

  const handleAddCompanionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim() || !compPhone.trim() || !user?.id) return;
    setCompanionSaving(true);
    try {
      await authService.addSavedCompanion(user.id, {
        name: compName.trim(),
        phone: compPhone.trim(),
        studentId: compStudentId.trim() || undefined,
        relationship: compRelationship.trim() || undefined,
      });
      setCompanionSaving(false);
      setIsAddCompanionOpen(false);
      setCompName('');
      setCompPhone('');
      setCompStudentId('');
      setCompRelationship('');
      const updatedProfile = await authService.getCustomerProfile(user.id);
      if (updatedProfile) {
        await updateProfile(updatedProfile);
      }
    } catch {
      setCompanionSaving(false);
    }
  };

  const handleRemoveCompanion = async (companionId: string) => {
    if (!user?.id) return;
    await authService.removeSavedCompanion(user.id, companionId);
    const updatedProfile = await authService.getCustomerProfile(user.id);
    if (updatedProfile) {
      await updateProfile(updatedProfile);
    }
  };

  // If viewing a digital ticket
  if (viewTicketBooking) {
    return (
      <div className="bg-surface-page py-6">
        <DigitalTicketView
          booking={viewTicketBooking.booking}
          trip={viewTicketBooking.trip}
          routes={routes}
          buses={buses}
          onDone={() => setViewTicketBooking(null)}
        />
      </div>
    );
  }

  return (
    <CustomerPortalMasarView
      user={user ? { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone, studentId: user.studentId, createdAt: user.createdAt } : null}
      mock={isMockMode()}
      stats={{ trips: totalTripsCount, spent: totalSpentEgp }}
      filter={tripFilter} onFilter={setTripFilter}
      bookings={filteredBookings} trips={trips} routes={routes} stops={stops} loading={loading}
      companyOf={(b) => companies.find((c) => c.id === b.companyId)}
      onBrowse={() => setActiveView('marketplace')}
      onViewTicket={(booking, trip) => setViewTicketBooking({ booking, trip })}
      onAskCancel={(b) => { setCancelModalBooking(b); setCancelReason(''); setCancelError(null); }}
      profile={{ name: editFullName, phone: editPhone, studentId: editStudentId, university: editUniversity, saving: profileSaving, saved: profileSuccess, onName: setEditFullName, onPhone: setEditPhone, onStudentId: setEditStudentId, onUniversity: setEditUniversity, onSubmit: handleProfileSave }}
      companions={profile?.savedCompanions ?? []} onRemoveCompanion={handleRemoveCompanion} onOpenAddCompanion={() => setIsAddCompanionOpen(true)}
      onSignOut={() => signOut()}
      cancel={{ booking: cancelModalBooking, reason: cancelReason, loading: cancelLoading, error: cancelError, onReason: setCancelReason, onClose: () => setCancelModalBooking(null), onConfirm: handleRequestCancellation }}
      add={{ open: isAddCompanionOpen, name: compName, phone: compPhone, studentId: compStudentId, relationship: compRelationship, saving: companionSaving, onName: setCompName, onPhone: setCompPhone, onStudentId: setCompStudentId, onRelationship: setCompRelationship, onClose: () => setIsAddCompanionOpen(false), onSubmit: handleAddCompanionSubmit }}
    />
  );
};
