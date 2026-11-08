'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { createTenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { bookingService } from '@/features/bookings/service';
import { websiteService } from '@/features/website/service';
import { AppError } from '@/lib/errors';
import { safeBookingsReturn, withFlash } from '@/features/bookings/filter-url';
const str=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const num=(f:FormData,k:string)=>Number(f.get(k));
async function ctx(){const auth=await requireTenant();return createTenantServiceContext(await createClient(),auth);}
export async function updateRouteAction(f:FormData){const c=await ctx();await routeService.update(c,str(f,'id'),{isActive:str(f,'isActive')==='true'});redirect('/dashboard/routes?notice=updated');}
export async function updateBusAction(f:FormData){const c=await ctx();await busService.update(c,str(f,'id'),{status:str(f,'status') as 'active'|'maintenance'|'inactive'});redirect('/dashboard/buses?notice=updated');}
export async function updateDriverAction(f:FormData){const c=await ctx();await driverService.update(c,str(f,'id'),{status:str(f,'status') as 'active'|'inactive'});redirect('/dashboard/drivers?notice=updated');}
const bookingsBack=(f:FormData)=>safeBookingsReturn(f.get('returnTo'));
export async function updateBookingStatusAction(f:FormData){const c=await ctx();await bookingService.setStatus(c,{bookingId:str(f,'id'),status:str(f,'status')});redirect(withFlash(bookingsBack(f),'notice','updated'));}
export async function updatePaymentStatusAction(f:FormData){const c=await ctx();await bookingService.setPaymentStatus(c,{bookingId:str(f,'id'),paymentStatus:str(f,'paymentStatus')});redirect(withFlash(bookingsBack(f),'notice','updated'));}
/** Staff-entered amount received. Accepts "50", "50.5", "50,5" and Arabic-Indic digits. The database bounds it by the booking total. */
export async function updateAmountPaidAction(f:FormData){
  const c=await ctx(),back=bookingsBack(f);
  const raw=str(f,'amount').replace(/[\u0660-\u0669]/g,d=>String(d.charCodeAt(0)-0x660)).replace('\u066B','.').replace(',','.');
  const amount=/^\d+(\.\d{1,2})?$/.test(raw)?Number(raw):NaN;
  let flash:string|null=null;
  try{await bookingService.setAmountPaid(c,{bookingId:str(f,'id'),amount});}
  catch(e){
    if(e instanceof AppError&&(e.code==='validation'||e.code==='business_rule'))flash=e.detail==='amount_exceeds_total'?'amount_exceeds_total':e.detail==='booking_not_cancellable'?'booking_not_cancellable':'amount_invalid';
    else throw e;
  }
  redirect(flash?withFlash(back,'error',flash):withFlash(back,'notice','updated'));
}
export async function saveWebsiteAction(f:FormData){const c=await ctx();await websiteService.updateSettings(c,{siteTitle:{en:str(f,'titleEn'),ar:str(f,'titleAr')},primaryColor:str(f,'primaryColor'),secondaryColor:str(f,'secondaryColor'),contactEmail:str(f,'contactEmail')||null,contactPhone:str(f,'contactPhone')||null,contactWhatsapp:str(f,'contactWhatsapp')||null,footerText:{en:str(f,'footerEn'),ar:str(f,'footerAr')}});redirect('/dashboard/website?notice=saved');}
