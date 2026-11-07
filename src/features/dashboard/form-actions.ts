'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth/guards';
import { AppError } from '@/lib/errors';
import { createTenantServiceContext, type TenantServiceContext } from '@/lib/service/context';
import { routeService } from '@/features/routes/service';
import { busService } from '@/features/buses/service';
import { driverService } from '@/features/drivers/service';
import { tripService } from '@/features/trips/service';
import { userService } from '@/features/users/service';
import { companyService } from '@/features/companies/service';
import { buildInviteUrl } from '@/features/users/invite-link';
import { planUsageService } from '@/features/subscriptions/usage-service';
import { errorState, successState, type FormState } from './form-state';

/**
 * Server actions that RETURN a FormState (instead of throwing into the error page) so a form can show what went wrong
 * and keep what the user typed. Authorization is unchanged: requireTenant() + the service's own permission check + RLS.
 * No company id is read from the form; the context derives it from the session.
 */
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const num = (f: FormData, k: string) => (str(f, k) === '' ? NaN : Number(str(f, k)));

async function ctx(): Promise<TenantServiceContext> {
  const auth = await requireTenant(); // redirects when signed out / no usable company
  return createTenantServiceContext(await createClient(), auth);
}

/** After a refusal that is about the plan, read the numbers again: the limit may have changed since the form loaded. */
async function failure(c: TenantServiceContext | null, e: unknown): Promise<FormState> {
  if (e instanceof AppError && (e.code === 'plan_limit' || e.code === 'subscription_required') && c) return errorState(e, await planUsageService.getOrNull(c));
  return errorState(e);
}

async function run(path: string, work: (c: TenantServiceContext) => Promise<void>): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await work(c);
  } catch (e) {
    return failure(c, e);
  }
  revalidatePath(path);
  return successState('created');
}

export async function createBusFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run('/dashboard/buses', async (c) => {
    await busService.create(c, { plateNumber: str(f, 'plateNumber'), name: str(f, 'name') || undefined, capacity: num(f, 'capacity'), make: str(f, 'make') || undefined, model: str(f, 'model') || undefined, status: 'active' });
  });
}

export async function createDriverFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run('/dashboard/drivers', async (c) => {
    await driverService.create(c, { fullName: str(f, 'fullName'), phone: str(f, 'phone'), licenseNumber: str(f, 'licenseNumber') || undefined, licenseExpiry: str(f, 'licenseExpiry') || undefined, status: 'active' });
  });
}

export async function createTripFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  return run('/dashboard/trips', async (c) => {
    const dep = new Date(str(f, 'departureAt'));
    const arr = new Date(str(f, 'arrivalAt'));
    if (Number.isNaN(dep.getTime()) || Number.isNaN(arr.getTime())) throw new AppError('validation', { fields: { departureAt: 'invalid' } });
    await tripService.createDraft(c, { routeId: str(f, 'routeId'), busId: str(f, 'busId') || null, driverId: str(f, 'driverId') || null, departureAt: dep.toISOString(), arrivalAt: arr.toISOString(), price: num(f, 'price'), capacity: num(f, 'capacity'), notes: str(f, 'notes') || undefined });
  });
}

function parseStops(f: FormData): unknown {
  try {
    return JSON.parse(str(f, 'stops'));
  } catch {
    throw new AppError('validation', { detail: 'stops_not_a_list' });
  }
}
const routeFields = (f: FormData) => ({ name: str(f, 'name'), code: str(f, 'code') || null, originName: str(f, 'originName'), destinationName: str(f, 'destinationName'), description: str(f, 'description') || null });

/** Create (no `id`) or update (`id`) a route together with its ordered stop list. */
export async function saveRouteFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  const id = str(f, 'id');
  let c: TenantServiceContext | null = null;
  let createdId: string | null = null;
  try {
    c = await ctx();
    if (id) {
      await routeService.updateWithStops(c, id, routeFields(f), parseStops(f));
    } else {
      const r = await routeService.createWithStops(c, routeFields(f), parseStops(f));
      createdId = r.route.id;
    }
  } catch (e) {
    return failure(c, e);
  }
  revalidatePath('/dashboard/routes');
  if (createdId) redirect(`/dashboard/routes/${createdId}?notice=created`);
  revalidatePath(`/dashboard/routes/${id}`);
  return successState('saved');
}

/** Team and Drivers show the same people: every change to one must refresh the other. */
function revalidateTeam() {
  revalidatePath('/dashboard/users');
  revalidatePath('/dashboard/drivers');
}

/** Invite a teammate. The raw token is returned to THIS request only (shown once); it is never stored or logged here. */
export async function createInviteFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    const roleKey = str(f, 'roleKey');
    // a driver login must belong to a driver record (0026): that path has its own RPC
    const created = roleKey === 'driver'
      ? await userService.inviteDriver(c, { driverId: str(f, 'driverId'), email: str(f, 'email') })
      : await userService.createInvite(c, { email: str(f, 'email'), roleKey });
    revalidateTeam();
    return successState('created', { url: buildInviteUrl(created.token), expiresAt: created.expiresAt });
  } catch (e) {
    return failure(c, e);
  }
}

export async function setMemberRoleFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await userService.setMemberRole(c, str(f, 'memberId'), { roleKey: str(f, 'roleKey') });
  } catch (e) {
    return failure(c, e);
  }
  revalidateTeam();
  return successState('saved');
}

export async function setMemberStatusFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await userService.setMemberStatus(c, str(f, 'memberId'), str(f, 'status'));
  } catch (e) {
    return failure(c, e);
  }
  revalidateTeam();
  return successState('saved');
}

export async function revokeInviteFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await userService.revokeInvite(c, str(f, 'inviteId'));
  } catch (e) {
    return failure(c, e);
  }
  revalidateTeam();
  return successState('saved');
}

/** Company settings (settings.write; RLS also enforces it). The company comes from the session, never from the form. */
export async function updateSettingsFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await companyService.updateSettings(c, {
      timezone: str(f, 'timezone'),
      currency: str(f, 'currency').toUpperCase(),
      defaultLocale: str(f, 'defaultLocale'),
      supportedLocales: f.getAll('supportedLocales').map(String),
      bookingEnabled: f.get('bookingEnabled') === 'on',
      allowGuestBooking: f.get('allowGuestBooking') === 'on',
      bookingCutoffMinutes: num(f, 'bookingCutoffMinutes'),
      cancellationWindowHours: num(f, 'cancellationWindowHours'),
      maxSeatsPerBooking: num(f, 'maxSeatsPerBooking'),
      tripBufferMinutes: num(f, 'tripBufferMinutes'),
    });
    revalidatePath('/dashboard/settings');
    return successState('saved');
  } catch (e) {
    return failure(c, e);
  }
}

/** From the Drivers page: invite a login for ONE driver record. */
export async function inviteDriverFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    const created = await userService.inviteDriver(c, { driverId: str(f, 'driverId'), email: str(f, 'email') });
    revalidateTeam();
    return successState('created', { url: buildInviteUrl(created.token), expiresAt: created.expiresAt });
  } catch (e) {
    return failure(c, e);
  }
}

/** From the Drivers page: attach an existing team member to a driver record (repairs pre-0026 data). */
export async function linkDriverFormAction(_prev: FormState, f: FormData): Promise<FormState> {
  let c: TenantServiceContext | null = null;
  try {
    c = await ctx();
    await userService.linkDriverLogin(c, { driverId: str(f, 'driverId'), memberId: str(f, 'memberId') });
  } catch (e) {
    return failure(c, e);
  }
  revalidateTeam();
  return successState('saved');
}
