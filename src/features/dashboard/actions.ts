'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { tripService } from '@/features/trips/service';
import { bookingService } from '@/features/bookings/service';
import { websiteService } from '@/features/website/service';
const str=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const num=(f:FormData,k:string)=>Number(f.get(k));
async function ctx(){const auth=await requireTenant();return createTenantServiceContext(await createClient(),auth);}
export async function createRouteAction(f:FormData){const c=await ctx();await routeService.create(c,{name:str(f,'name'),code:str(f,'code')||undefined,originName:str(f,'originName'),destinationName:str(f,'destinationName'),description:str(f,'description')||undefined});redirect('/dashboard/routes?notice=created');}
export async function updateRouteAction(f:FormData){const c=await ctx();await routeService.update(c,str(f,'id'),{isActive:str(f,'isActive')==='true'});redirect('/dashboard/routes?notice=updated');}
export async function createBusAction(f:FormData){const c=await ctx();await busService.create(c,{plateNumber:str(f,'plateNumber'),name:str(f,'name')||undefined,capacity:num(f,'capacity'),make:str(f,'make')||undefined,model:str(f,'model')||undefined,status:'active'});redirect('/dashboard/buses?notice=created');}
export async function updateBusAction(f:FormData){const c=await ctx();await busService.update(c,str(f,'id'),{status:str(f,'status') as 'active'|'maintenance'|'inactive'});redirect('/dashboard/buses?notice=updated');}
export async function createDriverAction(f:FormData){const c=await ctx();await driverService.create(c,{fullName:str(f,'fullName'),phone:str(f,'phone'),licenseNumber:str(f,'licenseNumber')||undefined,licenseExpiry:str(f,'licenseExpiry')||undefined,status:'active'});redirect('/dashboard/drivers?notice=created');}
export async function updateDriverAction(f:FormData){const c=await ctx();await driverService.update(c,str(f,'id'),{status:str(f,'status') as 'active'|'inactive'});redirect('/dashboard/drivers?notice=updated');}
export async function createTripAction(f:FormData){const c=await ctx();await tripService.createDraft(c,{routeId:str(f,'routeId'),busId:str(f,'busId')||null,driverId:str(f,'driverId')||null,departureAt:new Date(str(f,'departureAt')).toISOString(),arrivalAt:new Date(str(f,'arrivalAt')).toISOString(),price:num(f,'price'),capacity:num(f,'capacity'),notes:str(f,'notes')||undefined});redirect('/dashboard/trips?notice=draft_created');}
export async function transitionTripAction(f:FormData){const c=await ctx();await tripService.transition(c,{tripId:str(f,'id'),to:str(f,'to'),reason:str(f,'reason')||undefined});redirect('/dashboard/trips?notice=updated');}
export async function updateBookingStatusAction(f:FormData){const c=await ctx();await bookingService.setStatus(c,{bookingId:str(f,'id'),status:str(f,'status')});redirect('/dashboard/bookings?notice=updated');}
export async function updatePaymentStatusAction(f:FormData){const c=await ctx();await bookingService.setPaymentStatus(c,{bookingId:str(f,'id'),paymentStatus:str(f,'paymentStatus')});redirect('/dashboard/bookings?notice=updated');}
export async function saveWebsiteAction(f:FormData){const c=await ctx();await websiteService.updateSettings(c,{siteTitle:{en:str(f,'titleEn'),ar:str(f,'titleAr')},primaryColor:str(f,'primaryColor'),secondaryColor:str(f,'secondaryColor'),contactEmail:str(f,'contactEmail')||null,contactPhone:str(f,'contactPhone')||null,contactWhatsapp:str(f,'contactWhatsapp')||null,footerText:{en:str(f,'footerEn'),ar:str(f,'footerAr')}});redirect('/dashboard/website?notice=saved');}
