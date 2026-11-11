import React, { createContext, useContext, useState, useEffect } from 'react';
import { Locale, translations } from '../lib/i18n';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  dir: 'ltr' | 'rtl';
  t: (key: keyof typeof translations['en']) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('en');

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('malaky_locale', l);
    } catch {}
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('malaky_locale') as Locale;
      if (saved === 'en' || saved === 'ar') {
        setLocaleState(saved);
      }
    } catch {}
  }, []);

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [dir, locale]);

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'ar' : 'en');
  };

  const t = (key: keyof typeof translations['en']): string => {
    const dict = translations[locale] || translations.en;
    return (dict as Record<string, string>)[key] || (translations.en as Record<string, string>)[key] || key;
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, toggleLocale, dir, t }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
};
