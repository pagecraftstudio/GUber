import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import { transportService } from '../../lib/transportService';
import { isMockMode } from '../../lib/runtime';
import { describeBackendError } from '../../lib/real/customerBackend';
import { Booking, Trip, Route, Bus, Stop } from '../../types';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { DigitalTicketView } from '../public/DigitalTicketView';
import {
  User,
  Ticket,
  Clock,
  Calendar,
  MapPin,
  CheckCircle2,
  AlertCircle,
  QrCode,
  GraduationCap,
  Users,
  Shield,
  KeyRound,
  LogOut,
  Phone,
  Mail,
  Plus,
  Trash2,
  ArrowRight,
  Sparkles,
  Info,
  Building2,
  Bus as BusIcon,
} from 'lucide-react';
import { authService } from '../../lib/authService';

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
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center space-y-4">
        <div className="w-14 h-14 bg-blue-100 text-[#3563E9] rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          {locale === 'ar' ? 'تسجيل الدخول مطلوب' : 'Authentication Required'}
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          {locale === 'ar'
            ? 'يرجى تسجيل الدخول للوصول إلى بوابة الركاب وإدارة تذاكرك وخصومات الطلاب المحفوظة.'
            : 'Please sign in to access your passenger portal, upcoming trip tickets, and Galala student verification.'}
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={() => openAuthModal('login')}>{t('signIn')}</Button>
          <Button variant="outline" onClick={() => openAuthModal('register')}>
            {t('signUp')}
          </Button>
        </div>
      </div>
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
      <div className="py-6">
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
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Customer Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#14243A] to-[#1C314E] text-white flex items-center justify-center font-bold text-xl shadow-md border-2 border-slate-100">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  {user?.fullName}
                </h1>
                {user?.studentId ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#3563E9] border border-blue-200">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>{t('galalaVerifiedStudent')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    <User className="w-3.5 h-3.5" />
                    <span>{locale === 'ar' ? 'مسافر منتظم' : 'Regular Commuter'}</span>
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1 font-mono">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {user?.email}
                </span>
                <span className="flex items-center gap-1 font-mono" dir="ltr">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {user?.phone}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar (Derived from authorized backend bookings - Correction #8) */}
          <div className="flex items-center gap-3 sm:gap-6 bg-slate-50 border border-slate-200/80 p-3 sm:p-4 rounded-xl">
            <div className="text-center px-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                {locale === 'ar' ? 'إجمالي الرحلات' : 'Total Trips'}
              </span>
              <span className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums">
                {totalTripsCount}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center px-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                {locale === 'ar' ? 'الإنفاق التراكمي' : 'Total Spent'}
              </span>
              <span className="text-lg sm:text-xl font-bold text-[#3563E9] tabular-nums">
                {totalSpentEgp} <span className="text-xs font-medium text-slate-500">{t('egp')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('trips')}
            className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'trips'
                ? 'bg-[#3563E9] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>{t('myBookings')}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">
              {bookings.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#3563E9] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>{t('profile')} & {locale === 'ar' ? 'كارنيه الجامعة' : 'Student ID'}</span>
          </button>

          <button
            onClick={() => setActiveTab('companions')}
            className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'companions'
                ? 'bg-[#3563E9] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{t('savedCompanionsTitle')}</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'security'
                ? 'bg-[#3563E9] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>{locale === 'ar' ? 'الأمان وجلسة الدخول' : 'Security & Session'}</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MY TRIPS & BOOKINGS */}
      {activeTab === 'trips' && (
        <div className="space-y-4">
          {/* Sub-filter chips */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl text-xs">
              <button
                onClick={() => setTripFilter('upcoming')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  tripFilter === 'upcoming' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {locale === 'ar' ? 'الرحلات القادمة' : 'Upcoming Departures'}
              </button>
              <button
                onClick={() => setTripFilter('completed')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  tripFilter === 'completed' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {locale === 'ar' ? 'الرحلات السابقة' : 'Past Trips'}
              </button>
              <button
                onClick={() => setTripFilter('cancelled')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  tripFilter === 'cancelled' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {isMockMode()
                  ? locale === 'ar' ? 'الملغاة وقيد المراجعة' : 'Cancelled & Requests'
                  : locale === 'ar' ? 'الملغاة' : 'Cancelled'}
              </button>
              <button
                onClick={() => setTripFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  tripFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {locale === 'ar' ? 'الكل' : 'All Bookings'}
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setActiveView('marketplace')}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              {locale === 'ar' ? 'حجز رحلة جديدة' : 'Book a New Trip'}
            </Button>
          </div>

          {/* Bookings List Cards */}
          {filteredBookings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <Ticket className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-sm">
                {locale === 'ar' ? 'لا توجد حجوزات في هذا التصنيف' : 'No bookings found in this category'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {locale === 'ar'
                  ? 'يمكنك استعراض جدول الرحلات المتاح لجامعة الجلالة من سوق الرحلات وحجز تذكرتك.'
                  : 'Explore available intercity departures to and from Galala University on the marketplace.'}
              </p>
              <Button size="sm" onClick={() => setActiveView('marketplace')} className="mt-2">
                {locale === 'ar' ? 'تصفح رحلات الجلالة' : 'Browse Galala Departures'}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredBookings.map((b) => {
                const trip = trips.find((t) => t.id === b.tripId);
                const route = routes.find((r) => r.id === trip?.routeId);
                const company = companies.find((c) => c.id === b.companyId);

                // Origin & Dest Stops
                const originStop = stops.find((s) => s.id === b.pickupStopId || s.id === route?.originStopId);
                const destStop = stops.find((s) => s.id === b.dropoffStopId || s.id === route?.destStopId);

                const isCancellationRequested = b.status === 'cancellation_requested';
                const isConfirmed = b.status === 'confirmed';
                const isBoarded = b.status === 'boarded';
                const isCancelled = b.status === 'cancelled';

                return (
                  <div
                    key={b.id}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm p-5 sm:p-6 transition-all space-y-4"
                  >
                    {/* Top Row: Company badge, Booking ref, and Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg text-white flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: company?.primaryColor || '#14243A' }}
                        >
                          <BusIcon className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-xs text-slate-900">
                          {locale === 'ar' ? company?.nameAr : company?.nameEn}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-xs text-slate-500 font-semibold">
                          {b.bookingReference}
                        </span>
                      </div>

                      {/* Status Badges - Correction #8: Clearly distinguish cancellation requests from confirmed cancellations */}
                      <div>
                        {isCancellationRequested && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{t('cancellationRequested')}</span>
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('confirmed')}</span>
                          </span>
                        )}
                        {isBoarded && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{t('boarded')}</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{t('cancelled')}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Route, Time, Seats & Fare */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 bg-slate-50/70 rounded-xl border border-slate-100 text-xs">
                      {/* Origin & Destination */}
                      <div className="sm:col-span-2 space-y-1">
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          <span>{locale === 'ar' ? route?.originCityAr : route?.originCityEn}</span>
                          <span className="text-slate-400">{locale === 'ar' ? '←' : '→'}</span>
                          <span className="text-[#0F9D8A]">{locale === 'ar' ? route?.destCityAr : route?.destCityEn}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{locale === 'ar' ? originStop?.nameAr : originStop?.nameEn}</span>
                        </div>
                      </div>

                      {/* Departure Date & Time */}
                      <div className="space-y-1">
                        <span className="text-slate-400 block font-medium">{t('departure')}</span>
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{trip?.departureDate}</span>
                        </div>
                        <div className="text-slate-600 font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#3563E9]" />
                          <span>{trip?.departureTime} ({t('arrival')}: {trip?.arrivalTime})</span>
                        </div>
                      </div>

                      {/* Seats & Paid Fare */}
                      <div className="space-y-1 sm:text-end">
                        <span className="text-slate-400 block font-medium">{t('seats')} & {t('fare')}</span>
                        <div className="font-bold text-base text-[#3563E9] tabular-nums">
                          {b.passengerCount || 1} {t('seats')}
                        </div>
                        <div className="font-bold text-slate-900 tabular-nums">
                          {b.fareEgp} {t('egp')}
                        </div>
                      </div>
                    </div>

                    {/* Passenger Manifest summary (Rule #4) */}
                    {b.passengers && b.passengers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">{t('passengersDetailsTitle')}:</span>
                        {b.passengers.map((p, idx) => (
                          <span
                            key={p.id}
                            className={`px-2 py-0.5 rounded border ${
                              p.status === 'boarded'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            {p.passengerName} (Pass {p.ticketIndex})
                            {p.status === 'boarded' && ' ✓ Boarded'}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notice for cancellation requested */}
                    {isCancellationRequested && (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                        <div className="font-bold flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" />
                          <span>{t('cancellationRequested')}:</span>
                        </div>
                        <p className="text-[11px]">{b.cancellationReason}</p>
                        <p className="text-[10px] text-amber-600">
                          {locale === 'ar'
                            ? 'سيتم مراجعة الطلب من المشغل واسترداد الرصيد وفقاً لسياسة الإلغاء.'
                            : 'The bus operator is reviewing this request according to the cancellation policy.'}
                        </p>
                      </div>
                    )}

                    {/* Bottom Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
                      <div className="text-[11px] text-slate-400 font-mono">
                        {b.qrTicketToken
                          ? `${locale === 'ar' ? 'رمز التذكرة المشفر' : 'Opaque Token'}: ${b.qrTicketToken.substring(0, 16)}...`
                          : ''}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Cancellation trigger. Real mode: the backend cancels immediately inside the window (no operator review),
                            so the UI says "Cancel Booking" and only offers it while the server says can_cancel. Mock mode keeps the demo request flow. */}
                        {isConfirmed && (isMockMode() || b.canCancel) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCancelModalBooking(b);
                              setCancelReason('');
                              setCancelError(null);
                            }}
                            className="text-red-600 hover:bg-red-50"
                          >
                            {isMockMode()
                              ? locale === 'ar' ? 'طلب إلغاء الرحلة' : 'Request Cancellation'
                              : locale === 'ar' ? 'إلغاء الحجز' : 'Cancel Booking'}
                          </Button>
                        )}
                        {isConfirmed && !isMockMode() && !b.canCancel && (
                          <span className="text-[11px] text-slate-500">
                            {locale === 'ar' ? 'انتهت فترة الإلغاء' : 'Cancellation period has ended'}
                          </span>
                        )}

                        {/* View Digital Ticket */}
                        {trip && (isMockMode() ? !!b.qrTicketToken : isConfirmed) && (
                          <Button
                            size="sm"
                            onClick={() => setViewTicketBooking({ booking: b, trip })}
                            icon={<QrCode className="w-3.5 h-3.5" />}
                          >
                            {t('viewBoardingPass')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROFILE & STUDENT ID */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {locale === 'ar' ? 'الملف الشخصي وكارنيه الطالب' : 'Customer Profile & Student Verification'}
            </h2>
            <p className="text-xs text-slate-500">
              {locale === 'ar'
                ? 'تحديث بياناتك الشخصية ورقم كارنيه جامعة الجلالة للتعبئة التلقائية عند الحجز والاستفادة من خصم الطلاب ١٥٪.'
                : 'Manage your contact details and Galala University student ID for automatic booking autofill and 15% discount.'}
            </p>
          </div>

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{locale === 'ar' ? 'تم حفظ التعديلات بنجاح!' : 'Profile updated successfully!'}</span>
            </div>
          )}

          <form onSubmit={handleProfileSave} className="space-y-4 max-w-xl">
            <Input
              label={t('fullNameLabel')}
              icon={<User className="w-4 h-4" />}
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={t('emailLabel')}
                type="email"
                icon={<Mail className="w-4 h-4" />}
                value={user?.email}
                disabled
                helperText={locale === 'ar' ? 'البريد الإلكتروني مرتبط بحسابك' : 'Managed by Supabase Auth'}
              />

              <Input
                label={t('phoneLabel')}
                type="tel"
                icon={<Phone className="w-4 h-4" />}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                required
              />
            </div>

            {/* University & Student ID */}
            <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-[#3563E9]" />
                  <span>{locale === 'ar' ? 'بيانات طالب جامعة الجلالة' : 'Galala Student Credentials'}</span>
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  {t('studentDiscountApplied')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={t('optionalStudentId')}
                  placeholder="e.g. GU-2024-8841"
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                  helperText={t('studentIdHint')}
                />

                <Input
                  label={locale === 'ar' ? 'الكلية / التخصص' : 'Faculty / Major'}
                  placeholder="e.g. Computer Science"
                  value={editUniversity}
                  onChange={(e) => setEditUniversity(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" loading={profileSaving}>
              {t('save')}
            </Button>
          </form>
        </div>
      )}

      {/* TAB 3: SAVED TRAVEL COMPANIONS */}
      {activeTab === 'companions' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {t('savedCompanionsTitle')}
              </h2>
              <p className="text-xs text-slate-500">
                {locale === 'ar'
                  ? 'احفظ أسماء زملائك أو أفراد عائلتك للتعبئة السريعة بضغطة زر عند حجز أكثر من مقعد.'
                  : 'Save your frequent classmates and travel buddies for 1-click multi-passenger ticket booking.'}
              </p>
            </div>
            {isMockMode() && (
              <Button
                size="sm"
                onClick={() => setIsAddCompanionOpen(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                {t('addCompanion')}
              </Button>
            )}
          </div>

          {/* Companions list */}
          {(!profile?.savedCompanions || profile.savedCompanions.length === 0) ? (
            <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">
                {locale === 'ar' ? 'لا يوجد مسافرون محفوظون حالياً' : 'No saved travel companions yet'}
              </p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                {locale === 'ar'
                  ? 'أضف زملاء السكن أو رفقاء الدراسة في جامعة الجلالة لإضافتهم فوراً لتذاكرك.'
                  : 'Add classmates or family members to easily select them during multi-seat booking.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {profile.savedCompanions.map((comp) => (
                <div
                  key={comp.id}
                  className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-slate-900 block">{comp.name}</span>
                    <span className="text-[11px] font-mono text-slate-500 block" dir="ltr">
                      {comp.phone}
                    </span>
                    {comp.studentId && (
                      <span className="inline-block text-[10px] font-mono bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded">
                        {comp.studentId}
                      </span>
                    )}
                    {comp.relationship && (
                      <span className="text-[10px] text-slate-400 ms-1.5">({comp.relationship})</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveCompanion(comp.id)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    title={t('delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SECURITY & SUPABASE AUTH STATUS */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {locale === 'ar' ? 'جلسة الدخول والأمان' : 'Security & Supabase Auth Session'}
            </h2>
            <p className="text-xs text-slate-500">
              {locale === 'ar'
                ? 'تفاصيل جلسة المصادقة الموثقة عبر Supabase Auth وتشفير بيانات التذاكر.'
                : 'Session proof, cryptographic security tokens, and account authentication details.'}
            </p>
          </div>

          <div className="space-y-4 max-w-xl">
            {/* Supabase status indicator (Rule #1) */}
            <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{locale === 'ar' ? 'جلسة مصادقة نشطة وموثقة' : 'Active Supabase Auth Session'}</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                {locale === 'ar'
                  ? 'يتم التحقق من الجلسة عبر رمز JWT صالح من خادم المصادقة، وليس عبر كائنات التخزين المحلي غير الموثقة.'
                  : 'Session signature and token expiration verified by cryptographic auth layer.'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs space-y-2 text-slate-700">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">User UUID:</span>
                <span>{user?.id}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Registered Email:</span>
                <span>{user?.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Account Created:</span>
                <span>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => signOut()}
                icon={<LogOut className="w-4 h-4" />}
              >
                {t('signOut')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL. Real mode = immediate cancellation (cancel_my_booking). Mock mode = demo request flow. */}
      <Modal
        isOpen={!!cancelModalBooking}
        onClose={() => setCancelModalBooking(null)}
        title={isMockMode() ? t('requestCancellationTitle') : locale === 'ar' ? 'إلغاء الحجز' : 'Cancel Booking'}
        subtitle={
          locale === 'ar'
            ? `الحجز رقم ${cancelModalBooking?.bookingReference}`
            : `Reservation ${cancelModalBooking?.bookingReference}`
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
            <div>
              <strong className="block font-semibold">
                {isMockMode()
                  ? locale === 'ar' ? 'سياسة استرداد الرصيد وإلغاء الرحلات' : 'Cancellation & Refund Credit Policy'
                  : locale === 'ar' ? 'الإلغاء فوري ونهائي' : 'Cancellation is immediate and final'}
              </strong>
              {isMockMode()
                ? locale === 'ar'
                  ? 'يتم قبول طلبات الإلغاء حتى ٣ ساعات قبل موعد انطلاق الحافلة، وتتم مراجعة الطلب من مشغل الرحلة لتحرير المقاعد وإعادة الرصيد.'
                  : 'Cancellations must be requested at least 3 hours prior to departure for transit credit return.'
                : locale === 'ar'
                  ? 'سيُلغى الحجز فوراً وتُحرَّر مقاعده دون مراجعة من المشغل، ولا يمكن التراجع. الإلغاء متاح حتى المهلة التي تحددها الشركة قبل موعد الانطلاق.'
                  : 'The booking is cancelled right away and its seats are released, with no operator review. This cannot be undone. Cancellation is available until the company\'s cut-off before departure.'}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('cancellationReasonLabel')}{isMockMode() ? ' *' : locale === 'ar' ? ' (اختياري)' : ' (optional)'}
            </label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3563E9] focus:border-transparent"
              placeholder={t('cancellationReasonPlaceholder')}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required={isMockMode()}
            />
            {cancelError && (
              <p role="alert" className="mt-2 text-xs text-red-600">
                {cancelError}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setCancelModalBooking(null)}>
              {isMockMode() ? t('cancel') : locale === 'ar' ? 'إبقاء الحجز' : 'Keep booking'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={cancelLoading}
              disabled={isMockMode() && !cancelReason.trim()}
              onClick={handleRequestCancellation}
            >
              {isMockMode() ? t('submitCancellationRequest') : locale === 'ar' ? 'إلغاء الحجز الآن' : 'Cancel booking now'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADD COMPANION MODAL */}
      <Modal
        isOpen={isAddCompanionOpen}
        onClose={() => setIsAddCompanionOpen(false)}
        title={t('addCompanion')}
        subtitle={
          locale === 'ar'
            ? 'سجل بيانات مرافق السفر لإضافته في تذاكر الحجز بنقرة واحدة'
            : 'Save companion info for instant 1-click multi-passenger booking'
        }
        maxWidth="sm"
      >
        <form onSubmit={handleAddCompanionSubmit} className="space-y-3.5">
          <Input
            label={t('companionName')}
            placeholder="e.g. Ahmed Tarek"
            value={compName}
            onChange={(e) => setCompName(e.target.value)}
            required
          />

          <Input
            label={t('phoneLabel')}
            type="tel"
            placeholder="01012345678"
            value={compPhone}
            onChange={(e) => setCompPhone(e.target.value)}
            required
          />

          <Input
            label={t('optionalStudentId')}
            placeholder="e.g. GU-2024-8850"
            value={compStudentId}
            onChange={(e) => setCompStudentId(e.target.value)}
          />

          <Input
            label={t('relationshipLabel')}
            placeholder="e.g. Classmate, Roommate, Family"
            value={compRelationship}
            onChange={(e) => setCompRelationship(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsAddCompanionOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" loading={companionSaving}>
              {t('save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
