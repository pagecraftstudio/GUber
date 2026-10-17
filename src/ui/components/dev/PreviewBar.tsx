import React, { useState } from 'react';
import { useTenant, AppView } from '../../context/TenantContext';
import { useLocale } from '../../context/LocaleContext';
import { Store, Globe, LayoutDashboard, ShieldCheck, ChevronDown, EyeOff, Eye, Languages, Sparkles } from 'lucide-react';

export const PreviewBar: React.FC = () => {
  const { currentCompany, companies, selectCompany, activeView, setActiveView } = useTenant();
  const { locale, toggleLocale, t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="fixed top-2 end-2 z-50">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#14243A] text-white text-xs font-medium rounded-full shadow-lg border border-slate-700/80 hover:bg-[#1B2E48] transition-all cursor-pointer"
          title={t('showPreview')}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#3563E9]" />
          <span>{t('devSwitcherTitle')}</span>
          <Eye className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  const roleButtons: Array<{ id: AppView; label: string; icon: React.ReactNode }> = [
    {
      id: 'marketplace',
      label: t('marketplaceView'),
      icon: <Store className="w-3.5 h-3.5" />,
    },
    {
      id: 'public',
      label: t('publicSite'),
      icon: <Globe className="w-3.5 h-3.5" />,
    },
    {
      id: 'customer',
      label: t('customerPortal'),
      icon: <LayoutDashboard className="w-3.5 h-3.5 text-blue-400" />,
    },
    {
      id: 'dashboard',
      label: t('companyDashboard'),
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
    },
    {
      id: 'superadmin',
      label: t('superAdmin'),
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <aside aria-label="Development Preview Switcher" className="sticky top-0 z-50 bg-[#0E1A2B] text-slate-200 border-b border-slate-800 text-xs px-3 sm:px-4 py-2 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Role Navigation Buttons */}
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase pe-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {t('devSwitcherBadge')}
          </span>

          <div className="flex items-center bg-[#14243A] p-0.5 rounded-lg border border-slate-800">
            {roleButtons.map((rb) => {
              const active = activeView === rb.id;
              return (
                <button
                  key={rb.id}
                  onClick={() => setActiveView(rb.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#3563E9] text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {rb.icon}
                  <span>{rb.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Tenant Switcher (shown when in public or dashboard view), Language Toggle, Collapse */}
        <div className="flex items-center gap-2">
          {(activeView === 'public' || activeView === 'dashboard') && (
            <div className="flex items-center gap-1.5 bg-[#14243A] px-2.5 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] font-medium hidden md:inline">
                {t('selectTenant')}:
              </span>
              <div className="relative inline-block">
                <select
                  aria-label={t('selectTenant')}
                  value={currentCompany.id}
                  onChange={(e) => selectCompany(e.target.value)}
                  className="bg-transparent text-white text-xs font-medium pe-5 ps-1 py-0.5 focus:outline-none cursor-pointer appearance-none"
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#14243A] text-white">
                      {locale === 'ar' ? c.nameAr : c.nameEn} ({c.slug})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400 absolute end-0 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Language Toggle */}
          <button
            onClick={toggleLocale}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#14243A] hover:bg-[#1B2E48] text-slate-200 text-xs font-medium border border-slate-800 transition-colors cursor-pointer"
            title="Toggle Arabic / English"
          >
            <Languages className="w-3.5 h-3.5 text-blue-400" />
            <span>{t('langToggle')}</span>
          </button>

          {/* Minimize Button */}
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-md hover:bg-[#14243A] transition-colors cursor-pointer"
            title={t('hidePreview')}
            aria-label={t('hidePreview')}
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
