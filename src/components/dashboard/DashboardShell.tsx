'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Route, BusFront, Users, CalendarDays, Ticket, Globe2,
  Menu, X, Sun, Moon, Languages, LogOut, ChevronLeft, ChevronRight, Search,
  Bell, Settings2, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

type Props = { companyName: string; fullName: string; role: string; permissions: string[]; children: React.ReactNode; logoutAction: () => void };
const nav = [
  { href:'/dashboard', key:'overview', icon:LayoutDashboard, permission:null },
  { href:'/dashboard/routes', key:'routes', icon:Route, permission:'routes.read' },
  { href:'/dashboard/buses', key:'buses', icon:BusFront, permission:'buses.read' },
  { href:'/dashboard/drivers', key:'drivers', icon:Users, permission:'drivers.read' },
  { href:'/dashboard/trips', key:'trips', icon:CalendarDays, permission:'trips.read' },
  { href:'/dashboard/bookings', key:'bookings', icon:Ticket, permission:'bookings.read' },
  { href:'/dashboard/website', key:'website', icon:Globe2, permission:'website.read' },
] as const;
const labels:any = {
  en:{overview:'Overview',routes:'Routes',buses:'Fleet',drivers:'Drivers',trips:'Trips',bookings:'Bookings',website:'Website',workspace:'WORKSPACE',manage:'Manage your operations',search:'Search anything...',signout:'Sign out',collapse:'Collapse sidebar',expand:'Expand sidebar',language:'العربية',welcome:'Good to see you',operator:'OPERATOR CONSOLE'},
  ar:{overview:'نظرة عامة',routes:'المسارات',buses:'أسطول الحافلات',drivers:'السائقون',trips:'الرحلات',bookings:'الحجوزات',website:'الموقع الإلكتروني',workspace:'مساحة العمل',manage:'إدارة عمليات شركتك',search:'ابحث هنا...',signout:'تسجيل الخروج',collapse:'تصغير القائمة',expand:'توسيع القائمة',language:'English',welcome:'أهلاً بعودتك',operator:'لوحة تحكم المشغل'}
};
export function DashboardShell({companyName,fullName,role,permissions,children,logoutAction}:Props) {
  const pathname=usePathname();
  const [lang,setLang]=useState<'en'|'ar'>('en');
  const [theme,setTheme]=useState<'light'|'dark'>('light');
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  useEffect(()=>{
    const l=localStorage.getItem('malaky-dashboard-language');
    const t=localStorage.getItem('malaky-dashboard-theme');
    if(l==='ar'||l==='en') setLang(l);
    if(t==='dark'||t==='light') setTheme(t);
  },[]);
  useEffect(()=>{
    document.documentElement.lang=lang;
    document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    document.documentElement.classList.toggle('dark',theme==='dark');
    localStorage.setItem('malaky-dashboard-language',lang);
    localStorage.setItem('malaky-dashboard-theme',theme);
  },[lang,theme]);
  const t=labels[lang];
  const visible=useMemo(()=>nav.filter(n=>!n.permission||permissions.includes(n.permission)),[permissions]);
  const sidebarWidth=collapsed?'w-[88px]':'w-[264px]';
  return <div className="dashboard-root min-h-screen bg-[#f6f8fb] text-slate-900 transition-colors dark:bg-[#0b1120] dark:text-slate-100" dir={lang==='ar'?'rtl':'ltr'}>
    {mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"/>}
    <aside className={`fixed inset-y-0 z-50 flex ${sidebarWidth} flex-col border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-[#101827] ${lang==='ar'?'right-0 border-l':'left-0 border-r'} ${mobileOpen?'translate-x-0':lang==='ar'?'translate-x-full lg:translate-x-0':'-translate-x-full lg:translate-x-0'}`}>
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-5 dark:border-slate-800">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white shadow-lg shadow-blue-600/20">M</div>
        {!collapsed&&<div className="min-w-0"><div className="text-[17px] font-extrabold tracking-tight">MALAKY<span className="text-blue-600">.</span></div><div className="text-[9px] font-bold tracking-[.22em] text-slate-400">BUS MANAGEMENT</div></div>}
        <button onClick={()=>setMobileOpen(false)} className="ms-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden"><X size={18}/></button>
      </div>
      <div className="px-3 pt-5">
        {!collapsed&&<p className="px-3 pb-3 text-[10px] font-bold tracking-[.18em] text-slate-400">{t.workspace}</p>}
        <nav className="space-y-1">{visible.map(item=>{const active=item.href==='/dashboard'?pathname==='/dashboard':pathname.startsWith(item.href);const Icon=item.icon;return <Link key={item.key} href={item.href} onClick={()=>setMobileOpen(false)} title={collapsed?t[item.key]:undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition ${active?'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300':'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}><Icon size={19} strokeWidth={1.9}/>{!collapsed&&<span>{t[item.key]}</span>}{active&&!collapsed&&<span className="ms-auto h-1.5 w-1.5 rounded-full bg-blue-600"/>}</Link>})}</nav>
      </div>
      <div className="mt-auto p-3">
        {!collapsed&&<div className="mb-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70"><p className="truncate text-xs font-bold">{companyName}</p><p className="mt-1 truncate text-[10px] capitalize text-slate-500">{role.replaceAll('_',' ')}</p></div>}
        <button onClick={()=>setCollapsed(!collapsed)} className="hidden w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 lg:flex">{collapsed?(lang==='ar'?<ChevronLeft size={18}/>:<ChevronRight size={18}/>):<><PanelLeftClose size={18}/>{t.collapse}</>}</button>
        <form action={logoutAction}><button className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10"><LogOut size={18}/>{!collapsed&&t.signout}</button></form>
      </div>
    </aside>
    <div className={`min-h-screen transition-all duration-200 ${lang==='ar'?(collapsed?'lg:mr-[88px]':'lg:mr-[264px]'):(collapsed?'lg:ml-[88px]':'lg:ml-[264px]')}`}>
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0d1524]/90 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={()=>setMobileOpen(true)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"><Menu size={20}/></button>
          <div className="hidden min-w-0 sm:block"><p className="text-[10px] font-bold tracking-[.18em] text-slate-400">{t.operator}</p><p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{companyName}</p></div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-800/70 md:flex"><Search size={15}/><span>{t.search}</span><kbd className="ms-8 rounded border border-slate-200 px-1.5 py-0.5 text-[9px] dark:border-slate-700">⌘ K</kbd></div>
          <button aria-label="Toggle language" onClick={()=>setLang(lang==='en'?'ar':'en')} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"><Languages size={15}/><span>{t.language}</span></button>
          <button aria-label="Toggle theme" onClick={()=>setTheme(theme==='light'?'dark':'light')} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</button>
          <div className="ms-1 hidden h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 sm:grid">{fullName.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div>
          <div className="hidden sm:block"><p className="max-w-32 truncate text-xs font-bold">{fullName}</p><p className="text-[10px] text-slate-400">{role.replaceAll('_',' ')}</p></div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-7 lg:px-9">{children}</main>
    </div>
  </div>
}
