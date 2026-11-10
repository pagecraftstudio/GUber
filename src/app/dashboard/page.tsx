import { T, Bi } from '@/components/dashboard/T';
import Link from 'next/link';
import { ArrowUpRight, BusFront, CalendarDays, Route, Ticket, Users, Globe2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { requireTenant } from '@/lib/auth/guards';
import { isSurfaceScoped } from '@/ds/scope';
import { OverviewMasarView } from '@/features/dashboard/masar/OverviewMasarView';
import { createClient } from '@/lib/supabase/server';
import { createTenantServiceContext } from '@/lib/service/context';
import { tripService } from '@/features/trips/service';
import { bookingService } from '@/features/bookings/service';
import { companyTimeZone } from '@/features/trips/company-timezone';
import { addDays, dayKey, dayStartInstant } from '@/features/trips/day-groups';
import { PAGE_AR } from '@/features/dashboard/messages';
const cards=[
 {href:'/dashboard/routes',key:'routes',label:'Routes',hint:'Manage destinations and lines',icon:Route,permission:'routes.read'},
 {href:'/dashboard/buses',key:'buses',label:'Fleet',hint:'Vehicles and capacity',icon:BusFront,permission:'buses.read'},
 {href:'/dashboard/drivers',key:'drivers',label:'Drivers',hint:'Driver profiles and licenses',icon:Users,permission:'drivers.read'},
 {href:'/dashboard/trips',key:'trips',label:'Trips',hint:'Schedules and assignments',icon:CalendarDays,permission:'trips.read'},
 {href:'/dashboard/bookings',key:'bookings',label:'Bookings',hint:'Passengers and payments',icon:Ticket,permission:'bookings.read'},
 {href:'/dashboard/website',key:'website',label:'Website',hint:'Brand and contact settings',icon:Globe2,permission:'website.read'}];
export default async function DashboardPage(){
 const ctx=await requireTenant(); const visible=cards.filter(c=>ctx.membership.permissions.includes(c.permission));
 if (isSurfaceScoped('dashboard', ctx.membership.companyId)) {
  const has=(x:string)=>ctx.membership.permissions.includes(x);
  const sctx=createTenantServiceContext(await createClient(), ctx);
  const tz=await companyTimeZone(sctx); const today=dayKey(Date.now(),tz);
  const dayRange={from:dayStartInstant(today,tz),to:dayStartInstant(addDays(today,1),tz)};
  const cutoff=new Date(Date.now()-6*3600_000).toISOString();
  const [dayTrips,upcoming,unpaid]=await Promise.all([
   has('trips.read')?tripService.list(sctx,{page:1,pageSize:100,dir:'asc',...dayRange}):Promise.resolve(null),
   has('trips.read')?tripService.list(sctx,{page:1,pageSize:8,dir:'asc',from:cutoff}):Promise.resolve(null),
   has('bookings.read')?bookingService.list(sctx,{page:1,pageSize:1,sort:'trip_asc',tripFrom:cutoff,paymentStatus:'unpaid'}):Promise.resolve(null),
  ]);
  const live=dayTrips?.items.filter(t=>t.status!=='cancelled'&&t.status!=='draft')??null;
  return <OverviewMasarView companyName={ctx.membership.companyName} today={today} tz={tz} canWriteTrips={has('trips.write')}
   tripsToday={live?live.length:null} seatsBookedToday={live?live.reduce((n,t)=>n+t.seatsBooked,0):null} seatsCapacityToday={live?live.reduce((n,t)=>n+t.capacity,0):null}
   unpaid={unpaid?unpaid.total:null}
   next={upcoming?upcoming.items.filter(t=>t.status!=='cancelled'&&t.status!=='draft').slice(0,5).map(t=>({id:t.id,departureAt:t.departureAt,routeName:t.route?.name??'',originName:t.route?.originName??'',destinationName:t.route?.destinationName??'',seatsBooked:t.seatsBooked,capacity:t.capacity,status:t.status})):null}
   modules={visible.map(c=>({href:c.href,key:c.key,label:{en:c.label,ar:PAGE_AR[c.label]??c.label},icon:c.key as 'routes'|'buses'|'drivers'|'trips'|'bookings'|'website'}))} />;
 }
 return <div><PageHeader eyebrow="Operator workspace" title={<><Bi en="Welcome back," ar="أهلاً بعودتك،"/> {ctx.fullName.split(' ')[0]}</>} description="Here is your operations workspace. Choose a module to get started." action={<Link href="/dashboard/trips" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"><Plus size={16}/> <T>Create a trip</T></Link>}/>
 <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(c=>{const Icon=c.icon;return <Link key={c.key} href={c.href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"><div className="mb-5 flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Icon size={20}/></div><ArrowUpRight size={17} className="rtl:-scale-x-100 text-slate-300 transition group-hover:text-blue-600"/></div><h2 className="font-bold text-slate-900 dark:text-white"><T>{c.label}</T></h2><p className="mt-1 text-xs text-slate-600 dark:text-slate-400"><T>{c.hint}</T></p></Link>})}</div>
 <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-6 dark:border-blue-500/20 dark:from-blue-500/10 dark:to-slate-900"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-600"><T>Your workspace</T></p><h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{ctx.membership.companyName}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400"><T>Your company data is isolated from other operators. Access to each module is controlled by your assigned permissions.</T></p></section></div>
}