/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { LocaleProvider } from './context/LocaleContext';
import { TenantProvider, useTenant, type AppView } from './context/TenantContext';
import { AuthProvider, useAuth, type AuthModalMode } from './context/AuthContext';
import { PreviewBar } from './components/dev/PreviewBar';
import { MasterMarketplace } from './components/marketplace/MasterMarketplace';
import { PublicWebsite } from './components/public/PublicWebsite';
import { CompanyDashboard } from './components/dashboard/CompanyDashboard';
import { SuperAdminPortal } from './components/superadmin/SuperAdminPortal';
import { CustomerPortal } from './components/customer/CustomerPortal';
import { AuthModal } from './components/auth/AuthModal';
import { isMockMode } from './lib/runtime';
import { useLocale } from './context/LocaleContext';

/** Views whose operations are not wired to the backend yet. Real mode shows this instead of fake or failing screens. */
const NotAvailableYet: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { locale } = useLocale();
  const ar = locale === 'ar';
  return (
    <main role="status" className="max-w-xl mx-auto px-4 py-24 text-center space-y-4">
      <h1 className="text-xl font-bold">{ar ? 'هذه الصفحة غير متاحة بعد' : 'This area is not available yet'}</h1>
      <p className="text-sm text-slate-500">
        {ar ? 'لم يتم ربط هذه اللوحة بالنظام بعد.' : 'This section has not been connected to the platform yet.'}
      </p>
      <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg bg-[#14243A] text-white text-sm font-medium">
        {ar ? 'العودة إلى الحجز' : 'Back to trip search'}
      </button>
    </main>
  );
};

/** How a server route enters the client app. All fields are UX only; authorization is server-side + RLS. */
export interface AppEntry {
  /** First screen. Never a staff view in real mode (those render NotAvailableYet). */
  initialView?: AppView;
  /** Dedicated /login or /register page: open the auth modal immediately and hand off to /continue after sign-in. */
  authPage?: Exclude<AuthModalMode, 'forgot_password'>;
  /** Where /continue should go after sign-in on a dedicated auth page (allow-listed server-side). */
  nextAfterAuth?: string;
}

const AppContent: React.FC<AppEntry> = ({ authPage, nextAfterAuth }) => {
  const { activeView, setActiveView } = useTenant();
  const { isAuthModalOpen, authModalMode, closeAuthModal, openAuthModal, isAuthenticated, loading } = useAuth();
  const requested = useRef(false); // we asked for the modal
  const shown = useRef(false); // the modal was actually rendered open at least once

  // Dedicated auth page: open the modal once, then (a) after sign-in let the SERVER pick the destination by the
  // user's real role (/continue), (b) if the person dismisses the modal without signing in, go back to the marketplace.
  useEffect(() => {
    if (authPage && !loading && !isAuthenticated && !requested.current) {
      requested.current = true;
      openAuthModal(authPage);
    }
  }, [authPage, loading, isAuthenticated, openAuthModal]);
  useEffect(() => {
    if (!authPage || loading) return;
    if (isAuthModalOpen) shown.current = true;
    if (isAuthenticated) {
      const q = nextAfterAuth ? `?next=${encodeURIComponent(nextAfterAuth)}` : '';
      window.location.assign(`/continue${q}`);
    } else if (shown.current && !isAuthModalOpen) {
      window.location.assign('/');
    }
  }, [authPage, nextAfterAuth, loading, isAuthenticated, isAuthModalOpen]);

  return (
    <div className="min-h-screen bg-[var(--surface-page)] text-[var(--text-primary)] transition-colors duration-200">
      {/* Developer-only Preview Switcher */}
      {isMockMode() && <PreviewBar />}

      {/* Main Multi-Tenant View Router */}
      {activeView === 'marketplace' && <MasterMarketplace />}
      {activeView === 'public' && <PublicWebsite />}
      {activeView === 'customer' && <CustomerPortal />}
      {activeView === 'dashboard' && (isMockMode() ? <CompanyDashboard /> : <NotAvailableYet onBack={() => setActiveView('marketplace')} />)}
      {activeView === 'superadmin' && (isMockMode() ? <SuperAdminPortal /> : <NotAvailableYet onBack={() => setActiveView('marketplace')} />)}

      {/* Global Customer Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        defaultMode={authModalMode}
      />
    </div>
  );
};

export default function App(entry: AppEntry) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <TenantProvider initialView={entry.initialView}>
          <AuthProvider>
            <AppContent {...entry} />
          </AuthProvider>
        </TenantProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
