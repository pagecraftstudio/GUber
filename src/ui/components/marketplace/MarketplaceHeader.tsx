import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../common/Button';
import {
  Bus,
  Languages,
  User,
  Ticket,
  LogOut,
  Moon,
  Sun,
  GraduationCap,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface MarketplaceHeaderProps {
  onBrowseOperators?: () => void;
}

export const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({ onBrowseOperators }) => {
  const { locale, toggleLocale, t } = useLocale();
  const { user, isAuthenticated, signOut } = useAuth();
  const { setActiveView } = useTenant();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Marketplace Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#14243A] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            <Bus className="w-5 h-5 text-[#3563E9]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
                MALAKY Bus Hub
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-[#3563E9] border border-blue-200 px-1.5 py-0.2 rounded">
                {locale === 'ar' ? 'سوق الرحلات' : 'Marketplace'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
              {locale === 'ar' ? 'سوق رحلات جامعة الجلالة الموحد' : 'Galala University Intercity Transit Marketplace'}
            </p>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <a href="#search-section" className="hover:text-[#3563E9] transition-colors whitespace-nowrap">
            {t('navSearchTrips')}
          </a>
          <button
            onClick={onBrowseOperators}
            className="hover:text-[#3563E9] transition-colors whitespace-nowrap cursor-pointer"
          >
            {t('allOperators')}
          </button>
          <a href="/my-bookings" className="hover:text-[#3563E9] transition-colors whitespace-nowrap">
            {t('myBookings')}
          </a>
          <a href="/company/login" className="text-slate-400 hover:text-[#3563E9] transition-colors whitespace-nowrap">
            {t('operatorLogin')}
          </a>
        </nav>

        {/* Zone 3: Actions (Theme, Language, Auth) */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Theme Toggle (Light / Dark) */}
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors text-xs cursor-pointer"
            title={resolvedTheme === 'dark' ? t('lightMode') : t('darkMode')}
            aria-label="Toggle theme mode"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-500" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Language Toggle */}
          <button
            onClick={toggleLocale}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            title="Toggle Arabic / English"
          >
            <Languages className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">{t('langToggle')}</span>
          </button>

          {/* Customer Auth Button / User Dropdown */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 ps-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer text-xs font-semibold"
              >
                <div className="w-6 h-6 rounded-lg bg-[#14243A] text-white flex items-center justify-center font-bold text-xs">
                  {user.fullName.charAt(0)}
                </div>
                <span className="hidden sm:inline truncate max-w-[120px]">{user.fullName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute end-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-50 text-xs">
                  <div className="px-3.5 py-2 border-b border-slate-100 space-y-0.5">
                    <span className="font-bold text-slate-900 block truncate">{user.fullName}</span>
                    <span className="text-[10px] text-slate-500 block truncate font-mono">{user.email}</span>
                    {user.studentId && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-medium mt-1">
                        <GraduationCap className="w-3 h-3" />
                        {user.studentId}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setActiveView('customer');
                    }}
                    className="w-full text-start px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#3563E9] flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <Ticket className="w-4 h-4 text-slate-400" />
                    <span>{t('myBookings')}</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setActiveView('customer');
                    }}
                    className="w-full text-start px-3.5 py-2 text-slate-700 hover:bg-slate-50 hover:text-[#3563E9] flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>{t('customerPortal')}</span>
                  </button>

                  <div className="border-t border-slate-100 my-1" />

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      signOut();
                    }}
                    className="w-full text-start px-3.5 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('signOut')}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <a href="/login" className="px-2 py-1.5 text-xs font-semibold text-slate-700 hover:text-[#3563E9] whitespace-nowrap">
                {t('logIn')}
              </a>
              <a href="/register">
                <Button size="sm" icon={<User className="w-3.5 h-3.5" />}>{t('register')}</Button>
              </a>
            </>
          )}
        </div>
      </div>
      {/* Small screens: the same entry points, in one scrollable strip */}
      <nav className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-5 overflow-x-auto text-xs font-semibold text-slate-600">
        <a href="#search-section" className="whitespace-nowrap">{t('navSearchTrips')}</a>
        <a href="/my-bookings" className="whitespace-nowrap">{t('myBookings')}</a>
        <a href="/company/login" className="whitespace-nowrap text-slate-400">{t('operatorLogin')}</a>
      </nav>
    </header>
  );
};
