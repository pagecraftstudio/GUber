import React, { useState } from 'react';
import { useTenant } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../common/Button';
import {
  Bus,
  Languages,
  Phone,
  User,
  Ticket,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  GraduationCap,
} from 'lucide-react';

interface PublicHeaderProps {
  onBookClick: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({ onBookClick }) => {
  const { currentCompany, setActiveView } = useTenant();
  const { locale, toggleLocale, t } = useLocale();
  const { user, isAuthenticated, signOut } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const brandName = locale === 'ar' ? currentCompany.nameAr : currentCompany.nameEn;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Wordmark */}
        <a href="#hero" className="flex items-center gap-2.5 text-slate-900 group whitespace-nowrap shrink-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-xs font-bold text-sm"
            style={{ backgroundColor: currentCompany.primaryColor }}
          >
            <Bus className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
              {brandName}
            </span>
            <span className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
              {locale === 'ar' ? currentCompany.taglineAr : currentCompany.taglineEn}
            </span>
          </div>
        </a>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#search" className="hover:text-[#3563E9] transition-colors whitespace-nowrap shrink-0">
            {t('findRoute')}
          </a>
          <a href="#routes" className="hover:text-[#3563E9] transition-colors whitespace-nowrap shrink-0">
            {t('popularRoutes')}
          </a>
          <a href="#how-to-book" className="hover:text-[#3563E9] transition-colors whitespace-nowrap shrink-0">
            {t('howToBook')}
          </a>
          <a href="#faqs" className="hover:text-[#3563E9] transition-colors whitespace-nowrap shrink-0">
            {t('faqsTitle')}
          </a>
        </nav>

        {/* Zone 3: Actions & Customer Auth */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <a
            href={`tel:${currentCompany.phone}`}
            className="hidden xl:flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1"
          >
            <Phone className="w-3.5 h-3.5 text-[#3563E9]" />
            <span className="tabular-nums" dir="ltr">{currentCompany.phone}</span>
          </a>

          {/* Theme Toggle */}
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
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors text-xs font-semibold flex items-center gap-1 cursor-pointer"
            title="Toggle Language"
          >
            <Languages className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">{t('langToggle')}</span>
          </button>

          {/* Customer Auth Button / Menu */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 ps-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer text-xs font-semibold"
              >
                <div className="w-6 h-6 rounded-lg bg-[#14243A] text-white flex items-center justify-center font-bold text-xs">
                  {user.fullName.charAt(0)}
                </div>
                <span className="hidden sm:inline truncate max-w-[100px]">{user.fullName}</span>
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
              <a href="/login" className="p-2 text-slate-700 hover:text-slate-900 font-semibold text-xs flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('logIn')}</span>
              </a>
              <a href="/register" className="p-2 text-slate-700 hover:text-slate-900 font-semibold text-xs hidden sm:inline">
                {t('register')}
              </a>
              <a href="/company/login" className="p-2 text-slate-400 hover:text-slate-700 text-xs hidden md:inline whitespace-nowrap">
                {t('operatorLogin')}
              </a>
            </>
          )}

          <Button
            size="sm"
            onClick={onBookClick}
            style={{ backgroundColor: currentCompany.accentColor || '#3563E9' }}
          >
            {t('bookYourSeat')}
          </Button>
        </div>
      </div>
    </header>
  );
};
