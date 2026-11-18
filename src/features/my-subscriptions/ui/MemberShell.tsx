'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { HeaderLogo } from '@/ds/brand/HeaderLogo';
import { DsLangProvider } from '@/ds/lang';
import { Button } from '@/ds/primitives/Button';
import { buttonClass } from '@/ds/primitives/button-class';
import { MT } from './text';

/** Member pages frame: logo, link back to the bookings portal, language switch. The language is the portal's own choice (localStorage `malaky_locale`). */
export function MemberShell({ children, backHref = '/my-bookings' }: { children: (lang: 'en' | 'ar') => ReactNode; backHref?: string }) {
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  useEffect(() => {
    try { if (localStorage.getItem('malaky_locale') === 'ar') setLang('ar'); } catch { /* storage blocked: English */ }
  }, []);
  useEffect(() => { document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang; }, [lang]);
  const flip = () => { const n = lang === 'en' ? 'ar' : 'en'; setLang(n); try { localStorage.setItem('malaky_locale', n); } catch { /* ignore */ } };
  const t = MT[lang];
  return (
    <DsLangProvider value={lang}>
      <header className="border-b border-line-default bg-surface-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="MASAR"><HeaderLogo /></Link>
          <nav className="flex items-center gap-2">
            <Link href={backHref} className={buttonClass('secondary', 'md')}>{t.back}</Link>
            <Button variant="secondary" onClick={flip}>{t.language}</Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>{children(lang)}</main>
    </DsLangProvider>
  );
}
