'use server';
import { revalidatePath } from 'next/cache';
import { requireCustomer } from '@/lib/auth/guards';
import { toClientError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { memberSubscriptionService, type MemberContext } from './service';
import type { DayState, TripOption } from './types';

/** Server actions for the member subscription pages. The guard is requireCustomer (signed-out -> login, staff -> their own area);
 *  no user id or company id is ever read from the client: the member comes from the session, the company from the plan / subscription row. */
export type MemberResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; code: string; detail?: string };

const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_');

async function run<T>(work: (c: MemberContext) => Promise<T>, paths: string[] = []): Promise<MemberResult<T>> {
  let data: T;
  try {
    const auth = await requireCustomer();
    data = await work({ db: await createClient(), userId: auth.userId });
  } catch (e) {
    if (isNextSignal(e)) throw e;
    const c = toClientError(e);
    return { ok: false, code: c.code, ...(c.detail ? { detail: c.detail } : {}) } as MemberResult<T>;
  }
  for (const p of paths) revalidatePath(p);
  return { ok: true, data } as MemberResult<T>;
}

export async function savePhoneAction(phone: string) { return run((c) => memberSubscriptionService.savePhone(c, { phone }), ['/my-subscriptions']); }
export async function requestPlanAction(planId: string) { return run((c) => memberSubscriptionService.request(c, { planId }), ['/my-subscriptions', '/my-subscriptions/plans']); }
export async function markNoticesReadAction() { return run((c) => memberSubscriptionService.markNoticesRead(c), ['/my-subscriptions']); }
export async function cancelSubscriptionAction(id: string) { return run((c) => memberSubscriptionService.cancel(c, id), ['/my-subscriptions']); }
export async function cancelSubscriberBookingAction(bookingId: string) { return run((c) => memberSubscriptionService.cancelBooking(c, bookingId), ['/my-subscriptions']); }

export async function loadDayAction(subscriptionId: string, day: string): Promise<MemberResult<{ trips: TripOption[]; state: DayState }>> {
  return run(async (c) => {
    const [trips, state] = await Promise.all([memberSubscriptionService.outboundOptions(c, { subscriptionId, day }), memberSubscriptionService.dayState(c, { subscriptionId, day })]);
    return { trips, state };
  });
}

export async function loadReturnOptionsAction(subscriptionId: string, outboundTripId: string): Promise<MemberResult<TripOption[]>> {
  return run((c) => memberSubscriptionService.returnOptions(c, { subscriptionId, outboundTripId }));
}

/** returnTripId = null means "not returning with this company today": only the go seat is booked. */
export async function bookSubscriberAction(subscriptionId: string, outboundTripId: string, returnTripId: string | null) {
  return run((c) => memberSubscriptionService.book(c, { subscriptionId, outboundTripId, ...(returnTripId ? { returnTripId } : {}) }), ['/my-subscriptions', `/my-subscriptions/${subscriptionId}/book`]);
}

/** What the marketplace profile tab shows: the member's MASAR ID and a summary of their subscriptions. Everything comes from the session. */
export type ProfileOverview = { masarId: string; subs: { id: string; planName: string; companyName: string; status: string; validTo: string | null }[] };
export async function loadProfileOverviewAction(): Promise<MemberResult<ProfileOverview>> {
  return run(async (c) => {
    const [profile, subs] = await Promise.all([memberSubscriptionService.profile(c), memberSubscriptionService.mine(c)]);
    return { masarId: profile.masarId, subs: subs.map((s) => ({ id: s.id, planName: s.planName, companyName: s.companyName, status: s.status, validTo: s.validTo })) };
  });
}
