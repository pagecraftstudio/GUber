import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import {
  LayoutDashboard,
  CalendarDays,
  Repeat,
  MapPin,
  Bus as BusIcon,
  Users,
  Ticket,
  GraduationCap,
  Palette,
  BarChart3,
  Languages,
  ExternalLink,
  ChevronRight,
  Shield,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export type DashboardTab =
  | 'overview'
  | 'trips'
  | 'schedules'
  | 'routes'
  | 'buses'
  | 'drivers'
  | 'bookings'
  | 'customers'
  | 'website'
  | 'reports';

interface DashboardLayoutProps {
  currentTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
}) => {
  const { currentCompany, companies, selectCompany, setActiveView } = useTenant();
  const { locale, toggleLocale, t } = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  interface NavGroup {
    title: string;
    items: Array<{ id: DashboardTab; label: string; icon: React.ReactNode }>;
  }

  const navGroups: NavGroup[] = [
    {
      title: locale === 'ar' ? 'التشغيل والحركة' : 'OPERATIONS',
      items: [
        { id: 'overview', label: t('dashboard'), icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'trips', label: t('trips'), icon: <CalendarDays className="w-4 h-4" /> },
        { id: 'schedules', label: t('recurringSchedules'), icon: <Repeat className="w-4 h-4" /> },
        { id: 'routes', label: t('routesAndStops'), icon: <MapPin className="w-4 h-4" /> },
      ],
    },
    {
      title: locale === 'ar' ? 'الأسطول والسائقون' : 'FLEET & CREW',
      items: [
        { id: 'buses', label: t('buses'), icon: <BusIcon className="w-4 h-4" /> },
        { id: 'drivers', label: t('drivers'), icon: <Users className="w-4 h-4" /> },
      ],
    },
    {
      title: locale === 'ar' ? 'الركاب والطلاب' : 'PASSENGERS & BOOKINGS',
      items: [
        { id: 'bookings', label: t('bookings'), icon: <Ticket className="w-4 h-4" /> },
        { id: 'customers', label: t('customers'), icon: <GraduationCap className="w-4 h-4" /> },
      ],
    },
    {
      title: locale === 'ar' ? 'الإدارة والتقارير' : 'MANAGEMENT',
      items: [
        { id: 'website', label: t('websiteCustomizer'), icon: <Palette className="w-4 h-4" /> },
        { id: 'reports', label: t('reports'), icon: <BarChart3 className="w-4 h-4" /> },
      ],
    },
  ];

  const brandName = locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn;

  // Flattened active tab label
  const activeItem = navGroups.flatMap((g) => g.items).find((n) => n.id === currentTab);

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-[#14243A] text-white p-3.5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs"
            style={{ backgroundColor: currentCompany.accentColor || '#3563E9' }}
          >
            <BusIcon className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight">{brandName}</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white rounded-md cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar: Midnight Navy (#14243A) */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 bg-[#14243A] text-slate-300 flex-shrink-0 flex flex-col justify-between border-e border-slate-800/80 z-30`}
      >
        <div>
          {/* Company Brand Lockup with Tenant Switcher */}
          <div className="p-4 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0"
                style={{ backgroundColor: currentCompany.accentColor || '#3563E9' }}
              >
                <BusIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-white tracking-tight truncate">
                    {brandName}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold truncate">
                    {t(currentCompany.status as any)} · {currentCompany.planId}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Switcher within Company Dashboard */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/60">
              <div className="relative">
                <select
                  aria-label={t('selectTenant')}
                  value={currentCompany.id}
                  onChange={(e) => selectCompany(e.target.value)}
                  className="w-full bg-[#1B2E48] text-slate-200 text-[11px] font-medium rounded-md px-2.5 py-1.5 pe-6 border border-slate-700/60 focus:outline-none focus:ring-1 focus:ring-[#3563E9] cursor-pointer appearance-none truncate"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#14243A] text-white">
                      {locale === 'ar' ? c.nameAr : c.nameEn}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute end-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Grouped Navigation Items */}
          <nav className="p-3 space-y-4">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="space-y-1">
                <h3 className="px-2.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {group.title}
                </h3>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onTabChange(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-start cursor-pointer ${
                          active
                            ? 'bg-[#1B2E48] text-white shadow-xs font-semibold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                        }`}
                      >
                        <span className={active ? 'text-[#3563E9]' : 'text-slate-400'}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800/80 space-y-1.5">
          {/* Quick jump to Public Website */}
          <button
            onClick={() => setActiveView('public')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/40 hover:bg-slate-800/80 text-xs text-slate-300 font-medium transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate">{t('previewLiveSite')}</span>
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 rtl:rotate-180" />
          </button>

          {/* Language Toggle */}
          <button
            onClick={toggleLocale}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{t('languageLabel')}</span>
            </span>
            <span className="font-semibold text-slate-300">{t('langToggle')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Breadcrumbs */}
        <header className="bg-white border-b border-slate-200/80 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-400 truncate max-w-[140px] sm:max-w-none">
              {brandName}
            </span>
            <span>/</span>
            <span className="font-semibold text-slate-900 capitalize">
              {activeItem?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-end hidden sm:block">
              <span className="text-xs font-semibold text-slate-800 block">
                {locale === 'ar' ? 'غرفة عمليات رحلات الجلالة' : 'Galala Dispatch Control'}
              </span>
              <span className="text-[10px] text-slate-400">
                {locale === 'ar' ? 'نظام تشغيل وإدارة الحافلات' : 'Fleet Operations Active'}
              </span>
            </div>
            <div
              className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0"
              style={{ backgroundColor: currentCompany.primaryColor || '#14243A' }}
            >
              {currentCompany.slug.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
