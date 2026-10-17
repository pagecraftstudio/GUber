import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company } from '../types';
import { transportService } from '../lib/transportService';
import { isMockMode } from '../lib/runtime';
import { demoCompanyId } from '../lib/demoDefaults';

export type AppView = 'marketplace' | 'public' | 'dashboard' | 'superadmin' | 'customer';

interface TenantContextType {
  currentCompany: Company;
  companies: Company[];
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  selectCompany: (companyId: string) => void;
  navigateToCompanyPublicSite: (companyId: string) => void;
  updateCompany: (updates: Partial<Company>) => Promise<void>;
  reloadCompanies: () => Promise<void>;
}

/** Neutral placeholder for real mode before any company has been loaded. Contains no demo data. */
const EMPTY_COMPANY: Company = {
  id: '', slug: '', nameEn: '', nameAr: '', taglineEn: '', taglineAr: '', logoText: '', primaryColor: '#14243A',
  accentColor: '#3563E9', phone: '', email: '', supportAddressEn: '', supportAddressAr: '', status: 'active',
  planId: 'starter', createdAt: '', marketplaceListed: false, rating: 0,
  websiteConfig: { heroTitleEn: '', heroTitleAr: '', heroSubtitleEn: '', heroSubtitleAr: '', heroNoticeEn: '', heroNoticeAr: '', faqs: [], perks: [] },
};

/** Development-mock-only demo company. Never used in real mode. */
const DEMO_FALLBACK_COMPANY: Company = process.env.NODE_ENV === 'production' ? ({} as Company) : {
      id: 'comp_galala_connect',
      slug: 'galala-connect',
      nameEn: 'Galala Connect',
      nameAr: 'جلالة كونكت',
      taglineEn: 'Student transit',
      taglineAr: 'نقل طلابي',
      logoText: 'GalalaConnect',
      primaryColor: '#14243A',
      accentColor: '#3563E9',
      phone: '+20 100 248 9911',
      email: 'support@galalaconnect.com',
      supportAddressEn: 'Galala Plateau',
      supportAddressAr: 'هضبة الجلالة',
      status: 'active' as const,
      planId: 'growth' as const,
      createdAt: '2025-08-15',
      marketplaceListed: true,
      rating: 4.9,
      websiteConfig: {
        heroTitleEn: 'Fast, Comfortable Commutes to Galala University',
        heroTitleAr: 'رحلات سريعة ومريحة إلى جامعة الجلالة',
        heroSubtitleEn: 'Connecting Cairo and Canal cities directly with Galala University',
        heroSubtitleAr: 'ربط القاهرة ومدن القناة بجامعة الجلالة مباشرة',
        heroNoticeEn: 'Demo Data: Indicative student commuter transit for testing',
        heroNoticeAr: 'بيانات تجريبية توضيحية لاختبار المنصة',
        faqs: [],
        perks: [],
      },
    };

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string>(demoCompanyId());
  const [activeView, setActiveView] = useState<AppView>('marketplace');

  const reloadCompanies = async () => {
    const list = await transportService.getCompanies();
    setCompanies(list);
  };

  useEffect(() => {
    reloadCompanies();
  }, []);

  const currentCompany: Company =
    companies.find((c) => c.id === currentCompanyId) ||
    companies[0] ||
    (isMockMode() ? DEMO_FALLBACK_COMPANY : EMPTY_COMPANY);

  const selectCompany = (companyId: string) => {
    setCurrentCompanyId(companyId);
  };

  const navigateToCompanyPublicSite = (companyId: string) => {
    setCurrentCompanyId(companyId);
    setActiveView('public');
  };

  const updateCompany = async (updates: Partial<Company>) => {
    const updated = await transportService.updateCompany(currentCompany.id, updates);
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  return (
    <TenantContext.Provider
      value={{
        currentCompany,
        companies,
        activeView,
        setActiveView,
        selectCompany,
        navigateToCompanyPublicSite,
        updateCompany,
        reloadCompanies,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
