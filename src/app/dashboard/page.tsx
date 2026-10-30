import Link from 'next/link';
import { ArrowUpRight, BusFront, CalendarDays, Route, Ticket, Users, Globe2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { requireTenant } from '@/lib/auth/guards';
const cards=[
 {href:'/dashboard/routes',key:'routes',label:'Routes',hint:'Manage destinations and lines',icon:Route,permission:'routes.read'},
 {href:'/dashboard/buses',key:'buses',label:'Fleet',hint:'Vehicles and capacity',icon:BusFront,permission:'buses.read'},
 {href:'/dashboard/drivers',key:'drivers',label:'Drivers',hint:'Driver profiles and licenses',icon:Users,permission:'drivers.read'},
 {href:'/dashboard/trips',key:'trips',label:'Trips',hint:'Schedules and assignments',icon:CalendarDays,permission:'trips.read'},
 {href:'/dashboard/bookings',key:'bookings',label:'Bookings',hint:'Passengers and payments',icon:Ticket,permission:'bookings.read'},
 {href:'/dashboard/website',key:'website',label:'Website',hint:'Brand and contact settings',icon:Globe2,permission:'website.read'}];
export default async function DashboardPage(){
 const ctx=await requireTenant(); const visible=cards.filter(c=>ctx.membership.permissions.includes(c.permission));
 return <div><PageHeader eyebrow="Operator workspace" title={`Welcome back, ${ctx.fullName.split(' ')[0]}`} description="Here is your operations workspace. Choose a module to get started." action={<Link href="/dashboard/trips" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"><Plus size={16}/> Create a trip</Link>}/>
 <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(c=>{const Icon=c.icon;return <Link key={c.key} href={c.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"><div className="mb-5 flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Icon size={20}/></div><ArrowUpRight size={17} className="text-slate-300 transition group-hover:text-blue-600"/></div><h2 className="font-bold text-slate-900 dark:text-white">{c.label}</h2><p className="mt-1 text-xs text-slate-500">{c.hint}</p></Link>})}</div>
 <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600">Your workspace</p><h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{ctx.membership.companyName}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Your company data is isolated from other operators. Access to each module is controlled by your assigned permissions.</p></section></div>
}