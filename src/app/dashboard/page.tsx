import { BusFront, CalendarDays, Route, Ticket, Users, Globe2 } from 'lucide-react';

import { requireTenant } from '@/lib/auth/guards';

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