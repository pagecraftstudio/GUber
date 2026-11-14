import React, { useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { useAuth } from '../../context/AuthContext';
import { useTenant } from '../../context/TenantContext';
import { useTheme } from '../../context/ThemeContext';

import { MarketplaceHeaderMasar } from '@/ds/shell/MarketplaceHeaderMasar';

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
    <MarketplaceHeaderMasar
      lang={locale}
      links={[
        { label: t('navSearchTrips'), href: '#search-section' },
        ...(onBrowseOperators ? [{ label: t('allOperators'), onClick: onBrowseOperators }] : []),
        { label: t('myBookings'), href: '/my-bookings' },
        { label: t('operatorLogin'), href: '/company/login', quiet: true },
      ]}
      langLabel={t('langToggle')}
      onToggleLang={toggleLocale}
      isDark={resolvedTheme === 'dark'}
      onToggleTheme={toggleTheme}
      user={isAuthenticated && user ? { fullName: user.fullName, email: user.email, studentId: user.studentId } : null}
      text={{ logIn: t('logIn'), register: t('register'), myBookings: t('myBookings'), portal: t('customerPortal'), signOut: t('signOut') }}
      onMyBookings={() => setActiveView('customer')}
      onPortal={() => setActiveView('customer')}
      onSignOut={() => { void signOut(); }}
    />
  );
};
