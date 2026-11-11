import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useTenant } from '../../context/TenantContext';
import {
  ShieldCheck,
  Building2,
  CreditCard,
  Globe2,
  History,
  Languages,
  LayoutDashboard,
  ExternalLink,
  Menu,
  X,
  Server,
} from 'lucide-react';

export type SuperAdminTab = 'overview' | 'companies' | 'plans' | 'domains' | 'audit';

interface SuperAdminLayoutProps {
  currentTab: SuperAdminTab;
  onTabChange: (tab: SuperAdminTab) => void;
  children: React.ReactNode;
}

export const SuperAdminLayout: React.FC<SuperAdminLayoutProps> = ({
  currentTab,
  onTabChange,
  children,
}) => {
  const { locale, toggleLocale, t } = useLocale();
  const { setActiveView } = useTenant();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: SuperAdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: t('dashboard'), icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'companies', label: t('companiesDirectory'), icon: <Building2 className="w-4 h-4" /> },
    { id: 'plans', label: t('subscriptionPlans'), icon: <CreditCard className="w-4 h-4" /> },
    { id: 'domains', label: t('customDomains'), icon: <Globe2 className="w-4 h-4" /> },
    { id: 'audit', label: t('auditLogs'), icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden bg-[#0A1320] text-white p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#3563E9]" />
          <span className="font-bold text-sm">{t('superAdmin')}</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 text-slate-300 hover:text-white rounded-md cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar: Deep Obsidian Midnight (#0A1320) */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 bg-[#0A1320] text-slate-300 flex-shrink-0 flex flex-col justify-between border-e border-slate-800 z-30`}
      >
        <div>
          {/* Platform Identity */}
          <div className="p-5 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#3563E9] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight">
                  {t('platformName')}
                </h1>
                <span className="text-[10px] text-blue-400 font-mono tracking-wider uppercase font-semibold">
                  {t('superAdminPortal')}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-0.5">
            {navItems.map((item) => {
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-start cursor-pointer ${
                    active
                      ? 'bg-[#14243A] text-white font-semibold shadow-xs border border-slate-700/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <span className={active ? 'text-[#3563E9]' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 space-y-2">
          <div className="px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t('multiTenantCore')}</span>
          </div>

          <button
            onClick={() => setActiveView('dashboard')}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span>{t('companyDashboard')}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleLocale}
            className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Languages className="w-3.5 h-3.5" />
              <span>{t('languageLabel')}</span>
            </span>
            <span className="font-semibold text-slate-300">{t('langToggle')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium text-slate-400">{locale === 'ar' ? 'إدارة منصة ملاكي' : 'MALAKY SaaS Control'}</span>
            <span>/</span>
            <span className="font-semibold text-slate-900 capitalize">
              {navItems.find((n) => n.id === currentTab)?.label}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t('systemHealthy')}
            </span>
            <div className="w-7 h-7 rounded-full bg-[#0A1320] text-white flex items-center justify-center text-xs font-bold">
              SA
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
